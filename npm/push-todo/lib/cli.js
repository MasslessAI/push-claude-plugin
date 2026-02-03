/**
 * CLI argument parsing and command routing for Push CLI.
 *
 * Handles all command-line options and dispatches to appropriate handlers.
 */

import { parseArgs } from 'util';
import { spawn } from 'child_process';
import * as fetch from './fetch.js';
import { runConnect } from './connect.js';
import { startWatch } from './watch.js';
import { showSettings, toggleSetting, setMaxBatchSize } from './config.js';
import { ensureDaemonRunning, getDaemonStatus, startDaemon, stopDaemon } from './daemon-health.js';
import { bold, red, cyan, dim } from './utils/colors.js';

const VERSION = '3.0.2';

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
  --resume <number>                Resume Claude session for a completed task
  --set-batch-size <N>             Set max tasks for batch queue (1-20)
  --daemon-status                  Show daemon status
  --daemon-start                   Start daemon manually
  --daemon-stop                    Stop daemon
  --commands                       Show available user commands
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
  'resume': { type: 'string' },
  'set-batch-size': { type: 'string' },
  'daemon-status': { type: 'boolean' },
  'daemon-start': { type: 'boolean' },
  'daemon-stop': { type: 'boolean' },
  'commands': { type: 'boolean' },
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

  // Handle --commands (simple user help)
  if (values.commands) {
    console.log(`
  ${bold('Push Voice Tasks - Commands')}
  ${'='.repeat(40)}

  /push-todo              Show your active tasks
  /push-todo 427          Work on task #427
  /push-todo search X     Search tasks for 'X'
  /push-todo connect      Setup or fix problems
  /push-todo review       Check completed work
  /push-todo status       Show connection status
  /push-todo watch        Live monitor daemon tasks
  /push-todo setting      View/toggle settings

  ${dim('Options:')}
  --all-projects          See tasks from all projects
  --backlog               See deferred tasks only
  --search "query"        Search active & completed tasks
`);
    return;
  }

  // Handle --set-batch-size
  if (values['set-batch-size']) {
    const size = parseInt(values['set-batch-size'], 10);
    if (isNaN(size) || size < 1 || size > 20) {
      console.error(red('Batch size must be between 1 and 20'));
      process.exit(1);
    }
    if (setMaxBatchSize(size)) {
      console.log(`Max batch size set to ${size}`);
    } else {
      console.error(red('Failed to set batch size'));
      process.exit(1);
    }
    return;
  }

  // Handle --resume (resume Claude session for a completed task)
  if (values.resume) {
    const taskNum = values.resume.replace(/^#/, '');
    const displayNumber = parseInt(taskNum, 10);
    if (isNaN(displayNumber)) {
      console.error(red(`Invalid task number: ${values.resume}`));
      process.exit(1);
    }

    // Fetch task to get session_id
    const task = await fetch.getTaskByNumber(displayNumber);
    if (!task) {
      console.error(red(`Task #${displayNumber} not found`));
      process.exit(1);
    }

    const sessionId = task.execution_session_id || task.executionSessionId;
    if (!sessionId) {
      const executionStatus = task.execution_status || task.executionStatus;
      if (executionStatus) {
        console.log(`Task #${displayNumber} has execution status '${executionStatus}' but no session ID.`);
        console.log('Session ID is captured when daemon completes a task.');
        console.log();
        console.log('Possible reasons:');
        console.log('  - Task was completed before session capture was added');
        console.log('  - Task was completed manually (not by daemon)');
        console.log("  - Daemon couldn't extract session ID from Claude's output");
      } else {
        console.log(`Task #${displayNumber} was not executed by the daemon.`);
        console.log('Session resume is only available for tasks completed by the Push daemon.');
      }
      process.exit(1);
    }

    // Launch claude --resume with the session ID
    console.log(`Resuming session for task #${displayNumber}...`);
    console.log(`Session ID: ${sessionId}`);
    console.log();

    // Use spawn with stdio: 'inherit' to give control to Claude
    const child = spawn('claude', ['--resume', sessionId], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        console.error(red("Error: 'claude' command not found. Is Claude Code installed?"));
      } else {
        console.error(red(`Error launching Claude: ${error.message}`));
      }
      process.exit(1);
    });

    child.on('close', (code) => {
      process.exit(code || 0);
    });

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
