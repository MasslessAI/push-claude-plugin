/**
 * Task fetching and display for Push CLI.
 *
 * Main module for listing, viewing, and managing tasks.
 */

import * as api from './api.js';
import { getMachineId, getMachineName } from './machine-id.js';
import { getRegistry } from './project-registry.js';
import { getGitRemote, isGitRepo } from './utils/git.js';
import { formatTaskForDisplay, formatTaskTable, formatSearchResult, formatBatchOffer } from './utils/format.js';
import { bold, green, yellow, red, cyan, dim, muted } from './utils/colors.js';
import { decryptTodoField, isE2EEAvailable } from './encryption.js';
import { getAutoCommitEnabled, getMaxBatchSize } from './config.js';

/**
 * Decrypt encrypted fields in a task object.
 *
 * @param {Object} task - Task object from API
 * @returns {Object} Task with decrypted fields
 */
function decryptTaskFields(task) {
  const decrypted = { ...task };

  // Fields that may be encrypted
  const encryptedFields = [
    'summary',
    'content',
    'normalizedContent',
    'normalized_content',
    'originalTranscript',
    'original_transcript',
    'transcript'
  ];

  for (const field of encryptedFields) {
    if (decrypted[field]) {
      decrypted[field] = decryptTodoField(decrypted[field]);
    }
  }

  return decrypted;
}

/**
 * List tasks for the current project or all projects.
 *
 * @param {Object} options - List options
 * @param {boolean} options.allProjects - List tasks from all projects
 * @param {boolean} options.backlog - Only show backlog items
 * @param {boolean} options.includeBacklog - Include backlog items
 * @param {boolean} options.completed - Only show completed items
 * @param {boolean} options.includeCompleted - Include completed items
 * @param {boolean} options.json - Output as JSON
 * @returns {Promise<void>}
 */
export async function listTasks(options = {}) {
  // Determine git remote
  let gitRemote = null;
  if (!options.allProjects) {
    gitRemote = getGitRemote();
    if (!gitRemote && isGitRepo()) {
      console.error(yellow('Warning: In a git repo but no remote configured.'));
    }
  }

  // Fetch tasks
  const tasks = await api.fetchTasks(gitRemote, {
    backlogOnly: options.backlog,
    includeBacklog: options.includeBacklog,
    completedOnly: options.completed,
    includeCompleted: options.includeCompleted
  });

  // Decrypt if E2EE is available
  const decryptedTasks = tasks.map(decryptTaskFields);

  // Output
  if (options.json) {
    console.log(JSON.stringify(decryptedTasks, null, 2));
    return;
  }

  if (decryptedTasks.length === 0) {
    const scope = gitRemote ? `for ${cyan(gitRemote)}` : 'across all projects';
    console.log(`No active tasks ${scope}.`);
    return;
  }

  // Group by status for display
  const active = decryptedTasks.filter(t => !t.isCompleted && !t.is_completed && !t.isBacklog && !t.is_backlog);
  const backlog = decryptedTasks.filter(t => !t.isCompleted && !t.is_completed && (t.isBacklog || t.is_backlog));
  const completed = decryptedTasks.filter(t => t.isCompleted || t.is_completed);

  // Header
  const scope = gitRemote ? gitRemote : 'All Projects';
  console.log(bold(`\nPush Tasks - ${scope}\n`));

  // Active tasks
  if (active.length > 0) {
    console.log(green(`Active (${active.length}):`));
    console.log(formatTaskTable(active));
    console.log('');
  }

  // Backlog tasks (if requested)
  if (backlog.length > 0 && (options.backlog || options.includeBacklog)) {
    console.log(yellow(`Backlog (${backlog.length}):`));
    console.log(formatTaskTable(backlog));
    console.log('');
  }

  // Completed tasks (if requested)
  if (completed.length > 0 && (options.completed || options.includeCompleted)) {
    console.log(dim(`Completed (${completed.length}):`));
    console.log(formatTaskTable(completed));
    console.log('');
  }

  // Summary
  const total = active.length + (options.includeBacklog ? backlog.length : 0);
  console.log(muted(`Showing ${total} task(s). Use --include-backlog or --completed for more.`));
}

/**
 * Show a specific task by display number.
 *
 * @param {number} displayNumber - The task's display number
 * @param {Object} options - Display options
 * @param {boolean} options.json - Output as JSON
 * @returns {Promise<void>}
 */
export async function showTask(displayNumber, options = {}) {
  const task = await api.fetchTaskByNumber(displayNumber);

  if (!task) {
    console.error(red(`Task #${displayNumber} not found.`));
    process.exit(1);
  }

  const decrypted = decryptTaskFields(task);

  if (options.json) {
    console.log(JSON.stringify(decrypted, null, 2));
    return;
  }

  console.log(formatTaskForDisplay(decrypted));
}

/**
 * Get a task by display number (for programmatic use).
 *
 * @param {number} displayNumber - The task's display number
 * @returns {Promise<Object|null>} The task object or null if not found
 */
export async function getTaskByNumber(displayNumber) {
  const task = await api.fetchTaskByNumber(displayNumber);
  if (!task) {
    return null;
  }
  return decryptTaskFields(task);
}

/**
 * Mark a task as completed.
 *
 * @param {string} taskId - UUID of the task
 * @param {string} comment - Completion comment
 * @returns {Promise<void>}
 */
export async function markComplete(taskId, comment = '') {
  await api.markTaskCompleted(taskId, comment);
  console.log(green(`Task marked as completed.`));
}

/**
 * Queue tasks for daemon execution.
 *
 * @param {string} numbersStr - Comma-separated display numbers
 * @returns {Promise<void>}
 */
export async function queueForExecution(numbersStr) {
  const numbers = numbersStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));

  if (numbers.length === 0) {
    console.error(red('No valid task numbers provided.'));
    process.exit(1);
  }

  const results = await api.queueTasks(numbers);

  if (results.success.length > 0) {
    console.log(green(`Queued: ${results.success.join(', ')}`));
  }

  if (results.failed.length > 0) {
    for (const { num, error } of results.failed) {
      console.error(red(`Failed to queue #${num}: ${error}`));
    }
  }
}

/**
 * Search tasks by query.
 *
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {boolean} options.allProjects - Search all projects
 * @param {boolean} options.json - Output as JSON
 * @returns {Promise<void>}
 */
export async function searchTasks(query, options = {}) {
  let gitRemote = null;
  if (!options.allProjects) {
    gitRemote = getGitRemote();
  }

  const results = await api.searchTasks(query, gitRemote);
  const decrypted = results.map(decryptTaskFields);

  if (options.json) {
    console.log(JSON.stringify(decrypted, null, 2));
    return;
  }

  if (decrypted.length === 0) {
    console.log(`No tasks found matching "${query}".`);
    return;
  }

  console.log(bold(`\nSearch Results for "${query}":\n`));
  for (const result of decrypted) {
    console.log(formatSearchResult(result));
  }
  console.log('');
}

/**
 * Show status information.
 *
 * @param {Object} options - Status options
 * @param {boolean} options.json - Output as JSON
 * @returns {Promise<void>}
 */
export async function showStatus(options = {}) {
  const machineId = getMachineId();
  const machineName = getMachineName();
  const gitRemote = getGitRemote();
  const registry = getRegistry();
  const [e2eeAvailable, e2eeMessage] = isE2EEAvailable();
  const autoCommit = getAutoCommitEnabled();
  const maxBatch = getMaxBatchSize();

  // Validate API key
  const keyStatus = await api.validateApiKey();

  const status = {
    machine: {
      id: machineId,
      name: machineName
    },
    project: {
      gitRemote,
      isGitRepo: isGitRepo(),
      isRegistered: gitRemote ? registry.isRegistered(gitRemote) : false
    },
    api: {
      valid: keyStatus.valid,
      email: keyStatus.email || null
    },
    e2ee: {
      available: e2eeAvailable,
      message: e2eeMessage
    },
    settings: {
      autoCommit,
      maxBatchSize: maxBatch
    },
    registeredProjects: registry.projectCount()
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(bold('\nPush Status\n'));

  // Machine
  console.log(`${bold('Machine:')} ${machineName}`);
  console.log(`${bold('Machine ID:')} ${machineId}`);
  console.log('');

  // API
  if (status.api.valid) {
    const emailPart = status.api.email ? ` (${status.api.email})` : '';
    console.log(`${bold('API:')} ${green('Connected')}${emailPart}`);
  } else {
    console.log(`${bold('API:')} ${red('Not connected')} - run "push-todo connect"`);
  }
  console.log('');

  // Project
  if (gitRemote) {
    console.log(`${bold('Project:')} ${gitRemote}`);
    console.log(`${bold('Registered:')} ${status.project.isRegistered ? green('Yes') : yellow('No')}`);
  } else if (status.project.isGitRepo) {
    console.log(`${bold('Project:')} ${yellow('No remote configured')}`);
  } else {
    console.log(`${bold('Project:')} ${dim('Not in a git repository')}`);
  }
  console.log('');

  // E2EE
  console.log(`${bold('E2EE:')} ${e2eeAvailable ? green('Available') : yellow(e2eeMessage)}`);
  console.log('');

  // Settings
  console.log(`${bold('Auto-commit:')} ${autoCommit ? 'Enabled' : 'Disabled'}`);
  console.log(`${bold('Max batch size:')} ${maxBatch}`);
  console.log(`${bold('Registered projects:')} ${status.registeredProjects}`);
}

/**
 * Offer a batch of tasks for processing.
 *
 * @param {Object} options - Batch options
 * @returns {Promise<void>}
 */
export async function offerBatch(options = {}) {
  const gitRemote = options.allProjects ? null : getGitRemote();
  const maxBatch = getMaxBatchSize();

  const tasks = await api.fetchTasks(gitRemote, {
    includeBacklog: false,
    includeCompleted: false
  });

  const decrypted = tasks.map(decryptTaskFields);
  const active = decrypted.filter(t => !t.isCompleted && !t.is_completed && !t.isBacklog && !t.is_backlog);

  if (active.length === 0) {
    console.log('No active tasks to offer.');
    return;
  }

  // Take up to maxBatch tasks
  const batch = active.slice(0, maxBatch);

  if (options.json) {
    console.log(JSON.stringify(batch, null, 2));
    return;
  }

  console.log(formatBatchOffer(batch));
}

/**
 * Run the review flow for completed tasks.
 *
 * @param {Object} options - Review options
 * @returns {Promise<void>}
 */
export async function runReview(options = {}) {
  const gitRemote = options.allProjects ? null : getGitRemote();

  const tasks = await api.fetchTasks(gitRemote, {
    completedOnly: true
  });

  const decrypted = tasks.map(decryptTaskFields);

  if (decrypted.length === 0) {
    console.log('No completed tasks to review.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(decrypted, null, 2));
    return;
  }

  console.log(bold(`\nCompleted Tasks for Review (${decrypted.length}):\n`));
  console.log(formatTaskTable(decrypted));
}
