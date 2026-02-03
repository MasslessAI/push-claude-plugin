/**
 * Daemon health management for Push CLI.
 *
 * Auto-starts daemon on any /push-todo command if not running.
 * This is the "self-healing" behavior - same as Python version.
 *
 * Ported from: plugins/push-todo/scripts/daemon_health.py
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUSH_DIR = join(homedir(), '.push');
const PID_FILE = join(PUSH_DIR, 'daemon.pid');
const LOG_FILE = join(PUSH_DIR, 'daemon.log');
const STATUS_FILE = join(PUSH_DIR, 'daemon_status.json');
const VERSION_FILE = join(PUSH_DIR, 'daemon.version');

/**
 * Check if a process is running by PID.
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current daemon status.
 * Same as Python's get_daemon_status().
 */
export function getDaemonStatus() {
  const status = {
    running: false,
    pid: null,
    uptime: null,
    version: null,
    log_file: LOG_FILE
  };

  if (!existsSync(PID_FILE)) {
    return status;
  }

  try {
    const pidStr = readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      return status;
    }

    if (isProcessRunning(pid)) {
      status.running = true;
      status.pid = pid;

      // Get version from version file
      if (existsSync(VERSION_FILE)) {
        try {
          status.version = readFileSync(VERSION_FILE, 'utf8').trim();
        } catch {}
      }

      // Get uptime and details from status file
      if (existsSync(STATUS_FILE)) {
        try {
          const data = JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
          if (data.startedAt) {
            status.uptime = formatUptime(data.startedAt);
          }
          status.runningTasks = data.runningTasks || [];
          status.queuedTasks = data.queuedTasks || [];
          status.completedToday = data.completedToday || [];
        } catch {}
      }
    } else {
      // Stale PID file
      try { unlinkSync(PID_FILE); } catch {}
    }
  } catch {}

  return status;
}

/**
 * Format uptime for display.
 */
function formatUptime(startedAt) {
  if (!startedAt) return 'unknown';

  try {
    const started = new Date(startedAt);
    const now = new Date();
    const diff = Math.floor((now - started) / 1000);

    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  } catch {
    return 'unknown';
  }
}

/**
 * Start the daemon process.
 * Same as Python's start_daemon().
 */
export function startDaemon() {
  const status = getDaemonStatus();
  if (status.running) {
    return true;
  }

  mkdirSync(PUSH_DIR, { recursive: true });

  const daemonScript = join(__dirname, 'daemon.js');

  if (!existsSync(daemonScript)) {
    return false;
  }

  try {
    const child = spawn(process.execPath, [daemonScript], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, PUSH_DAEMON: '1' }
    });

    writeFileSync(PID_FILE, String(child.pid));
    child.unref();

    return true;
  } catch {
    return false;
  }
}

/**
 * Stop the daemon process.
 */
export function stopDaemon() {
  const status = getDaemonStatus();
  if (!status.running) return true;

  try {
    process.kill(status.pid, 'SIGTERM');

    // Wait for graceful shutdown
    let waited = 0;
    while (waited < 5000 && isProcessRunning(status.pid)) {
      const start = Date.now();
      while (Date.now() - start < 100) {} // Busy wait 100ms
      waited += 100;
    }

    if (isProcessRunning(status.pid)) {
      process.kill(status.pid, 'SIGKILL');
    }

    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure daemon is running - called on every /push-todo command.
 * Same as Python's ensure_daemon_running().
 */
export function ensureDaemonRunning() {
  const status = getDaemonStatus();
  if (!status.running) {
    startDaemon();
  }
}

export { PID_FILE, LOG_FILE, STATUS_FILE, PUSH_DIR };
