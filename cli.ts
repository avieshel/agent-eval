// Agent Eval — generic, project-agnostic CLI + web UI for fast LLM prompt feedback.
//
// Usage:
//   deno run --allow-env --allow-net --allow-read cli.ts serve
//   deno run --allow-env --allow-net --allow-read cli.ts run --system "..." --user "..."
//   deno run --allow-env --allow-net --allow-read cli.ts run --system-file sys.txt --user-file prompt.txt
//   deno run --allow-env --allow-net --allow-read cli.ts eval cases.json
//   deno run --allow-env --allow-net --allow-read cli.ts repl
//
// Environment:
//   PROVIDER_BASE_URL, PROVIDER_API_KEY, PROVIDER_MODEL, PROVIDER_MAX_TOKENS, PROVIDER_TIMEOUT_MS

import { PAGE } from './ui/page.ts'
import { getProviderConfig, runPrompt, checkProvider } from './core/provider.ts'
import { loadLocalEnv, hostFriendlyBaseUrl } from './core/env.ts'
import type { EvalCase, ModelResult } from './core/types.ts'

const PORT = Number.parseInt(Deno.env.get('AGENT_EVAL_PORT') ?? '8799', 10)

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) { out[key] = next; i++ } else { out[key] = true }
    } else if (out._pos === undefined) {
      out._pos = a
    } else if (out._pos2 === undefined) {
      out._pos2 = a
    }
  }
  return out
}

function readTextOrFile(value?: string, file?: string): string {
  if (file) return Deno.readTextFileSync(file)
  return value ?? ''
}

function loadCases(path: string): EvalCase[] {
  const text = Deno.readTextFileSync(path)
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('cases file must be an array')
  return parsed as EvalCase[]
}

function scoreResult(result: ModelResult, c: EvalCase): { passed: boolean; failures: string[] } {
  const failures: string[] = []
  if (result.error) { failures.push(`${result.error.kind}: ${result.error.message}`); return { passed: false, failures } }
  for (const s of c.contains ?? []) if (!result.rawText.includes(s)) failures.push(`missing expected text: ${s}`)
  for (const s of c.notContains ?? []) if (result.rawText.includes(s)) failures.push(`unexpected text present: ${s}`)
  if (c.jsonPath) {
    const parts = c.jsonPath.path.split('.')
    let cur: unknown = result.parsed
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p]
      else { cur = undefined; break }
    }
    if (c.jsonPath.equals !== undefined && cur !== c.jsonPath.equals) {
      failures.push(`jsonPath ${c.jsonPath.path} expected ${JSON.stringify(c.jsonPath.equals)} got ${JSON.stringify(cur)}`)
    }
  }
  return { passed: failures.length === 0, failures }
}

async function cmdRun(args: string[]): Promise<number> {
  const opts = parseArgs(args)
  const config = getProviderConfig()
  const systemPrompt = readTextOrFile(opts.system as string | undefined, opts['system-file'] as string | undefined)
  const userPrompt = readTextOrFile(opts.user as string | undefined, opts['user-file'] as string | undefined)
  const context = readTextOrFile(opts.context as string | undefined, opts['context-file'] as string | undefined)
  if (!userPrompt.trim()) { console.error('Provide --user or --user-file'); return 1 }
  const result = await runPrompt(config, systemPrompt, userPrompt, { jsonMode: Boolean(opts.json), context })
  console.log(JSON.stringify(result, null, 2))
  return result.error ? 1 : 0
}

async function cmdEval(args: string[]): Promise<number> {
  const opts = parseArgs(args)
  const path = (opts._pos as string) || args.find((a) => !a.startsWith('--'))
  if (!path) { console.error('Usage: eval <cases.json>'); return 1 }
  const cases = loadCases(path as string)
  const config = getProviderConfig()
  console.log(`Running ${cases.length} cases against ${config.model}...`)
  let failures = 0
  for (const c of cases) {
    const systemPrompt = c.systemPromptFile ? Deno.readTextFileSync(c.systemPromptFile) : (c.systemPrompt ?? '')
    const userPrompt = c.promptFile ? Deno.readTextFileSync(c.promptFile) : c.prompt
    const context = c.contextFile ? Deno.readTextFileSync(c.contextFile) : (c.context ?? '')
    const result = await runPrompt(config, systemPrompt, userPrompt, { jsonMode: true, context })
    const score = scoreResult(result, c)
    const ok = score.passed
    if (!ok) failures++
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${c.id}${score.failures.length ? ` (${score.failures.join('; ')})` : ''}`)
  }
  console.log(`\n${cases.length - failures}/${cases.length} passed.`)
  return failures === 0 ? 0 : 1
}

// Interactive REPL with editable system/user prompts and llm config.
async function cmdRepl(): Promise<void> {
  let systemPrompt = ''
  let userPrompt = ''
  let context = ''
  console.log('Agent Eval REPL. Commands:')
  console.log('  /system <text>        set system prompt')
  console.log('  /system-file <path>   load system prompt from file')
  console.log('  /user <text>          set user prompt')
  console.log('  /user-file <path>     load user prompt from file')
  console.log('  /context <text>       set extra context')
  console.log('  /context-file <path>  load extra context from file')
  console.log('  /config               show llm config')
  console.log('  /set <key> <value>    set PROVIDER_* (base-url|model|api-key|max-tokens|timeout-ms)')
  console.log('  /run                  run current prompts')
  console.log('  /quit                 exit')
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true })
    let idx = buffer.indexOf('\n')
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      idx = buffer.indexOf('\n')
      if (line.length === 0) continue
      if (line === '/quit' || line === '/exit') Deno.exit(0)
      if (line.startsWith('/system-file ')) { systemPrompt = Deno.readTextFileSync(line.slice(13).trim()); console.log('system prompt loaded'); continue }
      if (line.startsWith('/system ')) { systemPrompt = line.slice(8); console.log('system prompt set'); continue }
      if (line === '/system') { systemPrompt = ''; console.log('system prompt cleared'); continue }
      if (line.startsWith('/user-file ')) { userPrompt = Deno.readTextFileSync(line.slice(11).trim()); console.log('user prompt loaded'); continue }
      if (line.startsWith('/user ')) { userPrompt = line.slice(6); console.log('user prompt set'); continue }
      if (line === '/user') { userPrompt = ''; console.log('user prompt cleared'); continue }
      if (line.startsWith('/context-file ')) { context = Deno.readTextFileSync(line.slice(14).trim()); console.log('context loaded'); continue }
      if (line.startsWith('/context ')) { context = line.slice(9); console.log('context set'); continue }
      if (line === '/context') { context = ''; console.log('context cleared'); continue }
      if (line === '/config') { console.log(JSON.stringify(getProviderConfig(), null, 2)); continue }
      if (line.startsWith('/set ')) {
        const [key, ...rest] = line.slice(5).split(/\s+/)
        const value = rest.join(' ')
        switch (key) {
          case 'base-url': Deno.env.set('PROVIDER_BASE_URL', value); break
          case 'model': Deno.env.set('PROVIDER_MODEL', value); break
          case 'api-key': Deno.env.set('PROVIDER_API_KEY', value); break
          case 'max-tokens': Deno.env.set('PROVIDER_MAX_TOKENS', value); break
          case 'timeout-ms': Deno.env.set('PROVIDER_TIMEOUT_MS', value); break
          default: console.log('unknown key'); continue
        }
        console.log(`${key} updated`)
        continue
      }
      if (line === '/run') {
        if (!userPrompt.trim()) { console.log('set /user first'); continue }
        const config = getProviderConfig()
        const result = await runPrompt(config, systemPrompt, userPrompt, { jsonMode: false, context })
        if (result.error) console.log('ERR', result.error.kind, result.error.message)
        else console.log(result.rawText)
        const usage = result.usage ? `, ${result.usage.totalTokens} tokens (prompt ${result.usage.promptTokens}, completion ${result.usage.completionTokens})` : ''
        console.log(`(${result.elapsedMs}ms${usage})`)
        continue
      }
      // default: treat as user prompt append? Just set
      userPrompt = line
      console.log('user prompt set (use /run)')
    }
  }
}

async function cmdDoctor(): Promise<number> {
  const config = getProviderConfig()
  console.log('Validating Agent Eval setup...')
  console.log('Config:')
  console.log(JSON.stringify({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey ? `***${config.apiKey.slice(-4)}` : '(empty)',
    model: config.model,
    maxTokens: config.maxTokens,
    timeoutMs: config.timeoutMs,
  }, null, 2))

  const keyFile = Deno.env.get('PROVIDER_API_KEY_FILE') ?? Deno.env.get('PROVIDER_API_KEY_PATH')
  if (keyFile) {
    try {
      const st = Deno.statSync(keyFile)
      const mode = (st.mode ?? 0) & 0o777
      console.log(`Key file: ${keyFile} (mode ${mode.toString(8).padStart(3, '0')})`)
      if (mode & 0o077) {
        console.log('WARNING: key file is readable by group/others; run: chmod 600 ' + keyFile)
      }
    } catch (err) {
      console.error('Key file is not readable:', err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  if (!config.model) {
    console.error('FAIL: PROVIDER_MODEL is not set')
    return 1
  }

  if (!keyFile && config.apiKey && config.apiKey !== 'ollama') {
    console.log('Tip: the API key is currently loaded from the environment or a .env file (plain text).')
    console.log('      For stronger protection, use PROVIDER_API_KEY_FILE or a secret manager.')
  }

  const result = await checkProvider(config)
  if (!result.ok) {
    console.error(`FAIL: ${result.message}`)
    return 1
  }
  console.log(`OK: ${config.model} responded in ${result.elapsedMs}ms${result.usage ? ` (${result.usage.totalTokens} tokens)` : ''}`)
  if (result.message) console.log(`Sample: ${result.message}`)
  return 0
}

function cmdServe(): void {
  const config = getProviderConfig()
  Deno.serve({ hostname: '127.0.0.1', port: PORT }, async (req) => {
    const url = new URL(req.url)
    if (url.pathname === '/') return new Response(PAGE, { headers: { 'Content-Type': 'text/html' } })
    if (url.pathname === '/api/config') return json(getProviderConfig())
    if (url.pathname === '/api/doctor') return json(await checkProvider(getProviderConfig()))
    if (url.pathname === '/api/run' && req.method === 'POST') {
      const body = await req.json().catch(() => null) as { systemPrompt?: string; userPrompt?: string; context?: string; jsonMode?: boolean } | null
      const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt : ''
      const userPrompt = typeof body?.userPrompt === 'string' ? body.userPrompt : ''
      const context = typeof body?.context === 'string' ? body.context : ''
      if (!userPrompt.trim()) return json({ error: 'userPrompt is required' }, 400)
      const result = await runPrompt(getProviderConfig(), systemPrompt, userPrompt, { jsonMode: Boolean(body?.jsonMode), context })
      return json(result)
    }
    return json({ error: 'not found' }, 404)
  })
  console.log(`Agent Eval on http://127.0.0.1:${PORT}`)
}

function usage(): void {
  console.log(`Agent Eval
Commands:
  serve                                      Start web UI
  doctor                                     Validate .env / LLM connectivity
  run [--system "..."] [--user "..."]         Run one prompt (or --*-file)
       [--context "..."] [--context-file path]
  eval <cases.json>                          Run eval cases
  repl                                       Interactive REPL
`)
}

async function main(): Promise<number> {
  loadLocalEnv()
  const rewritten = hostFriendlyBaseUrl(Deno.env.get('PROVIDER_BASE_URL'))
  if (rewritten && rewritten !== Deno.env.get('PROVIDER_BASE_URL')) Deno.env.set('PROVIDER_BASE_URL', rewritten)
  const [cmd, ...rest] = Deno.args
  switch (cmd) {
    case 'serve':
      cmdServe()
      await new Promise(() => {})
      return 0
    case 'doctor':
    case 'validate':
      return await cmdDoctor()
    case 'run':
      return await cmdRun(rest)
    case 'eval':
      return await cmdEval(rest)
    case 'repl':
      await cmdRepl()
      return 0
    case undefined:
    case 'help':
    default:
      usage()
      return 0
  }
}

Deno.exit(await main())