/**
 * Live terminal UI for Push CLI.
 *
 * Displays real-time daemon status and task execution progress.
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import readline from 'readline';
import { codes, colorsEnabled } from './utils/colors.js';
import { formatDuration, truncate } from './utils/format.js';

const STATUS_FILE = join(homedir(), '.push', 'daemon_status.json');
const REFRESH_INTERVAL = 500; // ms

/**
 * Read the current daemon status from file.
 *
 * @returns {Object|null} Status object or null if unavailable
 */
function readStatus() {
  if (!existsSync(STATUS_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(STATUS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Format a task status line for display.
 *
 * @param {Object} task - Task status object
 * @returns {string} Formatted status line
 */
function formatTaskLine(task) {
  const num = `#${task.displayNumber || '?'}`.padEnd(5);
  const summary = truncate(task.summary || 'Unknown', 40);

  let statusIcon = '○';
  let statusColor = codes.yellow;

  switch (task.status) {
    case 'running':
      statusIcon = '●';
      statusColor = codes.green;
      break;
    case 'session_finished':
      statusIcon = '✓';
      statusColor = codes.green;
      break;
    case 'failed':
      statusIcon = '✗';
      statusColor = codes.red;
      break;
    case 'queued':
      statusIcon = '○';
      statusColor = codes.yellow;
      break;
  }

  if (colorsEnabled()) {
    return `  ${statusColor}${statusIcon}${codes.reset} ${num} ${summary}`;
  }
  return `  ${statusIcon} ${num} ${summary}`;
}

/**
 * Format the full UI screen.
 *
 * @param {Object|null} status - Daemon status object
 * @returns {string} Formatted screen content
 */
function formatUI(status) {
  const lines = [];

  // Header
  lines.push('');
  if (colorsEnabled()) {
    lines.push(`${codes.bold}Push Daemon Monitor${codes.reset}`);
  } else {
    lines.push('Push Daemon Monitor');
  }
  lines.push('─'.repeat(50));

  if (!status) {
    lines.push('');
    lines.push('  Daemon not running or status unavailable.');
    lines.push('  Run "push-todo" to start the daemon.');
    lines.push('');
    lines.push('─'.repeat(50));
    lines.push('Press q to quit');
    return lines.join('\n');
  }

  // Daemon info
  lines.push('');
  const daemonStatus = status.running ? 'Running' : 'Stopped';
  const daemonColor = status.running ? codes.green : codes.red;

  if (colorsEnabled()) {
    lines.push(`  Status: ${daemonColor}${daemonStatus}${codes.reset}`);
  } else {
    lines.push(`  Status: ${daemonStatus}`);
  }

  if (status.pid) {
    lines.push(`  PID: ${status.pid}`);
  }

  if (status.uptime) {
    lines.push(`  Uptime: ${formatDuration(status.uptime)}`);
  }

  // Running tasks
  lines.push('');
  lines.push('─'.repeat(50));

  const runningTasks = status.runningTasks || [];
  if (runningTasks.length > 0) {
    if (colorsEnabled()) {
      lines.push(`${codes.bold}Running Tasks (${runningTasks.length})${codes.reset}`);
    } else {
      lines.push(`Running Tasks (${runningTasks.length})`);
    }
    lines.push('');

    for (const task of runningTasks) {
      lines.push(formatTaskLine(task));

      // Show progress if available
      if (task.progress) {
        const progressBar = renderProgressBar(task.progress, 30);
        lines.push(`       ${progressBar}`);
      }

      // Show current step if available
      if (task.currentStep) {
        const step = truncate(task.currentStep, 40);
        if (colorsEnabled()) {
          lines.push(`       ${codes.dim}${step}${codes.reset}`);
        } else {
          lines.push(`       ${step}`);
        }
      }
    }
  } else {
    if (colorsEnabled()) {
      lines.push(`${codes.dim}No tasks currently running${codes.reset}`);
    } else {
      lines.push('No tasks currently running');
    }
  }

  // Queued tasks
  const queuedTasks = status.queuedTasks || [];
  if (queuedTasks.length > 0) {
    lines.push('');
    lines.push('─'.repeat(50));
    if (colorsEnabled()) {
      lines.push(`${codes.bold}Queued (${queuedTasks.length})${codes.reset}`);
    } else {
      lines.push(`Queued (${queuedTasks.length})`);
    }
    lines.push('');

    for (const task of queuedTasks.slice(0, 5)) {
      lines.push(formatTaskLine(task));
    }

    if (queuedTasks.length > 5) {
      lines.push(`  ... and ${queuedTasks.length - 5} more`);
    }
  }

  // Completed today
  const completedToday = status.completedToday || [];
  if (completedToday.length > 0) {
    lines.push('');
    lines.push('─'.repeat(50));
    if (colorsEnabled()) {
      lines.push(`${codes.bold}Completed Today (${completedToday.length})${codes.reset}`);
    } else {
      lines.push(`Completed Today (${completedToday.length})`);
    }
    lines.push('');

    for (const task of completedToday.slice(-3)) {
      lines.push(formatTaskLine({ ...task, status: 'session_finished' }));
    }

    if (completedToday.length > 3) {
      lines.push(`  ... and ${completedToday.length - 3} more`);
    }
  }

  // Footer
  lines.push('');
  lines.push('─'.repeat(50));
  lines.push('Press q to quit, r to refresh');

  return lines.join('\n');
}

/**
 * Render a progress bar.
 *
 * @param {number} progress - Progress 0-100
 * @param {number} width - Bar width in characters
 * @returns {string} Rendered progress bar
 */
function renderProgressBar(progress, width) {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;

  if (colorsEnabled()) {
    return `${codes.green}${'█'.repeat(filled)}${codes.dim}${'░'.repeat(empty)}${codes.reset} ${progress}%`;
  }
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${progress}%`;
}

/**
 * Output status as JSON (for non-TTY).
 */
function outputJSON() {
  const status = readStatus();
  console.log(JSON.stringify(status, null, 2));
}

/**
 * Output status as plain text (for non-TTY).
 */
function outputPlainText() {
  const status = readStatus();

  if (!status) {
    console.log('Daemon not running');
    return;
  }

  console.log(`Status: ${status.running ? 'Running' : 'Stopped'}`);

  if (status.pid) {
    console.log(`PID: ${status.pid}`);
  }

  const running = status.runningTasks || [];
  console.log(`Running tasks: ${running.length}`);

  for (const task of running) {
    console.log(`  #${task.displayNumber}: ${task.summary || 'Unknown'}`);
  }

  const queued = status.queuedTasks || [];
  console.log(`Queued tasks: ${queued.length}`);
}

/**
 * Start the live watch UI.
 *
 * @param {Object} options - Watch options
 * @param {boolean} options.json - Output JSON instead of TUI
 * @param {boolean} options.follow - Exit when all tasks complete
 */
export function startWatch(options = {}) {
  // JSON mode
  if (options.json) {
    outputJSON();
    return;
  }

  // Non-TTY mode
  if (!process.stdout.isTTY) {
    outputPlainText();
    return;
  }

  // Live TUI mode
  let running = true;
  const followMode = options.follow || options.f;

  // Hide cursor
  process.stdout.write(codes.hideCursor);

  // Render function
  function render() {
    const status = readStatus();
    const output = formatUI(status);
    process.stdout.write(codes.clearScreen + codes.cursorHome + output);

    // In follow mode, exit when no running or queued tasks
    if (followMode && status) {
      const runningTasks = status.runningTasks || [];
      const queuedTasks = status.queuedTasks || [];
      if (runningTasks.length === 0 && queuedTasks.length === 0) {
        cleanup('All tasks completed.');
      }
    }
  }

  // Initial render
  render();

  // Set up refresh interval
  const interval = setInterval(() => {
    if (running) {
      render();
    }
  }, REFRESH_INTERVAL);

  // Set up keyboard handling
  readline.emitKeypressEvents(process.stdin);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  // Cleanup function
  function cleanup(message = 'Watch mode ended.') {
    running = false;
    clearInterval(interval);

    // Show cursor
    process.stdout.write(codes.showCursor);

    // Clear screen and show exit message
    process.stdout.write(codes.clearScreen + codes.cursorHome);
    console.log(message);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    process.exit(0);
  }

  // Handle keyboard input
  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      cleanup();
    } else if (key.name === 'r') {
      render();
    }
  });

  // Handle process signals
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
