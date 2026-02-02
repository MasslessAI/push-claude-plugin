# Push Todo Skill

This skill enables Claude Code to fetch and work on voice tasks captured via the Push iOS app.

## Quick Start

1. Run `push-todo connect` to authenticate
2. Run `push-todo` to list active tasks
3. Run `push-todo <number>` to view and work on a specific task

## Commands

### List Tasks

```bash
push-todo                    # Active tasks for current project
push-todo --all-projects     # Tasks from all projects
push-todo --backlog          # Backlog items only
push-todo --include-backlog  # Active + backlog
push-todo --completed        # Completed items only
push-todo --json             # Output as JSON
```

### View Specific Task

```bash
push-todo 427                # View task #427
push-todo 427 --json         # As JSON
```

### Search Tasks

```bash
push-todo search "auth bug"  # Search for tasks
push-todo --search "fix"     # Alternative syntax
```

### Manage Tasks

```bash
push-todo --queue 427,428    # Queue tasks for daemon
push-todo --queue-batch      # Auto-queue a batch
push-todo --mark-completed <uuid> --completion-comment "Fixed the bug"
```

### Connection & Status

```bash
push-todo connect            # Run diagnostics, authenticate
push-todo status             # Show connection status
push-todo setting            # Show all settings
push-todo setting auto-commit # Toggle a setting
```

### Monitor

```bash
push-todo --watch            # Live terminal UI
push-todo --watch --json     # JSON status output
```

## Task Format

Tasks include:

- **summary**: Brief title
- **content/normalizedContent**: Full task description (AI-extracted)
- **originalTranscript**: Raw voice recording text
- **displayNumber**: Human-readable number (#1, #2...)
- **projectHint**: Associated project (git remote)
- **screenshotAttachments**: Any attached screenshots
- **linkAttachments**: Any attached links

## Batch Processing

The CLI supports batch task processing:

1. Fetch multiple tasks with `push-todo`
2. Tasks marked for batch will show `BATCH_OFFER` format
3. Use `--queue` to add tasks to the daemon queue

## Integration with Claude Code

### Session Start Hook

When Claude Code starts, the hook shows:
```
[Push] You have 5 active tasks from your iPhone. Say 'push-todo' to see them.
```

### Session End Hook

Reports session completion to the Push backend.

### Slash Command

Use `/push-todo` in Claude Code as a shortcut:
- `/push-todo` - List tasks
- `/push-todo 427` - Work on task #427
- `/push-todo connect` - Run diagnostics

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `AUTO_COMMIT` | `true` | Auto-commit changes after task completion |
| `MAX_BATCH_SIZE` | `5` | Maximum tasks in batch offer |

Toggle with: `push-todo setting auto-commit`

## Project Registration

Projects are identified by their git remote URL. Register with:

```bash
push-todo connect
```

This maps the git remote to the local path, enabling:
- Automatic project filtering
- Daemon task routing
- Cross-machine synchronization

## E2EE (End-to-End Encryption)

If enabled on the Push app:
- Tasks are encrypted on device
- Decryption uses iCloud Keychain
- Requires macOS with keychain access

Check status: `push-todo status`

## Configuration

Config file: `~/.config/push/config`

```bash
export PUSH_KEY="your-api-key"
export PUSH_USER_ID="user-uuid"
export AUTO_COMMIT="true"
export MAX_BATCH_SIZE="5"
```

## Troubleshooting

### "No API key configured"
Run `push-todo connect` to authenticate.

### "E2EE not available"
The keychain helper binary may not be installed. Check:
- macOS only (not Linux/Windows)
- Binary at `node_modules/@masslessai/push-todo/bin/push-keychain-helper`

### "Invalid API key"
Your key may have expired. Run `push-todo connect` to re-authenticate.

### Tasks not showing for project
Run `push-todo connect` to register the current project, or use `--all-projects`.

## API Reference

The CLI also exports a programmatic API:

```javascript
import {
  listTasks,
  showTask,
  searchTasks,
  markComplete
} from '@masslessai/push-todo';

// List tasks
const tasks = await listTasks({ allProjects: true });

// Search
const results = await searchTasks('bug fix');

// Mark complete
await markComplete(taskId, 'Fixed the issue');
```
