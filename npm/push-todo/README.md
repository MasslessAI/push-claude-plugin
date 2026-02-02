# @masslessai/push-todo

Voice tasks from the [Push iOS app](https://pushto.do) for Claude Code.

## Installation

```bash
npm install -g @masslessai/push-todo
```

## Quick Start

```bash
# Authenticate and set up
push-todo connect

# List your tasks
push-todo

# Work on a specific task
push-todo 427
```

## Features

- **Voice Tasks**: Tasks captured by voice on your iPhone sync to your terminal
- **Project Filtering**: Automatically shows tasks relevant to your current git repo
- **E2EE Support**: End-to-end encrypted tasks are decrypted using your iCloud Keychain
- **Claude Code Integration**: Works as a Claude Code plugin with `/push-todo` command
- **Daemon Execution**: Background task execution with progress monitoring

## Commands

| Command | Description |
|---------|-------------|
| `push-todo` | List active tasks |
| `push-todo <number>` | View specific task |
| `push-todo connect` | Authenticate and set up |
| `push-todo search <query>` | Search tasks |
| `push-todo status` | Show connection status |
| `push-todo --watch` | Live monitoring UI |

## Claude Code Integration

This package works as a Claude Code plugin:

```
/push-todo              List your voice tasks
/push-todo 427          Work on task #427
/push-todo connect      Run diagnostics
```

### Session Hooks

- **Session Start**: Shows task count notification
- **Session End**: Reports session completion

## Options

```bash
push-todo --all-projects     # Tasks from all projects
push-todo --backlog          # Show backlog items
push-todo --include-backlog  # Include backlog in list
push-todo --completed        # Show completed items
push-todo --json             # Output as JSON
push-todo --queue 1,2,3      # Queue tasks for daemon
```

## Configuration

Config stored at `~/.config/push/config`:

```bash
push-todo setting            # Show all settings
push-todo setting auto-commit # Toggle auto-commit
```

## Requirements

- Node.js 18+
- macOS (for E2EE features)
- [Push iOS app](https://apps.apple.com/app/push-todo/id6738972839)

## API

```javascript
import { listTasks, showTask, searchTasks } from '@masslessai/push-todo';

// List tasks
const tasks = await listTasks({ allProjects: true });

// Get specific task
const task = await showTask(427);

// Search
const results = await searchTasks('bug');
```

## Documentation

- [Skill Documentation](./SKILL.md)
- [Push Website](https://pushto.do)
- [Support](mailto:support@pushto.do)

## License

MIT © [MasslessAI](https://masslessai.com)
