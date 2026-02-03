/**
 * Connect and authentication module for Push CLI (Doctor Mode).
 *
 * Comprehensive health check and connect tool:
 * - Version check: Compare local vs remote plugin version
 * - API validation: Verify API key is still valid
 * - Project registration: Register current project with keywords
 * - Authentication: Handle initial auth or re-auth when needed
 * - E2EE setup: Compile Swift helper, import encryption key
 * - Machine validation: Multi-Mac coordination
 *
 * Ported from: plugins/push-todo/scripts/connect.py
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, chmodSync, readFileSync } from 'fs';
import { setTimeout } from 'timers/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as api from './api.js';
import { getApiKey, saveCredentials, clearCredentials, getConfigValue, getEmail } from './config.js';
import { getMachineId, getMachineName } from './machine-id.js';
import { getRegistry } from './project-registry.js';
import { getGitRemote, isGitRepo, getGitRoot } from './utils/git.js';
import { isE2EEAvailable } from './encryption.js';
import { ensureDaemonRunning } from './daemon-health.js';
import { bold, green, yellow, red, cyan, dim } from './utils/colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase anonymous key for auth flow
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dXpxY2JxaGlheG1maXR6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0ODA5MjIsImV4cCI6MjA0ODA1NjkyMn0.Qxov5qJTVLWmseyFNhBQBJN7-t5sXlHZyzFKhSN_e5g';

// Get version from package.json
function getVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '3.0.0';
  } catch {
    return '3.0.0';
  }
}

const VERSION = getVersion();

// Client types
const CLIENT_NAMES = {
  'claude-code': 'Claude Code',
  'openai-codex': 'OpenAI Codex',
  'clawdbot': 'Clawdbot'
};

// ============================================================================
// E2EE SETUP (End-to-End Encryption)
// ============================================================================

/**
 * Get the plugin/package root directory.
 */
function getPluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  return join(__dirname, '..');
}

/**
 * Get path to the Swift keychain helper binary.
 */
function getSwiftHelperPath() {
  return join(getPluginRoot(), 'bin', 'push-keychain-helper');
}

/**
 * Get path to the Swift keychain helper source.
 */
function getSwiftSourcePath() {
  return join(getPluginRoot(), 'natives', 'KeychainHelper.swift');
}

/**
 * Check if Swift compiler is available.
 */
function checkSwiftcAvailable() {
  try {
    const result = spawnSync('which', ['swiftc'], { timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if E2EE key exists in keychain.
 */
function checkE2EEKeyExists() {
  const helperPath = getSwiftHelperPath();
  if (!existsSync(helperPath)) {
    return false;
  }

  try {
    const result = spawnSync(helperPath, ['--check'], { timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Compile the Swift keychain helper from source.
 */
function compileSwiftHelper() {
  const sourcePath = getSwiftSourcePath();
  const binDir = join(getPluginRoot(), 'bin');
  const helperPath = getSwiftHelperPath();

  // Check if source exists
  if (!existsSync(sourcePath)) {
    return {
      status: 'no_source',
      message: `Swift source not found at ${sourcePath}`
    };
  }

  // Check for Swift compiler
  if (!checkSwiftcAvailable()) {
    return {
      status: 'no_swiftc',
      message: 'Swift compiler not found. Install Xcode Command Line Tools.'
    };
  }

  // Create bin directory
  mkdirSync(binDir, { recursive: true });

  // Compile
  try {
    const result = spawnSync('swiftc', ['-O', sourcePath, '-o', helperPath], {
      timeout: 60000,
      encoding: 'utf8'
    });

    if (result.status === 0) {
      return {
        status: 'success',
        message: 'Compiled encryption helper from source',
        path: helperPath
      };
    } else {
      return {
        status: 'compile_error',
        message: `Compilation failed: ${result.stderr}`
      };
    }
  } catch (error) {
    return {
      status: 'compile_error',
      message: `Compilation error: ${error.message}`
    };
  }
}

/**
 * Set up E2EE support for the CLI.
 */
function setupE2EE() {
  const helperPath = getSwiftHelperPath();
  const sourcePath = getSwiftSourcePath();

  // Case 1: Helper already exists
  if (existsSync(helperPath)) {
    const keyExists = checkE2EEKeyExists();
    if (keyExists) {
      return {
        status: 'ready',
        message: 'E2EE ready',
        keyAvailable: true
      };
    } else {
      return {
        status: 'not_enabled',
        message: 'E2EE helper ready, but no key found (enable in iOS app)',
        keyAvailable: false
      };
    }
  }

  // Case 2: Need to compile helper
  if (existsSync(sourcePath)) {
    if (checkSwiftcAvailable()) {
      const compileResult = compileSwiftHelper();

      if (compileResult.status === 'success') {
        const keyExists = checkE2EEKeyExists();
        return {
          status: 'compiled',
          message: 'Compiled encryption helper from source',
          keyAvailable: keyExists,
          sourcePath
        };
      } else {
        return {
          status: 'error',
          message: compileResult.message,
          keyAvailable: false
        };
      }
    } else {
      return {
        status: 'needs_setup',
        message: 'Swift compiler not found',
        keyAvailable: false,
        options: [
          'Install Xcode Command Line Tools: xcode-select --install',
          'Or use pre-signed binary (downloaded during npm install)'
        ],
        sourcePath
      };
    }
  }

  // Case 3: No source file - check if binary was downloaded
  return {
    status: 'error',
    message: 'E2EE helper not found. Run: npm rebuild @masslessai/push-todo',
    keyAvailable: false
  };
}

/**
 * Store E2EE key directly without interactive prompt.
 */
function storeE2EEKeyDirect(keyInput) {
  keyInput = keyInput.trim();

  // Validate format (should be base64, 44 chars for 32 bytes)
  try {
    const keyData = Buffer.from(keyInput, 'base64');
    if (keyData.length !== 32) {
      return {
        status: 'error',
        message: `Invalid key size: expected 32 bytes, got ${keyData.length}`
      };
    }
  } catch {
    return {
      status: 'error',
      message: 'Invalid base64 encoding'
    };
  }

  // Store via Swift helper
  let helperPath = getSwiftHelperPath();
  if (!existsSync(helperPath)) {
    const compileResult = compileSwiftHelper();
    if (compileResult.status !== 'success') {
      return {
        status: 'error',
        message: `Cannot compile helper: ${compileResult.message}`
      };
    }
  }

  try {
    const result = spawnSync(helperPath, ['--store'], {
      input: keyInput,
      timeout: 10000,
      encoding: 'utf8'
    });

    if (result.status === 0) {
      return {
        status: 'success',
        message: 'Key stored in macOS Keychain'
      };
    } else {
      return {
        status: 'error',
        message: `Failed to store key: ${result.stderr?.trim() || 'Unknown error'}`
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: `Error storing key: ${error.message}`
    };
  }
}

/**
 * Check if user has any encrypted todos.
 */
async function checkUserHasEncryptedTodos() {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return false;

    const response = await fetch(
      `https://jxuzqcbqhiaxmfitzxlo.supabase.co/functions/v1/synced-todos?is_encrypted=true&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) return false;

    const data = await response.json();
    const todos = data.todos || data;
    return Array.isArray(todos) && todos.length > 0;
  } catch {
    return false;
  }
}

/**
 * Show E2EE status and optionally prompt for import.
 */
async function showE2EEStatus(promptForImport = true) {
  const e2eeStatus = setupE2EE();

  console.log('');
  console.log(bold('E2EE (End-to-End Encryption)'));

  if (e2eeStatus.status === 'ready') {
    console.log(`  ${green('✓')} E2EE ready - encrypted tasks will be decrypted`);
    return;
  }

  if (e2eeStatus.status === 'not_enabled') {
    console.log(`  ${dim('·')} E2EE helper ready`);
    console.log(`  ${yellow('⚠')} No encryption key found in Keychain`);

    if (promptForImport) {
      // Check if user has encrypted todos
      const hasEncrypted = await checkUserHasEncryptedTodos();
      if (hasEncrypted) {
        console.log('');
        console.log('  Your account has encrypted tasks.');
        console.log('  To decrypt them, import your key:');
        console.log('');
        console.log('  1. Open Push app on iPhone');
        console.log('  2. Go to Settings > End-to-End Encryption');
        console.log('  3. Tap "Export Encryption Key"');
        console.log('  4. Run: push-todo connect --store-e2ee-key <key>');
      }
    }
    return;
  }

  if (e2eeStatus.status === 'compiled') {
    console.log(`  ${green('✓')} Compiled encryption helper`);
    if (e2eeStatus.keyAvailable) {
      console.log(`  ${green('✓')} Encryption key available`);
    } else {
      console.log(`  ${yellow('⚠')} No encryption key (enable E2EE in iOS app)`);
    }
    return;
  }

  if (e2eeStatus.status === 'needs_setup') {
    console.log(`  ${yellow('⚠')} ${e2eeStatus.message}`);
    if (e2eeStatus.options) {
      for (const opt of e2eeStatus.options) {
        console.log(`    - ${opt}`);
      }
    }
    return;
  }

  console.log(`  ${yellow('⚠')} ${e2eeStatus.message}`);
}

// ============================================================================
// VERSION CHECK
// ============================================================================

/**
 * Check if a newer version is available.
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
    if ((latestParts[i] || 0) > (currentParts[i] || 0)) {
      updateAvailable = true;
      break;
    } else if ((latestParts[i] || 0) < (currentParts[i] || 0)) {
      break;
    }
  }

  return { current: VERSION, latest, updateAvailable };
}

/**
 * Update the package to latest version.
 */
async function doUpdate() {
  console.log('Updating @masslessai/push-todo...');

  try {
    execSync('npm update -g @masslessai/push-todo', { stdio: 'inherit' });
    return { status: 'success', message: 'Updated successfully' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate the current API key.
 */
async function validateApiKeyStatus() {
  let apiKey;
  try {
    apiKey = getApiKey();
  } catch {
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

// ============================================================================
// AUTH FLOW
// ============================================================================

/**
 * Generate a random auth code for the authentication flow.
 */
function generateAuthCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Open a URL in the default browser.
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
 */
async function pollForAuth(authCode, timeout = 300) {
  const startTime = Date.now();
  const pollInterval = 2000;

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
 */
async function runAuthFlow(clientType = 'claude-code') {
  const authCode = generateAuthCode();
  const authUrl = `https://pushto.do/connect?code=${authCode}&client=${clientType}`;

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
  saveCredentials(credentials.api_key, credentials.email);

  console.log('');
  console.log(green('✓ Authentication successful!'));
  console.log(`  Logged in as: ${credentials.email}`);

  return true;
}

/**
 * Register the current project.
 */
async function registerCurrentProject(keywords = [], description = '', clientType = 'claude-code') {
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
    if (isNew) {
      console.log(dim(`  Local path: ${gitRoot}`));
    }
    return true;
  } catch (error) {
    console.log(yellow(`Local registration OK, but backend registration failed: ${error.message}`));
    return false;
  }
}

/**
 * Print a status line with icon.
 */
function printStatus(icon, label, value) {
  console.log(`  ${icon} ${label}: ${value}`);
}

// ============================================================================
// MAIN CONNECT FLOW
// ============================================================================

/**
 * Run the connect/doctor flow.
 *
 * @param {Object} options - Options from CLI
 */
export async function runConnect(options = {}) {
  // Self-healing: ensure daemon is running
  ensureDaemonRunning();

  const clientType = options.client || 'claude-code';
  const clientName = CLIENT_NAMES[clientType] || 'Claude Code';

  // Handle --check-version (JSON output)
  if (options['check-version'] || options.checkVersion) {
    const result = await checkVersion();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Handle --update
  if (options.update) {
    const result = await doUpdate();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Handle --validate-key (JSON output)
  if (options['validate-key'] || options.validateKey) {
    const result = await validateApiKeyStatus();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Handle --validate-machine (JSON output)
  if (options['validate-machine'] || options.validateMachine) {
    const result = await validateMachineStatus();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Handle --validate-project (JSON output)
  if (options['validate-project'] || options.validateProject) {
    const result = validateProjectStatus();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Handle --store-e2ee-key
  if (options['store-e2ee-key'] || options.storeE2eeKey) {
    const key = options['store-e2ee-key'] || options.storeE2eeKey;
    const result = storeE2EEKeyDirect(key);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Handle --status (show status without registering)
  if (options.status) {
    await showStatus();
    return;
  }

  // Handle --reauth
  if (options.reauth) {
    console.log('Forcing re-authentication...');
    clearCredentials();
  }

  // ─────────────────────────────────────────────────────────────────
  // FULL DOCTOR FLOW
  // ─────────────────────────────────────────────────────────────────

  console.log('');
  console.log(bold(`Push Connect - ${clientName}`));
  console.log(dim('='.repeat(40)));
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
    const authSuccess = await runAuthFlow(clientType);
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
      const keywords = options.keywords ? options.keywords.split(',').map(k => k.trim()) : [];
      const description = options.description || '';
      await registerCurrentProject(keywords, description, clientType);
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
  await showE2EEStatus(true);
  console.log('');

  // Summary
  console.log(dim('='.repeat(40)));
  if (allPassed) {
    console.log(green(bold('All checks passed!')));
  } else {
    console.log(yellow('Some checks need attention. See above for details.'));
  }
  console.log('');
}

/**
 * Show current status without registering.
 */
async function showStatus() {
  console.log('');
  console.log(bold('Push Status'));
  console.log(dim('='.repeat(40)));
  console.log('');

  // Version
  console.log(`Version: ${VERSION}`);

  // Account
  const email = getEmail();
  if (email) {
    console.log(`Account: ${email}`);
  } else {
    console.log('Account: Not connected');
  }

  // Machine
  const machineName = getMachineName();
  const machineId = getMachineId();
  console.log(`Machine: ${machineName}`);
  console.log(`Machine ID: ${machineId.slice(-8)}`);

  // Project
  const projectStatus = validateProjectStatus();
  if (projectStatus.status === 'registered') {
    console.log(`Project: ${projectStatus.gitRemote}`);
  } else if (projectStatus.gitRemote) {
    console.log(`Project: ${projectStatus.gitRemote} (not registered)`);
  } else {
    console.log('Project: Not in a git repository');
  }

  // E2EE
  const [e2eeAvailable] = isE2EEAvailable();
  console.log(`E2EE: ${e2eeAvailable ? 'Available' : 'Not available'}`);

  console.log('');
}

export {
  checkVersion,
  doUpdate,
  validateApiKeyStatus,
  validateMachineStatus,
  validateProjectStatus,
  setupE2EE,
  storeE2EEKeyDirect,
  showStatus,
  VERSION
};
