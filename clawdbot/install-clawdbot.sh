#!/bin/bash
# Install Push Tasks for Clawdbot
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/MasslessAI/push-todo-cli/main/clawdbot/install-clawdbot.sh | bash

set -e

echo ""
echo "Installing Push Tasks for Clawdbot..."
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo ""
    echo "Install Node.js 18+ first: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18+ required (found v$NODE_VERSION)"
    exit 1
fi

# Install npm package (provides push-todo CLI)
echo "Installing @masslessai/push-todo..."
npm install -g @masslessai/push-todo

# Set up Clawdbot skill directory
CLAWDBOT_DIR="$HOME/.clawdbot"
SKILLS_DIR="$CLAWDBOT_DIR/skills/push-todo"

mkdir -p "$SKILLS_DIR"

# Create minimal SKILL.md for Clawdbot
cat > "$SKILLS_DIR/SKILL.md" << 'EOF'
# Push Tasks

Voice tasks captured on iPhone, ready to work on.

## Commands

Run these in the terminal:

| Command | Description |
|---------|-------------|
| `push-todo` | List active tasks |
| `push-todo 427` | Show task #427 |
| `push-todo connect` | Connect/fix issues |
| `push-todo search "query"` | Search tasks |
| `push-todo --help` | All options |

## Quick Start

If not connected yet, run:
```bash
push-todo connect
```

To see tasks:
```bash
push-todo
```

To work on a specific task:
```bash
push-todo 427
```

## Session Start

At the start of each session, check for tasks:
```bash
push-todo --json 2>/dev/null | head -1
```
If tasks exist, inform the user.
EOF

echo ""
echo "Installation complete!"
echo ""

if [ -f "$HOME/.config/push/config" ]; then
    echo "Found existing Push configuration."
    echo "Say '/push-todo' in Clawdbot to see your tasks."
else
    echo "Next steps:"
    echo "  1. Run: push-todo connect"
    echo "  2. Sign in with your Push account"
    echo "  3. Say '/push-todo' in Clawdbot"
fi
echo ""
echo "Learn more: https://pushto.do"
