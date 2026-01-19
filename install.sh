#!/bin/bash
# Install Push Tasks skill for Claude Code (Legacy Method)

set -e

echo ""
echo "=============================================="
echo "  NOTICE: This installation method is legacy."
echo ""
echo "  For auto-updates, use the marketplace instead:"
echo ""
echo "  Step 1: /plugin marketplace add MasslessAI/push-claude-plugin"
echo "  Step 2: /plugin install push-todo@MasslessAI/push-claude-plugin"
echo "  Step 3: /plugin -> Marketplaces -> Enable auto-update"
echo "  Step 4: /push-todo setup"
echo ""
echo "  Continuing with legacy installation..."
echo "=============================================="
echo ""
sleep 2

echo "Installing Push Tasks for Claude Code..."

CLAUDE_DIR="$HOME/.claude"
SKILLS_DIR="$CLAUDE_DIR/skills/push-todo"

# Create directories
mkdir -p "$SKILLS_DIR/scripts"
mkdir -p "$SKILLS_DIR/hooks"

# Download files from GitHub
BASE_URL="https://raw.githubusercontent.com/MasslessAI/push-claude-plugin/main/plugins/push-todo"

echo "Downloading skill files..."
curl -sL "$BASE_URL/skills/push-todo/SKILL.md" > "$SKILLS_DIR/SKILL.md"
curl -sL "$BASE_URL/scripts/setup.py" > "$SKILLS_DIR/scripts/setup.py"
curl -sL "$BASE_URL/scripts/fetch_task.py" > "$SKILLS_DIR/scripts/fetch_task.py"
curl -sL "$BASE_URL/scripts/check_tasks.py" > "$SKILLS_DIR/scripts/check_tasks.py"
curl -sL "$BASE_URL/hooks/session-start.sh" > "$SKILLS_DIR/hooks/session-start.sh"

chmod +x "$SKILLS_DIR/scripts/"*.py
chmod +x "$SKILLS_DIR/hooks/session-start.sh"

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code"
echo "  2. Run: /push-todo setup"
echo "  3. Sign in with your Push account"
echo "  4. Start capturing voice tasks on your iPhone!"
echo ""
echo "Learn more: https://pushto.do"
