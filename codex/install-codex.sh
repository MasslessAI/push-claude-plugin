#!/bin/bash
# Install Push Tasks for OpenAI Codex
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/MasslessAI/push-todo-cli/main/codex/install-codex.sh | bash

set -e

echo ""
echo "Installing Push Tasks for OpenAI Codex..."
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

# Set up Codex integration
CODEX_DIR="$HOME/.codex"
AGENTS_FILE="$CODEX_DIR/AGENTS.md"

mkdir -p "$CODEX_DIR"

# Add Push Tasks section to AGENTS.md
PUSH_SECTION='
## Push Tasks Integration

Voice tasks captured on iPhone via the Push app.

### Commands

| Command | Description |
|---------|-------------|
| `push-todo` | List active tasks |
| `push-todo 427` | Show task #427 |
| `push-todo connect` | Connect/fix issues |
| `push-todo search "query"` | Search tasks |

### Session Start

At the start of each session, check for pending tasks:
```bash
push-todo --json 2>/dev/null | head -1
```
If tasks exist, inform: "You have X task(s) from Push. Type $push-todo to see them."
'

if [ -f "$AGENTS_FILE" ]; then
    if ! grep -q "Push Tasks Integration" "$AGENTS_FILE"; then
        echo "$PUSH_SECTION" >> "$AGENTS_FILE"
        echo "Added Push section to existing AGENTS.md"
    else
        echo "Push section already exists in AGENTS.md"
    fi
else
    echo "$PUSH_SECTION" > "$AGENTS_FILE"
    echo "Created AGENTS.md with Push section"
fi

echo ""
echo "Installation complete!"
echo ""

if [ -f "$HOME/.config/push/config" ]; then
    echo "Found existing Push configuration."
    echo "Type '\$push-todo' in Codex to see your tasks."
else
    echo "Next steps:"
    echo "  1. Run: push-todo connect"
    echo "  2. Sign in with your Push account"
    echo "  3. Type '\$push-todo' in Codex"
fi
echo ""
echo "Learn more: https://pushto.do"
