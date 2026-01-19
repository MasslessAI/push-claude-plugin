---
description: Show active voice tasks from Push iOS app
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Push Voice Tasks

This command fetches and displays your active voice tasks from the Push iOS app.

## Usage

- `/push-todo` - Show the next active task
- `/push-todo all` - Show all active tasks
- `/push-todo review` - Review existing tasks and mark completed ones
- `/push-todo refresh` - Force refresh tasks from server
- `/push-todo setup` - Configure your Push connection

## Instructions

When this command is invoked:

1. **Check for setup**: First verify the config exists:
   ```bash
   test -f ~/.config/push/config && echo "configured" || echo "not configured"
   ```

2. **If not configured**: Run the setup flow:
   ```bash
   python3 ~/.claude/skills/push-todo/scripts/setup.py
   ```

3. **If configured**: Fetch tasks:
   ```bash
   source ~/.config/push/config && python3 ~/.claude/skills/push-todo/scripts/fetch_task.py
   ```

4. Present the tasks and ask which one to work on

5. When user selects a task, mark it as started and begin working

## Review Mode

When `/push-todo review` is invoked, use **session context** to identify completed tasks:

### Step 1: Analyze Session Context

First, recall what was worked on in this session (or the previous compacted session):
- What tasks were explicitly mentioned? (e.g., "work on #701")
- What features were implemented or bugs fixed?
- What files were edited and why?

### Step 2: Fetch Pending Tasks

```bash
source ~/.config/push/config && python3 ~/.claude/skills/push-todo/scripts/fetch_task.py --all --json
```

### Step 3: Match Session Work Against Tasks

For each pending task, check if it matches work done in this session:

**Explicit Match**: Task number was mentioned (e.g., "worked on #701")
- These should be marked complete unless work is clearly unfinished

**Implicit Match**: Work done aligns with task content semantically
- Compare task summary/content against session work
- Example: Task says "add review parameter to slash command" and we just added that feature

**No Match**: Task wasn't worked on this session
- Skip these (don't search codebase unnecessarily)

### Step 4: Present Findings

```
## Session Review

Based on this session, I found:

### ✅ Completed This Session
- #701 "Add review parameter" - We implemented this feature (explicit)
- #427 "Fix login bug" - We fixed the auth issue in LoginView.swift (implicit match)

### ❓ Not Worked On
- #351 "Test on smaller phone" - No related work this session
- #682 "Rework recording overlay" - No related work this session

Should I mark #701 and #427 as completed?
```

### Step 5: Mark Confirmed Tasks

```bash
python3 ~/.claude/skills/push-todo/scripts/fetch_task.py --mark-completed TASK_UUID
```

### Key Principle

**Session context is primary** - don't grep the entire codebase for every task. Use conversation history to identify what was actually worked on, then match against tasks semantically. This catches both:
- Explicit: User said "work on #701" but forgot to mark complete
- Implicit: User fixed something that matches a task they didn't mention

## What is Push?

Push is a voice-powered todo app for iOS. Users capture tasks by speaking on their phone, and those tasks sync to Claude Code for implementation.

Learn more: https://pushto.do
