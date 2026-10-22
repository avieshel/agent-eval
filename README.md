# Agent Eval

A small, friendly CLI and web UI for fast, low-cost feedback loops on the
non-deterministic (LLM) parts of an agentic system.

It is intentionally generic and project-agnostic: prompts and outputs are passed
directly as arguments or files, with no database or project coupling.

## Quick start

From the project directory:

```bash
deno task serve
```

Then open `http://127.0.0.1:8799` in your browser.

To check that your setup can reach the configured model:

```bash
deno task doctor
```

## Usage

### Web UI

```bash
deno task serve
```

### One-shot run

```bash
deno run --allow-env --allow-net --allow-read cli.ts run \
  --system "You are helpful." \
  --user "Hi"
```

```bash
deno run --allow-env --allow-net --allow-read cli.ts run \
  --system-file sys.txt \
  --user-file prompt.txt
```

```bash
deno run --allow-env --allow-net --allow-read cli.ts run \
  --system-file sys.txt \
  --user-file prompt.txt \
  --json
```

### Eval batch

```bash
deno run --allow-env --allow-net --allow-read cli.ts eval cases.json
```

### Interactive REPL

```bash
deno run --allow-env --allow-net --allow-read cli.ts repl
```

The REPL lets you edit prompts and LLM settings interactively.

## Environment (LLM config)

| Variable | Default | Notes |
| --- | --- | --- |
| `PROVIDER_BASE_URL` | `http://127.0.0.1:11434/v1` | OpenAI-compatible endpoint |
| `PROVIDER_API_KEY` | `ollama` | API key, if required |
| `PROVIDER_MODEL` | _(required)_ | Model name to use |
| `PROVIDER_MAX_TOKENS` | `2048` | Maximum response tokens |
| `PROVIDER_TIMEOUT_MS` | `120000` | Request timeout in milliseconds |

The tool also loads `.env` and `.env.*` files (for example `.env.local`) from the
working directory. Values already present in the environment take precedence.

## API keys and secrets

Please avoid storing API keys in plain text whenever possible. A `.env` file is convenient, but it is still plain text on disk. For better protection, prefer one of these alternatives:

- Set the key at runtime:

  ```bash
  PROVIDER_API_KEY=... deno task serve
  ```

- Use a protected key file (mode `600`) and reference it by path:

  ```bash
  PROVIDER_API_KEY_FILE=/path/to/secret.key deno task serve
  ```

  You can create such a file with:

  ```bash
  install -m 600 /dev/null ~/.config/agent-eval.key
  ```

  Then write your key into it.

- Or let a password manager inject it:

  ```bash
  PROVIDER_API_KEY="$(pass show agent-eval)" deno task serve
  ```

Even though `.env` files are gitignored, they remain readable on disk. If your key grants access to a paid or sensitive service, the protected file or secret-manager options above are recommended.

`.env` and `.env.*` files, along with common secret files, are gitignored.
Run `deno task doctor` to verify that the configured endpoint and model are
reachable.

## Eval cases (JSON)

```json
[
  {
    "id": "greet",
    "systemPrompt": "Reply JSON {answer}.",
    "prompt": "2+2?",
    "contains": ["4"]
  }
]
```

Supported fields:

- `systemPrompt` / `systemPromptFile`
- `prompt` / `promptFile`
- `context` / `contextFile`
- `contains`
- `notContains`
- `jsonPath: { path, equals }`

## Extra context

You can pass static context, such as retrieved rows or tool outputs, without
executing any tools:

```bash
deno run --allow-env --allow-net --allow-read cli.ts run \
  --system-file sys.txt \
  --user-file prompt.txt \
  --context-file context.txt
```

In eval cases, use `"context"` or `"contextFile"`. In the web UI, use the
**Extra context** box.

## CI usage

```bash
deno run --allow-env --allow-net --allow-read cli.ts eval cases.json
echo "exit code: $?"
```

Prompts and expected checks can live in version-controlled JSON files. There is
no database or project coupling required.
