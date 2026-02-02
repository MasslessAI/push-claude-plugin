#!/usr/bin/env node
/**
 * Post-install script for Push CLI.
 *
 * Downloads the native keychain helper binary for macOS.
 */

import { createWriteStream, existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { chmod, stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform, arch } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BINARY_NAME = 'push-keychain-helper';
const BINARY_DIR = join(__dirname, '../bin');
const BINARY_PATH = join(BINARY_DIR, BINARY_NAME);

// GitHub release URL pattern
const RELEASE_VERSION = '3.0.0';
const BINARY_URL = `https://github.com/MasslessAI/push-todo-cli/releases/download/v${RELEASE_VERSION}/${BINARY_NAME}-darwin-arm64`;
const BINARY_URL_X64 = `https://github.com/MasslessAI/push-todo-cli/releases/download/v${RELEASE_VERSION}/${BINARY_NAME}-darwin-x64`;

/**
 * Migrate from old Python installation if present.
 */
function migrateFromPython() {
  const oldPath = join(homedir(), '.claude', 'skills', 'push-todo');

  if (existsSync(oldPath)) {
    console.log('[push-todo] Detected previous Python installation.');
    console.log(`[push-todo] Config preserved at ~/.config/push/`);
    console.log(`[push-todo] Old files can be removed: rm -rf ${oldPath}`);
    console.log('');
  }
}

/**
 * Download a file from URL to destination.
 *
 * @param {string} url - Source URL
 * @param {string} dest - Destination path
 * @returns {Promise<boolean>} True if successful
 */
async function downloadFile(url, dest) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000) // 60 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Ensure directory exists
    mkdirSync(dirname(dest), { recursive: true });

    // Remove existing file if present
    if (existsSync(dest)) {
      unlinkSync(dest);
    }

    // Write to file
    const fileStream = createWriteStream(dest);
    await pipeline(response.body, fileStream);

    // Make executable
    await chmod(dest, 0o755);

    return true;
  } catch (error) {
    console.error(`[push-todo] Download failed: ${error.message}`);
    return false;
  }
}

/**
 * Main post-install routine.
 */
async function main() {
  console.log('[push-todo] Running post-install...');

  // Check for migration
  migrateFromPython();

  // Check platform
  if (platform() !== 'darwin') {
    console.log('[push-todo] Skipping native binary (macOS only)');
    console.log('[push-todo] E2EE features will not be available.');
    console.log('[push-todo] Installation complete.');
    return;
  }

  // Check if binary already exists and is valid
  if (existsSync(BINARY_PATH)) {
    try {
      const stats = await stat(BINARY_PATH);
      if (stats.size > 0) {
        console.log('[push-todo] Native binary already installed.');
        console.log('[push-todo] Installation complete.');
        return;
      }
    } catch {
      // Continue to download
    }
  }

  // Determine architecture
  const archType = arch();
  const url = archType === 'arm64' ? BINARY_URL : BINARY_URL_X64;

  console.log(`[push-todo] Downloading native binary for ${archType}...`);

  const success = await downloadFile(url, BINARY_PATH);

  if (success) {
    console.log('[push-todo] Native binary installed successfully.');
    console.log('[push-todo] E2EE decryption is now available.');
  } else {
    console.log('[push-todo] Native binary download failed.');
    console.log('[push-todo] E2EE features will not be available.');
    console.log('[push-todo] You can manually download from:');
    console.log(`[push-todo]   ${url}`);
  }

  console.log('[push-todo] Installation complete.');
}

main().catch(error => {
  console.error(`[push-todo] Post-install error: ${error.message}`);
  // Don't fail the install - E2EE is optional
  process.exit(0);
});
