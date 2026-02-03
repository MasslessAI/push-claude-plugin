/**
 * CLI argument parsing and command routing for Push CLI.
 *
 * Handles all command-line options and dispatches to appropriate handlers.
 */

import { parseArgs } from 'util';
import * as fetch from './fetch.js';
import { runConnect } from './connect.js';
import { startWatch } from './watch.js';
import { showSettings, toggleSetting } from './config.js';
import { ensureDaemonRunning, getDaemonStatus, startDaemon, stopDaemon } from './daemon-health.js';
import { bold, red, cyan, dim } from './utils/colors.js';

const VERSION = '3.0.1';

const HELP_TEXT = `
${bold('push-todo')} - Voice tasks from Push iOS app for Claude Code

${bold('USAGE:')}
  push-todo [options]              List active tasks
  push-todo <number>               Show specific task
  push-todo connect                Run connection doctor
  push-todo search <query>         Search tasks
  push-todo review                 Review completed tasks

${bold('OPTIONS:')}
  --all-projects, -a               List tasks from all projects
  --backlog, -b                    Only show backlog items
  --include-backlog                Include backlog items in listing
  --completed, -c                  Only show completed items
  --include-completed              Include completed items in listing
  --queue <numbers>                Queue tasks for daemon (comma-separated)
  --queue-batch                    Auto-queue a batch of tasks
  --mark-completed <uuid>          Mark a task as completed
  --completion-comment <text>      Comment for completion
  --search <query>                 Search tasks
  --status                         Show connection and daemon status
  --watch, -w                      Live terminal UI
  --setting [name]                 Show or toggle settings
  --daemon-status                  Show daemon status
  --daemon-start                   Start daemon manually
  --daemon-stop                    Stop daemon
  --json                           Output as JSON
  --version, -v                    Show version
  --help, -h                       Show this help

${bold('EXAMPLES:')}
  push-todo                        List active tasks for current project
  push-todo 427                    Show task #427
  push-todo -a                     List all tasks across projects
  push-todo --queue 1,2,3          Queue tasks 1, 2, 3 for daemon
  push-todo search "auth bug"      Search for tasks matching "auth bug"
  push-todo connect                Run connection diagnostics

${bold('SETTINGS:')}
  push-todo setting                Show all settings
  push-todo setting auto-commit    Toggle auto-commit

${dim('Documentation:')} https://pushto.do/docs/cli
`;

const options = {
  'all-projects': { type: 'boolean', short: 'a' },
  'backlog': { type: 'boolean', short: 'b' },
  'include-backlog': { type: 'boolean' },
  'completed': { type: 'boolean', short: 'c' },
  'include-completed': { type: 'boolean' },
  'queue': { type: 'string' },
  'queue-batch': { type: 'boolean' },
  'mark-completed': { type: 'string' },
  'completion-comment': { type: 'string' },
  'search': { type: 'string' },
  'status': { type: 'boolean' },
  'watch': { type: 'boolean', short: 'w' },
  'setting': { type: 'string' },
  'daemon-status': { type: 'boolean' },
  'daemon-start': { type: 'boolean' },
  'daemon-stop': { type: 'boolean' },
  'json': { type: 'boolean' },
  'version': { type: 'boolean', short: 'v' },
  'help': { type: 'boolean', short: 'h' }
};

/**
 * Parse command line arguments.
 *
 * @param {string[]} argv - Command line arguments
 * @returns {Object} Parsed arguments with values and positionals
 */
function parseArguments(argv) {
  try {
    return parseArgs({
      args: argv,
      options,
      allowPositionals: true
    });
  } catch (error) {
    console.error(red(`Error: ${error.message}`));
    console.log(`Run ${cyan('push-todo --help')} for usage.`);
    process.exit(1);
  }
}

/**
 * Main CLI entry point.
 *
 * @param {string[]} argv - Command line arguments (without node and script path)
 */
export async function run(argv) {
  const { values, positionals } = parseArguments(argv);

  // Help
  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }

  // Version
  if (values.version) {
    console.log(`push-todo ${VERSION}`);
    return;
  }

  // Daemon management commands (don't auto-start daemon for these)
  if (values['daemon-status']) {
    const status = getDaemonStatus();
    if (status.running) {
      console.log(`${bold('Daemon:')} Running (PID: ${status.pid})`);
      if (status.uptime) console.log(`${dim('Uptime:')} ${status.uptime}`);
      if (status.version) console.log(`${dim('Version:')} ${status.version}`);
      if (status.runningTasks?.length > 0) {
        console.log(`\n${bold('Running Tasks:')}`);
        for (const t of status.runningTasks) {
          console.log(`  #${t.displayNumber} - ${t.summary}`);
        }
      }
      if (status.completedToday?.length > 0) {
        console.log(`\n${bold('Completed Today:')} ${status.completedToday.length} tasks`);
      }
    } else {
      console.log(`${bold('Daemon:')} Not running`);
    }
    return;
  }

  if (values['daemon-start']) {
    const status = getDaemonStatus();
    if (status.running) {
      console.log(`Daemon already running (PID: ${status.pid})`);
    } else {
      const success = startDaemon();
      if (success) {
        console.log('Daemon started');
      } else {
        console.error(red('Failed to start daemon'));
        process.exit(1);
      }
    }
    return;
  }

  if (values['daemon-stop']) {
    const status = getDaemonStatus();
    if (!status.running) {
      console.log('Daemon is not running');
    } else {
      const success = stopDaemon();
      if (success) {
        console.log('Daemon stopped');
      } else {
        console.error(red('Failed to stop daemon'));
        process.exit(1);
      }
    }
    return;
  }

  // Auto-start daemon on every command (self-healing behavior)
  ensureDaemonRunning();

  // Get the command (first positional)
  const command = positionals[0];

  // Connect command
  if (command === 'connect') {
    return runConnect(values);
  }

  // Review command
  if (command === 'review') {
    return fetch.runReview(values);
  }

  // Search command (positional form)
  if (command === 'search' && positionals[1]) {
    return fetch.searchTasks(positionals.slice(1).join(' '), values);
  }

  // Search option
  if (values.search) {
    return fetch.searchTasks(values.search, values);
  }

  // Watch mode
  if (values.watch) {
    return startWatch(values);
  }

  // Status
  if (values.status) {
    return fetch.showStatus(values);
  }

  // Settings
  if ('setting' in values) {
    const settingName = values.setting;
    if (settingName && settingName !== 'true') {
      return toggleSetting(settingName);
    }
    return showSettings();
  }

  // Queue tasks
  if (values.queue) {
    return fetch.queueForExecution(values.queue);
  }

  // Queue batch
  if (values['queue-batch']) {
    return fetch.offerBatch(values);
  }

  // Mark completed
  if (values['mark-completed']) {
    const comment = values['completion-comment'] || '';
    return fetch.markComplete(values['mark-completed'], comment);
  }

  // Specific task by number
  if (command && /^\d+$/.test(command)) {
    const displayNumber = parseInt(command, 10);
    return fetch.showTask(displayNumber, values);
  }

  // Unknown command
  if (command && !/^\d+$/.test(command)) {
    console.error(red(`Unknown command: ${command}`));
    console.log(`Run ${cyan('push-todo --help')} for usage.`);
    process.exit(1);
  }

  // Default: list tasks
  return fetch.listTasks(values);
}
