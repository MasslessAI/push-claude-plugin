# Push Todo - Voice Tasks from iPhone

Fetch and work on voice tasks captured via the Push iOS app.

## How to Use

Run `/push-todo` to see your active tasks, or `/push-todo <number>` to work on a specific task.

## Commands

| Command | Description |
|---------|-------------|
| `/push-todo` | List all active tasks for current project |
| `/push-todo <number>` | Work on specific task (e.g., `/push-todo 427`) |
| `/push-todo --all-projects` | List tasks from all projects |
| `/push-todo --backlog` | Show backlog items |
| `/push-todo connect` | Run connection diagnostics |
| `/push-todo search <query>` | Search tasks |
| `/push-todo status` | Show connection status |

## Task Output Format

When you fetch a task, you'll see:

```
## Task: #427 Fix authentication bug

**Project:** github.com/user/repo

### Content
Users are getting logged out randomly. Need to investigate the session token expiration logic.

### Original Voice Transcript
> "There's a bug where users get logged out randomly, I think it's the session token expiration"

**Task ID:** `550e8400-e29b-41d4-a716-446655440000`
**Display Number:** #427
**Status:** Active
**Created:** 2026-01-15T10:30:00Z
```

## Batch Offer Format

When multiple tasks are available, you may see a batch offer:

```
==================================================
BATCH_OFFER: 3
BATCH_TASKS: 427,428,429
  #427 - Fix authentication bug
  #428 - Add dark mode support
  #429 - Update API documentation
==================================================
```

## Working on Tasks

When you fetch a specific task:

1. Read the **Content** section for the full task description
2. Check the **Original Voice Transcript** for additional context
3. Implement the requested changes
4. Mark the task as completed when done

## Completion

After completing a task, the task will be marked as done and synced back to the Push app on your iPhone.

## Project Context

Tasks are associated with git repositories. The CLI automatically detects your current project and shows only relevant tasks.

- Use `--all-projects` to see tasks from all registered projects
- Run `push-todo connect` to register the current project

## E2EE Support

If you have End-to-End Encryption enabled on the Push app, the CLI will automatically decrypt task content using your iCloud Keychain.
