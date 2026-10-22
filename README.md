# Agent Eval

A generic, project-agnostic CLI + web UI for fast, cheap feedback loops on the
non-deterministic (LLM) parts of an agentic system. Completely decoupled from
any project or database: prompts and outputs are passed directly as arguments
or files.

## Usage

```bash
cd utils/prompt-lab

# Web UI
deno task serve                                    # http://127.0.0.1:8799

deno task doctor                                   # validate .env / LLM connectivity

# One-shot run
deno run --allow-env --allow-net --allow-read cli.ts run --system "You are helpful." --user "Hi"
deno run --allow-env --allow-net --allow-read cli.ts run --system-file sys.txt --user-file prompt.txt
deno run --allow-env --allow-net --allow-read cli.ts run --system-file sys.txt --user-file prompt.txt --json

# Eval batch
deno run --allow-env --allow-net --allow-read cli.ts eval cases.json

# Interactive REPL (editable prompts + llm config)
deno run --allow-env --allow-net --allow-read cli.ts repl
```

## Environment (llm config)

- `PROVIDER_BASE_URL` (default `http://127.0.0.1:11434/v1`)
- `PROVIDER_API_KEY` (default `ollama`)
- `PROVIDER_MODEL` (required)
- `PROVIDER_MAX_TOKENS` (default 2048)
- `PROVIDER_TIMEOUT_MS` (default 120000)

Also loads `.env`, `.env.local`, `.env.functions.local` from the working directory.

## API keys and secrets

Do not commit API keys. Recommended options:

- Environment variable at runtime:
  `PROVIDER_API_KEY=... deno task serve`
- A protected key file (mode `600`) referenced by path:
  `PROVIDER_API_KEY_FILE=/path/to/secret.key deno task serve`
  Create it with `install -m 600 /dev/null ~/.config/agent-eval.key` and write the key into it.
- A password manager / secret manager that injects the environment variable, e.g.
  `PROVIDER_API_KEY="$(pass show agent-eval)" deno task serve`

`.env`, `.env.local`, `.env.functions.local`, and common secret files are gitignored.
Run `deno task doctor` to verify the configured endpoint and model are reachable.


## Eval cases (JSON)

```json
[
  { "id": "greet", "systemPrompt": "Reply JSON {answer}.", "prompt": "2+2?", "contains": ["4"] }
]
```

Fields: `systemPrompt`/`systemPromptFile`, `prompt`/`promptFile`, `contains`,
`notContains`, `jsonPath: { path, equals }`.

## Extra context

Pass static context (retrieved rows, tool outputs, etc.) without executing tools:

```bash
deno run --allow-env --allow-net --allow-read cli.ts run \
  --system-file sys.txt --user-file prompt.txt --context-file context.txt
```

In eval cases use `"context"` or `"contextFile"`. In the web UI use the **Extra context** box.

## CI usage

```bash
deno run --allow-env --allow-net --allow-read cli.ts eval cases.json
echo "exit code: $?"
```

Prompts and expected checks live in version-controlled JSON files; no database
or project coupling required.