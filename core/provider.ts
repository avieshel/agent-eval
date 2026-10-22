// Generic OpenAI-compatible provider adapter.
//
// No project-specific assumptions. Reads configuration from environment
// variables so the same binary works against Ollama, OpenAI, OpenRouter, etc.

export interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  timeoutMs: number
}

function readApiKeyFromFile(path: string): string {
  try {
    return Deno.readTextFileSync(path).trim()
  } catch {
    return ''
  }
}

export function getProviderConfig(): ProviderConfig {
  const keyFile = Deno.env.get('PROVIDER_API_KEY_FILE') ?? Deno.env.get('PROVIDER_API_KEY_PATH')
  const apiKey = keyFile
    ? readApiKeyFromFile(keyFile)
    : (Deno.env.get('PROVIDER_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? 'ollama')
  return {
    baseUrl: (Deno.env.get('PROVIDER_BASE_URL') ?? 'http://127.0.0.1:11434/v1').replace(/\/+$/, ''),
    apiKey,
    model: Deno.env.get('PROVIDER_MODEL') ?? Deno.env.get('MODEL') ?? '',
    maxTokens: Number.parseInt(Deno.env.get('PROVIDER_MAX_TOKENS') ?? '2048', 10) || 2048,
    timeoutMs: Number.parseInt(Deno.env.get('PROVIDER_TIMEOUT_MS') ?? '120000', 10) || 120000,
  }
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ModelResult {
  ok: boolean
  elapsedMs: number
  model: string
  baseUrl: string
  systemPrompt: string
  userPrompt: string
  context?: string
  rawText: string
  parsed: unknown
  usage?: TokenUsage
  error?: { kind: string; message: string }
}

export function parseJson(text: string): unknown {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { /* fall through */ }
  }
  // try array
  const a = trimmed.indexOf('[')
  const b = trimmed.lastIndexOf(']')
  if (a !== -1 && b > a) {
    try { return JSON.parse(trimmed.slice(a, b + 1)) } catch { /* fall through */ }
  }
  return undefined
}

export async function runPrompt(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  opts: { jsonMode?: boolean; context?: string } = {},
): Promise<ModelResult> {
  const base: ModelResult = {
    ok: false,
    elapsedMs: 0,
    model: config.model,
    baseUrl: config.baseUrl,
    systemPrompt,
    userPrompt,
    context: opts.context,
    rawText: '',
    parsed: undefined,
  }
  if (!config.model) {
    return { ...base, error: { kind: 'config', message: 'PROVIDER_MODEL is not set' } }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  const started = performance.now()
  const context = (opts.context ?? '').trim()
  const userContent = context
    ? `Context:\n<context>\n${context}\n</context>\n\nTask:\n${userPrompt}`
    : userPrompt
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }
    if (opts.jsonMode) body.response_format = { type: 'json_object' }
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ...base, elapsedMs: Math.round(performance.now() - started), error: { kind: 'status', message: `provider returned ${res.status}: ${text.slice(0, 500)}` } }
    }
    const rawTextBody = await res.text()
    let json: { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
    try { json = JSON.parse(rawTextBody) } catch {
      return { ...base, elapsedMs: Math.round(performance.now() - started), error: { kind: 'shape', message: `non-JSON body: ${rawTextBody.slice(0, 500)}` } }
    }
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return { ...base, elapsedMs: Math.round(performance.now() - started), rawText: rawTextBody, error: { kind: 'shape', message: 'missing content' } }
    }
    const parsed = parseJson(content)
    const usage = json.usage
      ? {
          promptTokens: Number(json.usage.prompt_tokens ?? 0),
          completionTokens: Number(json.usage.completion_tokens ?? 0),
          totalTokens: Number(json.usage.total_tokens ?? 0),
        }
      : undefined
    return {
      ok: true,
      elapsedMs: Math.round(performance.now() - started),
      model: config.model,
      baseUrl: config.baseUrl,
      systemPrompt,
      userPrompt,
      context: opts.context,
      rawText: content,
      parsed,
      usage,
    }
  } catch (err) {
    const kind = err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'network'
    const message = err instanceof Error ? err.message : String(err)
    return { ...base, elapsedMs: Math.round(performance.now() - started), error: { kind, message } }
  } finally {
    clearTimeout(timer)
  }
}


export interface ProviderCheckResult {
  ok: boolean
  elapsedMs: number
  message: string
  status?: number
  usage?: TokenUsage
}

export async function checkProvider(config: ProviderConfig): Promise<ProviderCheckResult> {
  if (!config.model) return { ok: false, elapsedMs: 0, message: 'PROVIDER_MODEL is not set' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 30000))
  const started = performance.now()
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Reply with OK' }],
      }),
      signal: controller.signal,
    })
    const elapsedMs = Math.round(performance.now() - started)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, elapsedMs, status: res.status, message: `provider returned ${res.status}: ${text.slice(0, 500)}` }
    }
    const body = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null
    const usage = body?.usage
      ? {
          promptTokens: Number(body.usage.prompt_tokens ?? 0),
          completionTokens: Number(body.usage.completion_tokens ?? 0),
          totalTokens: Number(body.usage.total_tokens ?? 0),
        }
      : undefined
    return { ok: true, elapsedMs, message: body?.choices?.[0]?.message?.content?.slice(0, 100) ?? 'OK', usage }
  } catch (err) {
    const kind = err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'network'
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, elapsedMs: Math.round(performance.now() - started), message: `${kind}: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}
