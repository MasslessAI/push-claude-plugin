/**
 * Push CLI - Voice tasks from Push iOS app for Claude Code
 *
 * Main module exports for programmatic usage.
 *
 * @module @masslessai/push-todo
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI entry point
export { run } from './cli.js';

// Task operations
export {
  listTasks,
  showTask,
  markComplete,
  queueForExecution,
  searchTasks,
  showStatus,
  offerBatch,
  runReview
} from './fetch.js';

// API client
export {
  fetchTasks,
  fetchTaskByNumber,
  markTaskCompleted,
  queueTask,
  queueTasks,
  searchTasks as apiSearchTasks,
  updateTaskExecution,
  validateApiKey,
  registerProject,
  getLatestVersion
} from './api.js';

// Connect and authentication
export { runConnect } from './connect.js';

// Watch/monitor
export { startWatch } from './watch.js';

// Configuration
export {
  getConfigValue,
  setConfigValue,
  getApiKey,
  saveCredentials,
  getAutoCommitEnabled,
  getMaxBatchSize,
  showSettings,
  toggleSetting
} from './config.js';

// Machine identification
export {
  getMachineId,
  getMachineName,
  getMachineInfo
} from './machine-id.js';

// Project registry
export {
  getRegistry,
  resetRegistry,
  ProjectRegistry,
  REGISTRY_FILE
} from './project-registry.js';

// Encryption
export {
  getEncryptionKey,
  decrypt,
  decryptTodoField,
  isE2EEAvailable
} from './encryption.js';

// Utilities
export {
  getGitRemote,
  isGitRepo,
  getCurrentBranch,
  getGitRoot,
  getRecentCommits,
  hasUncommittedChanges
} from './utils/git.js';

export {
  formatDuration,
  formatDate,
  formatTaskForDisplay,
  formatSearchResult,
  formatTaskTable,
  formatBatchOffer,
  truncate
} from './utils/format.js';

export {
  bold,
  dim,
  red,
  green,
  yellow,
  cyan,
  muted,
  codes,
  symbols,
  colorsEnabled
} from './utils/colors.js';

// Version - read from package.json (DRY - single source of truth)
function getVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '3.0.0';
  } catch {
    return '3.0.0';
  }
}

export const VERSION = getVersion();
