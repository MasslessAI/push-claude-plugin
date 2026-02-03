#!/bin/bash
# Install Push Tasks plugin for Claude Code
# https://github.com/MasslessAI/push-todo-cli

set -e

echo ""
echo "Installing Push Tasks for Claude Code..."
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo ""
    echo "Install Node.js 18+ first:"
    echo "  https://nodejs.org/"
    echo ""
    echo "Or use nvm:"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "  nvm install 18"
    echo ""
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18+ required (found v$NODE_VERSION)"
    echo ""
    echo "Upgrade Node.js:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

# Install via npm
echo "Installing @masslessai/push-todo..."
npm install -g @masslessai/push-todo

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Run: push-todo connect"
echo "  2. In Claude Code, use /push-todo"
echo ""
echo "Learn more: https://pushto.do"
