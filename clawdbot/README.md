# Push Voice Tasks for Clawdbot

Receive and work on voice tasks captured on your iPhone using the Push app.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/MasslessAI/push-todo-cli/main/clawdbot/install-clawdbot.sh | bash
```

Or install manually:
```bash
npm install -g @masslessai/push-todo
```

## Setup

After installation, authenticate with your Push account:

```bash
push-todo connect
```

A browser window will open for Sign in with Apple.

## Usage

| Command | Description |
|---------|-------------|
| `push-todo` | List active tasks |
| `push-todo 427` | Show task #427 |
| `push-todo connect` | Connect/fix issues |
| `push-todo search "query"` | Search tasks |

In Clawdbot, say "show my Push tasks" or `/push-todo`.

## Shared Configuration

This shares configuration with Claude Code and Codex:
- Config: `~/.config/push/config`
- One authentication works for all clients

## Updates

```bash
npm update -g @masslessai/push-todo
```

Or run `push-todo connect` to check for updates.

## Support

- Website: [pushto.do](https://pushto.do)
- Issues: [GitHub](https://github.com/MasslessAI/push-todo-cli/issues)

---

MIT License
