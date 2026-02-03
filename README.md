# Push Voice Tasks

[![npm version](https://img.shields.io/npm/v/@masslessai/push-todo)](https://www.npmjs.com/package/@masslessai/push-todo)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blue)](https://github.com/MasslessAI/push-todo-cli)

Capture coding tasks by voice on your iPhone → work on them in Claude Code.

---

## Install

```bash
npm install -g @masslessai/push-todo
```

This single command installs everything:
- `push-todo` CLI command
- Claude Code plugin integration (`/push-todo`)
- Native binary for E2EE (macOS)

Then run:
```bash
push-todo connect
```

---

## Usage

| Command | Description |
|---------|-------------|
| `push-todo` | List tasks for current project |
| `push-todo 427` | Show task #427 |
| `push-todo connect` | Connect account, fix issues |
| `push-todo search "auth"` | Search tasks |
| `push-todo review` | Review completed tasks |
| `push-todo watch` | Live daemon monitor |
| `push-todo --help` | All options |

**In Claude Code**, use `/push-todo` or just say "show my Push tasks".

---

## How It Works

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   iPhone    │───▶│    Push     │───▶│ Claude Code │
│  (voice)    │    │   (sync)    │    │   (work)    │
└─────────────┘    └─────────────┘    └─────────────┘
```

1. **Capture** — Speak your task on the Push iOS app
2. **AI Processing** — Push extracts summary and routes to project
3. **Notification** — "You have 3 tasks from your iPhone"
4. **Work** — Select a task, Claude helps implement it
5. **Complete** — Mark done, syncs back to phone

---

## Updates

```bash
npm update -g @masslessai/push-todo
```

Or run `push-todo connect` to check for updates.

---

## Requirements

- [Push iOS app](https://pushto.do) — voice-powered task capture
- Node.js 18+
- Claude Code (or OpenAI Codex, Clawdbot)

---

## Other Clients

### OpenAI Codex

```bash
curl -fsSL https://raw.githubusercontent.com/MasslessAI/push-todo-cli/main/codex/install-codex.sh | bash
```

Then run `$push-todo connect`.

### Clawdbot

```bash
curl -fsSL https://raw.githubusercontent.com/MasslessAI/push-todo-cli/main/clawdbot/install-clawdbot.sh | bash
```

Then run `/push-todo connect`.

---

## Troubleshooting

**Most issues fixed by:**
```bash
push-todo connect
```

This will re-authenticate, update, and re-register your project.

**Check config:**
```bash
cat ~/.config/push/config
```

**Uninstall:**
```bash
npm uninstall -g @masslessai/push-todo
```

---

## Support

- Website: [pushto.do](https://pushto.do)
- Issues: [GitHub Issues](https://github.com/MasslessAI/push-todo-cli/issues)

---

MIT License
