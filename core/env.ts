// Minimal .env loader, dependency-free. Values already in the environment win.

export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim().replace(/^export\s+/, '')
    if (line.length === 0 || line.startsWith('#')) continue
    const sep = line.indexOf('=')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    if (key.length === 0) continue
    let value = line.slice(sep + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export function loadLocalEnv(path?: string): string[] {
  const candidates = path ? [path] : ['.env', '.env.local', '.env.functions.local']
  const applied: string[] = []
  for (const p of candidates) {
    let contents: string
    try { contents = Deno.readTextFileSync(p) } catch { continue }
    for (const [key, value] of Object.entries(parseEnvFile(contents))) {
      if (Deno.env.get(key) !== undefined) continue
      Deno.env.set(key, value)
      applied.push(key)
    }
  }
  return applied
}

export function hostFriendlyBaseUrl(baseUrl: string | undefined): string | undefined {
  return baseUrl?.replace('//host.docker.internal', '//127.0.0.1')
}