#!/usr/bin/env node

/**
 * Push Todo CLI
 *
 * Voice tasks from Push iOS app for Claude Code.
 * This is the main CLI entry point.
 *
 * Usage:
 *   push-todo              # List active tasks
 *   push-todo 427          # Get specific task
 *   push-todo connect      # Setup connection
 *   push-todo status       # Show status
 *   push-todo watch        # Live daemon monitor
 */

import { run } from '../lib/cli.js';

// Run CLI with arguments
run(process.argv.slice(2)).catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
