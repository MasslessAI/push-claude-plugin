/**
 * Configuration file helpers for Push CLI.
 *
 * Reads/writes config from ~/.config/push/config
 * Format: bash-style exports (export PUSH_KEY="value")
 *
 * Compatible with the Python version's config format.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'push');
const CONFIG_FILE = join(CONFIG_DIR, 'config');

/**
 * Get a configuration value from the config file.
 *
 * @param {string} key - Config key name (without PUSH_ prefix)
 * @param {string} defaultValue - Default value if not found
 * @returns {string} The config value or default
 */
export function getConfigValue(key, defaultValue = '') {
  const fullKey = `PUSH_${key}`;

  if (!existsSync(CONFIG_FILE)) {
    return defaultValue;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith(`export ${fullKey}=`)) {
        // Extract value after = and remove quotes
        let value = trimmed.split('=')[1] || '';
        value = value.trim();
        // Remove surrounding quotes (single or double)
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return value;
      }
    }
  } catch {
    // Config file exists but couldn't read
  }

  return defaultValue;
}

/**
 * Set a configuration value in the config file.
 *
 * @param {string} key - Config key name (without PUSH_ prefix)
 * @param {string} value - Value to set
 * @returns {boolean} True if successful
 */
export function setConfigValue(key, value) {
  const fullKey = `PUSH_${key}`;

  // Ensure config directory exists
  mkdirSync(CONFIG_DIR, { recursive: true });

  // Read existing config
  let lines = [];
  if (existsSync(CONFIG_FILE)) {
    try {
      lines = readFileSync(CONFIG_FILE, 'utf8').split('\n');
    } catch {
      lines = [];
    }
  }

  // Update or add the key
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(`export ${fullKey}=`)) {
      lines[i] = `export ${fullKey}="${value}"`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`export ${fullKey}="${value}"`);
  }

  // Write back
  try {
    writeFileSync(CONFIG_FILE, lines.join('\n') + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the API key from environment or config file.
 *
 * Priority:
 * 1. PUSH_API_KEY environment variable
 * 2. Config file at ~/.config/push/config
 *
 * @returns {string} The API key
 * @throws {Error} If API key is not found
 */
export function getApiKey() {
  // 1. Try environment first (for CI/testing)
  const envKey = process.env.PUSH_API_KEY;
  if (envKey) {
    return envKey;
  }

  // 2. Try config file
  const configKey = getConfigValue('API_KEY');
  if (configKey) {
    return configKey;
  }

  // 3. Not found
  throw new Error(
    'PUSH_API_KEY not configured.\n' +
    'Run: push-todo connect\n' +
    'Or manually add to ~/.config/push/config:\n' +
    '  export PUSH_API_KEY="your-key-here"'
  );
}

/**
 * Check if auto-commit is enabled.
 * Default: true (enabled by default)
 *
 * @returns {boolean}
 */
export function getAutoCommitEnabled() {
  const value = getConfigValue('AUTO_COMMIT', 'true');
  return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
}

/**
 * Set auto-commit setting.
 *
 * @param {boolean} enabled
 * @returns {boolean} True if successful
 */
export function setAutoCommitEnabled(enabled) {
  return setConfigValue('AUTO_COMMIT', enabled ? 'true' : 'false');
}

/**
 * Get the maximum batch size for queuing tasks.
 * Default: 5
 *
 * @returns {number}
 */
export function getMaxBatchSize() {
  const value = getConfigValue('MAX_BATCH_SIZE', '5');
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 5 : parsed;
}

/**
 * Set the maximum batch size.
 *
 * @param {number} size - Must be 1-20
 * @returns {boolean} True if successful
 */
export function setMaxBatchSize(size) {
  if (size < 1 || size > 20) {
    return false;
  }
  return setConfigValue('MAX_BATCH_SIZE', String(size));
}

/**
 * Get the email from config.
 *
 * @returns {string|null}
 */
export function getEmail() {
  const email = getConfigValue('EMAIL');
  return email || null;
}

/**
 * Save API key and email to config.
 *
 * @param {string} apiKey
 * @param {string} email
 */
export function saveCredentials(apiKey, email) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  setConfigValue('API_KEY', apiKey);
  setConfigValue('EMAIL', email);
}

/**
 * Clear all credentials from config.
 */
export function clearCredentials() {
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf8');
      const lines = content.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('export PUSH_API_KEY=') &&
               !trimmed.startsWith('export PUSH_EMAIL=');
      });
      writeFileSync(CONFIG_FILE, lines.join('\n'));
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Show all settings.
 */
export function showSettings() {
  console.log();
  console.log('  Push Settings');
  console.log('  ' + '='.repeat(40));
  console.log();

  const autoCommit = getAutoCommitEnabled();
  const batchSize = getMaxBatchSize();

  console.log(`  auto-commit:  ${autoCommit ? 'ON' : 'OFF'}`);
  console.log('                Auto-commit when task completes');
  console.log();
  console.log(`  batch-size:   ${batchSize}`);
  console.log('                Max tasks for batch queue (1-20)');
  console.log();
  console.log('  Toggle with: push-todo setting <name>');
  console.log('  Example:     push-todo setting auto-commit');
  console.log();
}

/**
 * Toggle a setting by name.
 *
 * @param {string} settingName
 * @returns {boolean} True if setting was toggled
 */
export function toggleSetting(settingName) {
  const normalized = settingName.toLowerCase().replace(/_/g, '-');

  if (normalized === 'auto-commit') {
    const current = getAutoCommitEnabled();
    const newValue = !current;
    if (setAutoCommitEnabled(newValue)) {
      console.log(`Auto-commit is now ${newValue ? 'ON' : 'OFF'}`);
      if (newValue) {
        console.log('Tasks will be auto-committed (without push) when completed.');
      } else {
        console.log('Tasks will NOT be auto-committed when completed.');
      }
      return true;
    }
    console.error('Failed to update setting');
    return false;
  }

  if (normalized === 'batch-size') {
    const batchSize = getMaxBatchSize();
    console.log(`Current batch size: ${batchSize}`);
    console.log('Change with: push-todo --set-batch-size N');
    return true;
  }

  console.error(`Unknown setting: ${settingName}`);
  console.error('Available settings: auto-commit, batch-size');
  return false;
}

export { CONFIG_DIR, CONFIG_FILE };
