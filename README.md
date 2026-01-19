# Push Voice Tasks Plugin

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blue)](https://github.com/MasslessAI/push-claude-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Receive and work on voice tasks captured on your iPhone using the [Push](https://pushto.do) app.

## What is Push?

Push is a voice-powered todo app. Capture tasks by speaking on your phone → work on them in Claude Code.

**Example workflow:**
1. Say: "Fix the login validation bug in the Push app"
2. Task appears in Push with AI-extracted summary
3. Open Claude Code → see notification: "You have 1 pending task"
4. Work on the task → mark complete → syncs back to iPhone

## Installation

### Option 1: Marketplace (Recommended)

Install via the Claude Code plugin marketplace:

```
/plugin marketplace add MasslessAI/push-claude-plugin
/plugin install push-todo@push-claude-plugin
```

Then run the setup:
```
/push-todo setup
```

**Enable auto-updates** (important for third-party marketplaces):
```
/plugin → Marketplaces → push-claude-plugin → Enable auto-update
```

> **Note:** Third-party marketplaces have auto-update **OFF by default**. We recommend enabling it so you always have the latest features and bug fixes.

### Option 2: Quick Install (Legacy)

For a one-liner install:

```bash
curl -fsSL https://raw.githubusercontent.com/MasslessAI/push-claude-plugin/main/install.sh | bash
```

Then restart Claude Code and run `/push-todo setup` to connect your account.

> **Note:** Legacy installations do not support auto-updates. Run `/push-todo setup` periodically to check for updates.

## Usage

| Command | Description |
|---------|-------------|
| `/push-todo` | Show your pending tasks for current project |
| `/push-todo setup` | **Doctor flow**: check updates, validate API key, register project |
| `/push-todo all` | Show tasks from all projects |
| `/push-todo #427` | Jump directly to task #427 |
| `/push-todo review` | Review session and mark completed tasks |

Or just say "show my Push tasks" and Claude will activate the skill automatically.

### The Setup Command (Doctor Flow)

`/push-todo setup` is a comprehensive health check that:

1. **Checks for updates** - Compares local vs remote version
2. **Validates API key** - Ensures your connection is still valid
3. **Registers project** - Associates current project with keywords for AI routing

You only need to remember this one command - it handles everything.

## Session Notifications

When you start a Claude Code session, you'll see:

```
[Push] You have 3 active tasks from your iPhone. Say 'push-todo' to see them.
```

## Requirements

- [Push iOS app](https://pushto.do) installed on your iPhone
- Push account (free, Sign in with Apple)
- Claude Code

## How It Works

1. **Capture**: Speak your coding task on the Push iOS app
2. **AI Processing**: Push extracts summary, project hint, and normalized content
3. **Sync**: Tasks appear in Claude Code via session-start hook
4. **Work**: Select a task and Claude helps you implement it
5. **Complete**: Mark done → syncs back to your iPhone

## Updates

### Marketplace Installs

| Auto-Update Setting | Behavior |
|---------------------|----------|
| **ON** | Claude Code updates automatically at startup |
| **OFF** (default for third-party) | No automatic updates, no notifications |

**Important:** Claude Code does NOT notify you about updates when auto-update is disabled. Enable auto-updates or run `/push-todo setup` to check for updates manually.

### Legacy Installs (curl)

Run `/push-todo setup` to check for updates. The doctor flow will automatically update if a new version is available.

## Troubleshooting

### Setup doesn't complete

1. Make sure you're signed into Push on your iPhone
2. Try running setup again: `/push-todo setup`
3. Check browser for any authentication errors

### Tasks don't appear

1. Verify config exists: `cat ~/.config/push/config`
2. Ensure you have active (not completed) tasks in the Push app
3. Check if tasks are assigned to this project

### API key issues

Run `/push-todo setup` - it will detect invalid/revoked keys and re-authenticate automatically.

## Support

- Website: https://pushto.do
- Issues: https://github.com/MasslessAI/push-claude-plugin/issues

## License

MIT
