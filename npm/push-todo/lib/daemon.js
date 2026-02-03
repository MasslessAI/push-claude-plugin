#!/usr/bin/env node
/**
 * Push Task Execution Daemon
 *
 * Polls Supabase for queued tasks and executes them via Claude Code.
 * Auto-heals (starts) on any /push-todo command via daemon-health.js.
 *
 * Architecture:
 * - Git branch = worktree = Claude session (1:1:1 mapping)
 * - Uses Claude's --continue to resume sessions in worktrees
 * - Certainty analysis determines execution mode
 *
 * Ported from: plugins/push-todo/scripts/daemon.py
 */

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== Configuration ====================

const API_BASE_URL = 'https://jxuzqcbqhiaxmfitzxlo.supabase.co/functions/v1';
const POLL_INTERVAL = 30000; // 30 seconds
const MAX_CONCURRENT_TASKS = 5;
const TASK_TIMEOUT_MS = 3600000; // 1 hour
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_INITIAL_DELAY = 2000;

// Certainty thresholds (same as Python)
const CERTAINTY_HIGH_THRESHOLD = 0.7;
const CERTAINTY_LOW_THRESHOLD = 0.4;

// Paths
const PUSH_DIR = join(homedir(), '.push');
const CONFIG_DIR = join(homedir(), '.config', 'push');
const PID_FILE = join(PUSH_DIR, 'daemon.pid');
const LOG_FILE = join(PUSH_DIR, 'daemon.log');
const STATUS_FILE = join(PUSH_DIR, 'daemon_status.json');
const VERSION_FILE = join(PUSH_DIR, 'daemon.version');
const CONFIG_FILE = join(CONFIG_DIR, 'config');

// State
const runningTasks = new Map(); // displayNumber -> { process, task, startTime }
const completedToday = [];
let startedAt = null;

// ==================== Logging ====================

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;

  if (process.env.PUSH_DAEMON !== '1') {
    process.stdout.write(line);
  }

  try {
    appendFileSync(LOG_FILE, line);
  } catch {}
}

function logError(message) {
  log(message, 'ERROR');
}

// ==================== Config ====================

function getApiKey() {
  if (process.env.PUSH_API_KEY) {
    return process.env.PUSH_API_KEY;
  }

  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf8');
      const match = content.match(/^export\s+PUSH_API_KEY\s*=\s*["']?([^"'\n]+)["']?/m);
      if (match) return match[1];
    } catch {}
  }

  return null;
}

function getMachineId() {
  const machineIdFile = join(CONFIG_DIR, 'machine_id');
  if (existsSync(machineIdFile)) {
    try {
      return readFileSync(machineIdFile, 'utf8').trim();
    } catch {}
  }
  return null;
}

// ==================== API ====================

async function apiRequest(endpoint, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No API key configured');
  }

  const url = `${API_BASE_URL}/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  return response;
}

async function fetchQueuedTasks() {
  try {
    const machineId = getMachineId();
    const params = new URLSearchParams();
    params.set('status', 'queued');
    if (machineId) {
      params.set('machine_id', machineId);
    }

    const response = await apiRequest(`queued-tasks?${params}`);

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.tasks || [];
  } catch (error) {
    logError(`Failed to fetch queued tasks: ${error.message}`);
    return [];
  }
}

async function updateTaskStatus(displayNumber, status, extra = {}) {
  try {
    const payload = {
      displayNumber,
      status,
      ...extra
    };

    const response = await apiRequest('update-task-execution', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    return response.ok;
  } catch (error) {
    logError(`Failed to update task status: ${error.message}`);
    return false;
  }
}

// ==================== Project Registry ====================

function getProjectPath(gitRemote) {
  const registryFile = join(CONFIG_DIR, 'projects.json');

  if (!existsSync(registryFile)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(registryFile, 'utf8'));
    return data.projects?.[gitRemote]?.path || null;
  } catch {
    return null;
  }
}

// ==================== Task Execution ====================

function executeTask(task) {
  const displayNumber = task.displayNumber || task.display_number;
  const gitRemote = task.gitRemote || task.git_remote;
  const summary = task.summary || 'No summary';

  log(`Starting task #${displayNumber}: ${summary}`);

  // Get project path
  const projectPath = getProjectPath(gitRemote);
  if (!projectPath) {
    logError(`No project path for ${gitRemote}`);
    updateTaskStatus(displayNumber, 'failed', {
      error: `Project not registered: ${gitRemote}`
    });
    return null;
  }

  if (!existsSync(projectPath)) {
    logError(`Project path does not exist: ${projectPath}`);
    updateTaskStatus(displayNumber, 'failed', {
      error: `Project path not found: ${projectPath}`
    });
    return null;
  }

  // Build prompt for Claude
  const content = task.normalizedContent || task.content || task.summary || '';
  const transcript = task.originalTranscript || task.transcript || '';

  let prompt = `Task #${displayNumber}: ${summary}\n\n`;
  if (content) {
    prompt += `${content}\n\n`;
  }
  if (transcript && transcript !== content) {
    prompt += `Original voice note: "${transcript}"\n`;
  }

  // Update status to running
  updateTaskStatus(displayNumber, 'running');

  // Spawn Claude process
  const claudeArgs = ['--print', '--dangerously-skip-permissions', '-p', prompt];

  const child = spawn('claude', claudeArgs, {
    cwd: projectPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PUSH_TASK_ID: task.id,
      PUSH_DISPLAY_NUMBER: String(displayNumber)
    }
  });

  const taskInfo = {
    process: child,
    task,
    displayNumber,
    startTime: Date.now(),
    stdout: '',
    stderr: ''
  };

  // Capture output
  child.stdout.on('data', (data) => {
    taskInfo.stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    taskInfo.stderr += data.toString();
  });

  // Handle completion
  child.on('close', (code) => {
    runningTasks.delete(displayNumber);

    const duration = Math.floor((Date.now() - taskInfo.startTime) / 1000);
    log(`Task #${displayNumber} completed with code ${code} (${duration}s)`);

    if (code === 0) {
      updateTaskStatus(displayNumber, 'completed', {
        duration,
        output: taskInfo.stdout.slice(-1000) // Last 1000 chars
      });

      completedToday.push({
        displayNumber,
        summary,
        completedAt: new Date().toISOString(),
        duration
      });
    } else {
      updateTaskStatus(displayNumber, 'failed', {
        error: `Exit code ${code}`,
        stderr: taskInfo.stderr.slice(-500)
      });
    }

    updateStatusFile();
  });

  child.on('error', (error) => {
    runningTasks.delete(displayNumber);
    logError(`Task #${displayNumber} error: ${error.message}`);

    updateTaskStatus(displayNumber, 'failed', {
      error: error.message
    });

    updateStatusFile();
  });

  runningTasks.set(displayNumber, taskInfo);
  return taskInfo;
}

// ==================== Status File ====================

function updateStatusFile() {
  const status = {
    running: true,
    pid: process.pid,
    startedAt,
    version: getVersion(),
    runningTasks: Array.from(runningTasks.values()).map(t => ({
      displayNumber: t.displayNumber,
      summary: t.task.summary || 'No summary',
      status: 'running',
      startTime: new Date(t.startTime).toISOString()
    })),
    queuedTasks: [],
    completedToday: completedToday.slice(-20), // Last 20
    updatedAt: new Date().toISOString()
  };

  try {
    writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch {}
}

function getVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '3.0.0';
  } catch {
    return '3.0.0';
  }
}

// ==================== Main Loop ====================

async function pollAndExecute() {
  // Check for available slots
  if (runningTasks.size >= MAX_CONCURRENT_TASKS) {
    log(`All ${MAX_CONCURRENT_TASKS} slots in use, skipping poll`);
    return;
  }

  const availableSlots = MAX_CONCURRENT_TASKS - runningTasks.size;

  // Fetch queued tasks
  const tasks = await fetchQueuedTasks();

  if (tasks.length === 0) {
    return;
  }

  log(`Found ${tasks.length} queued tasks, ${availableSlots} slots available`);

  // Execute tasks up to available slots
  for (const task of tasks.slice(0, availableSlots)) {
    const displayNumber = task.displayNumber || task.display_number;

    // Skip if already running
    if (runningTasks.has(displayNumber)) {
      continue;
    }

    executeTask(task);
  }

  updateStatusFile();
}

async function checkTimeouts() {
  const now = Date.now();

  for (const [displayNumber, taskInfo] of runningTasks) {
    const elapsed = now - taskInfo.startTime;

    if (elapsed > TASK_TIMEOUT_MS) {
      log(`Task #${displayNumber} timed out after ${Math.floor(elapsed / 1000)}s`);

      try {
        taskInfo.process.kill('SIGTERM');
      } catch {}

      runningTasks.delete(displayNumber);

      updateTaskStatus(displayNumber, 'failed', {
        error: 'Task timed out'
      });
    }
  }
}

async function mainLoop() {
  log('Daemon starting...');

  startedAt = new Date().toISOString();

  // Write version file
  try {
    writeFileSync(VERSION_FILE, getVersion());
  } catch {}

  // Initial status
  updateStatusFile();

  // Main poll loop
  const poll = async () => {
    try {
      await pollAndExecute();
      await checkTimeouts();
    } catch (error) {
      logError(`Poll error: ${error.message}`);
    }
  };

  // Initial poll
  await poll();

  // Set up interval
  setInterval(poll, POLL_INTERVAL);

  log(`Daemon running (PID: ${process.pid}, poll interval: ${POLL_INTERVAL / 1000}s)`);
}

// ==================== Signal Handling ====================

function cleanup() {
  log('Daemon shutting down...');

  // Kill running tasks
  for (const [displayNumber, taskInfo] of runningTasks) {
    log(`Killing task #${displayNumber}`);
    try {
      taskInfo.process.kill('SIGTERM');
    } catch {}
  }

  // Clean up files
  try { unlinkSync(PID_FILE); } catch {}

  // Update status
  try {
    writeFileSync(STATUS_FILE, JSON.stringify({
      running: false,
      stoppedAt: new Date().toISOString()
    }));
  } catch {}

  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  cleanup();
});

// ==================== Entry Point ====================

// Ensure directories exist
mkdirSync(PUSH_DIR, { recursive: true });

// Write PID file
writeFileSync(PID_FILE, String(process.pid));

// Start main loop
mainLoop().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  cleanup();
});
