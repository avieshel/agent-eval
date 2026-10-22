// Generic types for the prompt-lab utility.

export interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  timeoutMs: number
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

export interface EvalCase {
  id: string
  systemPrompt?: string
  systemPromptFile?: string
  prompt: string
  promptFile?: string
  context?: string
  contextFile?: string
  // Optional simple checks against raw text or parsed JSON.
  contains?: string[]
  notContains?: string[]
  jsonPath?: { path: string; equals?: unknown }
}

export interface ScoreResult {
  passed: boolean
  failures: string[]
}

export interface TraceRecord {
  id?: string
  system_prompt?: string
  user_content?: string
  raw_content?: string | null
  parsed_outcome?: string | null
  model?: string
  created_at?: string
  [key: string]: unknown
}