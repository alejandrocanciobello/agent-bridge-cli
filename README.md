# agentbridge

Unified CLI to drive **Claude Code**, **Hermes Agent**, and **OpenAI Codex** from one command.

> **Note on “Cloud Code”:** treated as **Claude Code** (`claude` / Anthropic). Alias: `agentbridge run cloud "…"`.

---

## English — Install & use

### Requirements
- Node.js 20+
- One or more agent CLIs on your `PATH` (optional for `status`; required to actually run)

### Install (local)

```bash
cd agent-bridge-cli
npm install
npm run build
npm link          # exposes `agentbridge` and `ab` on PATH
```

Or run without linking:

```bash
node ./bin/agentbridge.js status
```

### Commands

```bash
agentbridge status
agentbridge run claude "Summarize this repo"
agentbridge run hermes "List main entrypoints"
agentbridge run codex  "What should we ship next?"
agentbridge run all    "Explain the project structure"
agentbridge compare    "Propose the next shipping task"
agentbridge run claude -C ~/code/my-app "Fix failing tests"
```

Aliases: `ab` → same binary; `cloud` / `claude-code` → Claude; `openai` → Codex.

### What each provider runs

| Provider | Binary | One-shot invocation |
| --- | --- | --- |
| Claude Code | `claude` | `claude -p "…"` |
| Hermes | `hermes` | `hermes -z "…"` (oneshot; overrideable) |
| Codex | `codex` | `codex exec "…"` |

Results for `run all` / `compare` land in `./.agentbridge/runs/<timestamp>/` (`*.stdout.txt`, `*.stderr.txt`, `*.meta.json`, `compare.md`).

### Config

`~/.agentbridge/config.toml` (created on first `status` / `init-config`):

```toml
timeout_ms = 600000
# default_provider = "claude"

# [providers.hermes]
# # Prefer classic query mode instead of oneshot:
# run_args = ["chat", "-q", "{prompt}"]

# [providers.codex]
# extra_flags = ["--skip-git-repo-check"]
```

### Install the underlying agents

```bash
# Claude Code
npm i -g @anthropic-ai/claude-code

# Codex
npm i -g @openai/codex
# or: curl -fsSL https://chatgpt.com/codex/install.sh | sh

# Hermes
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc && hermes setup
```

### Smoke test (no API keys)

```bash
npm run smoke
```

---

## Español — Instalación y uso

### Requisitos
- Node.js 20+
- Los CLIs de los agentes en tu `PATH` (opcionales para `status`)

### Instalar

```bash
cd agent-bridge-cli
npm install && npm run build && npm link
```

### Comandos

```bash
agentbridge status
agentbridge run claude "Resume este repo"
agentbridge run hermes "Lista los entrypoints"
agentbridge run codex  "¿Qué conviene shippear?"
agentbridge run all    "Explica la estructura del proyecto"
agentbridge compare    "Propón la siguiente tarea de shipping"
```

`Cloud Code` = **Claude Code**. Alias: `agentbridge run cloud "…"`.

Artefactos de `run all` / `compare`: `./.agentbridge/runs/<timestamp>/`.

Config: `~/.agentbridge/config.toml`.

### Test rápido (sin API keys)

```bash
npm run smoke
```

---

## License

MIT
