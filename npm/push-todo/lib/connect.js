/**
 * Connect and authentication module for Push CLI.
 *
 * Handles the "doctor" flow for setting up and validating
 * the CLI connection to Push backend.
 */

import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import * as api from './api.js';
import { getApiKey, saveCredentials, getConfigValue } from './config.js';
import { getMachineId, getMachineName } from './machine-id.js';
import { getRegistry } from './project-registry.js';
import { getGitRemote, isGitRepo, getGitRoot } from './utils/git.js';
import { isE2EEAvailable } from './encryption.js';
import { bold, green, yellow, red, cyan, dim, muted } from './utils/colors.js';

// Supabase anonymous key for auth flow
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dXpxY2JxaGlheG1maXR6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0ODA5MjIsImV4cCI6MjA0ODA1NjkyMn0.Qxov5qJTVLWmseyFNhBQBJN7-t5sXlHZyzFKhSN_e5g';

const VERSION = '3.0.0';

/**
 * Check if a newer version is available.
 *
 * @returns {Promise<Object>} Version check result
 */
async function checkVersion() {
  const latest = await api.getLatestVersion();

  if (!latest) {
    return { current: VERSION, latest: null, updateAvailable: false };
  }

  const currentParts = VERSION.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  let updateAvailable = false;
  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) {
      updateAvailable = true;
      break;
    } else if (latestParts[i] < currentParts[i]) {
      break;
    }
  }

  return { current: VERSION, latest, updateAvailable };
}

/**
 * Validate the current API key.
 *
 * @returns {Promise<Object>} Validation result
 */
async function validateApiKeyStatus() {
  const apiKey = getApiKey();

  if (!apiKey) {
    return { status: 'missing', message: 'No API key configured' };
  }

  const result = await api.validateApiKey();

  if (result.valid) {
    return { status: 'valid', email: result.email, userId: result.userId };
  }

  return { status: 'invalid', message: result.reason };
}

/**
 * Validate machine registration.
 *
 * @returns {Promise<Object>} Validation result
 */
async function validateMachineStatus() {
  const machineId = getMachineId();
  const machineName = getMachineName();

  try {
    const result = await api.validateMachine(machineId);
    return {
      status: 'valid',
      machineId,
      machineName,
      ...result
    };
  } catch (error) {
    return {
      status: 'error',
      machineId,
      machineName,
      message: error.message
    };
  }
}

/**
 * Validate project registration.
 *
 * @returns {Object} Validation result
 */
function validateProjectStatus() {
  if (!isGitRepo()) {
    return { status: 'not_git', message: 'Not in a git repository' };
  }

  const gitRemote = getGitRemote();
  if (!gitRemote) {
    return { status: 'no_remote', message: 'No git remote configured' };
  }

  const registry = getRegistry();
  const isRegistered = registry.isRegistered(gitRemote);
  const localPath = registry.getPathWithoutUpdate(gitRemote);

  return {
    status: isRegistered ? 'registered' : 'unregistered',
    gitRemote,
    localPath,
    gitRoot: getGitRoot()
  };
}

/**
 * Generate a random auth code for the authentication flow.
 *
 * @returns {string} 6-character alphanumeric code
 */
function generateAuthCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Open a URL in the default browser.
 *
 * @param {string} url - URL to open
 */
function openBrowser(url) {
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (process.platform === 'linux') {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    console.log(`Please open this URL manually: ${url}`);
  }
}

/**
 * Poll for authentication completion.
 *
 * @param {string} authCode - The auth code to poll for
 * @param {number} timeout - Timeout in seconds
 * @returns {Promise<Object|null>} Credentials or null if timeout
 */
async function pollForAuth(authCode, timeout = 300) {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while ((Date.now() - startTime) < timeout * 1000) {
    try {
      const response = await fetch(
        `https://jxuzqcbqhiaxmfitzxlo.supabase.co/functions/v1/poll-auth?code=${authCode}`,
        {
          headers: {
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.api_key) {
          return data;
        }
      }
    } catch {
      // Ignore errors during polling
    }

    await setTimeout(pollInterval);
  }

  return null;
}

/**
 * Run the authentication flow.
 *
 * @returns {Promise<boolean>} True if successful
 */
async function runAuthFlow() {
  const authCode = generateAuthCode();
  const authUrl = `https://pushto.do/connect?code=${authCode}`;

  console.log('');
  console.log(bold('Authentication Required'));
  console.log('');
  console.log(`Opening browser to: ${cyan(authUrl)}`);
  console.log('');
  console.log(`Or enter this code manually: ${bold(authCode)}`);
  console.log('');
  console.log(dim('Waiting for authentication...'));

  openBrowser(authUrl);

  const credentials = await pollForAuth(authCode);

  if (!credentials) {
    console.log(red('Authentication timed out. Please try again.'));
    return false;
  }

  // Save credentials
  saveCredentials(credentials.api_key, credentials.user_id, credentials.email);

  console.log('');
  console.log(green('✓ Authentication successful!'));
  console.log(`  Logged in as: ${credentials.email}`);

  return true;
}

/**
 * Register the current project.
 *
 * @param {string[]} keywords - Project keywords
 * @param {string} description - Project description
 * @returns {Promise<boolean>} True if successful
 */
async function registerCurrentProject(keywords = [], description = '') {
  const gitRemote = getGitRemote();
  const gitRoot = getGitRoot();

  if (!gitRemote || !gitRoot) {
    console.log(yellow('Cannot register: not in a git repository with a remote.'));
    return false;
  }

  // Register locally
  const registry = getRegistry();
  const isNew = registry.register(gitRemote, gitRoot);

  // Register with backend
  try {
    await api.registerProject(gitRemote, keywords, description);
    console.log(green(`✓ Project registered: ${gitRemote}`));
    return true;
  } catch (error) {
    console.log(yellow(`Local registration OK, but backend registration failed: ${error.message}`));
    return false;
  }
}

/**
 * Print a status line with icon.
 *
 * @param {string} icon - Status icon
 * @param {string} label - Status label
 * @param {string} value - Status value
 */
function printStatus(icon, label, value) {
  console.log(`  ${icon} ${label}: ${value}`);
}

/**
 * Run the connect/doctor flow.
 *
 * @param {Object} options - Options from CLI
 * @returns {Promise<void>}
 */
export async function runConnect(options = {}) {
  console.log('');
  console.log(bold('Push Connect - Diagnostic Check'));
  console.log(dim('=' .repeat(40)));
  console.log('');

  let allPassed = true;

  // Step 1: Version check
  console.log(bold('1. Version Check'));
  const versionStatus = await checkVersion();
  if (versionStatus.updateAvailable) {
    printStatus(yellow('⚠'), 'Version', `${versionStatus.current} → ${versionStatus.latest} available`);
    console.log(dim(`   Update: npm update -g @masslessai/push-todo`));
    allPassed = false;
  } else {
    printStatus(green('✓'), 'Version', `${versionStatus.current} (latest)`);
  }
  console.log('');

  // Step 2: API Key validation
  console.log(bold('2. API Key'));
  let keyStatus = await validateApiKeyStatus();

  if (keyStatus.status === 'missing' || keyStatus.status === 'invalid') {
    printStatus(red('✗'), 'API Key', keyStatus.message || 'Invalid');
    console.log('');

    // Run auth flow
    const authSuccess = await runAuthFlow();
    if (authSuccess) {
      keyStatus = await validateApiKeyStatus();
    } else {
      allPassed = false;
    }
  }

  if (keyStatus.status === 'valid') {
    printStatus(green('✓'), 'API Key', `Valid (${keyStatus.email})`);
  }
  console.log('');

  // Step 3: Machine validation
  console.log(bold('3. Machine'));
  const machineStatus = await validateMachineStatus();
  if (machineStatus.status === 'valid') {
    printStatus(green('✓'), 'Machine', machineStatus.machineName);
    printStatus(dim('·'), 'ID', machineStatus.machineId);
  } else {
    printStatus(yellow('⚠'), 'Machine', machineStatus.message || 'Not validated');
    allPassed = false;
  }
  console.log('');

  // Step 4: Project validation
  console.log(bold('4. Project'));
  const projectStatus = validateProjectStatus();

  if (projectStatus.status === 'registered') {
    printStatus(green('✓'), 'Project', projectStatus.gitRemote);
    printStatus(dim('·'), 'Path', projectStatus.localPath);
  } else if (projectStatus.status === 'unregistered') {
    printStatus(yellow('⚠'), 'Project', `${projectStatus.gitRemote} (not registered)`);
    console.log('');

    // Offer to register
    if (keyStatus.status === 'valid') {
      const keywords = options.keywords ? options.keywords.split(',') : [];
      const description = options.description || '';
      await registerCurrentProject(keywords, description);
    }
  } else if (projectStatus.status === 'no_remote') {
    printStatus(yellow('⚠'), 'Project', 'No git remote configured');
    allPassed = false;
  } else {
    printStatus(dim('·'), 'Project', 'Not in a git repository');
  }
  console.log('');

  // Step 5: E2EE check
  console.log(bold('5. E2EE (End-to-End Encryption)'));
  const [e2eeAvailable, e2eeMessage] = isE2EEAvailable();
  if (e2eeAvailable) {
    printStatus(green('✓'), 'E2EE', 'Available');
  } else {
    printStatus(yellow('⚠'), 'E2EE', e2eeMessage);
  }
  console.log('');

  // Summary
  console.log(dim('=' .repeat(40)));
  if (allPassed) {
    console.log(green(bold('All checks passed!')));
  } else {
    console.log(yellow('Some checks need attention. See above for details.'));
  }
  console.log('');
}
