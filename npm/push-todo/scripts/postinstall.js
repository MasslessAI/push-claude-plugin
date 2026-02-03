#!/usr/bin/env node
/**
 * Post-install script for Push CLI.
 *
 * 1. Sets up Claude Code plugin symlink
 * 2. Downloads the native keychain helper binary for macOS
 */

import { createWriteStream, existsSync, mkdirSync, unlinkSync, readFileSync, symlinkSync, lstatSync, readlinkSync, rmSync } from 'fs';
import { chmod, stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform, arch } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root (one level up from scripts/)
const PACKAGE_ROOT = join(__dirname, '..');

// Claude Code plugin locations
const CLAUDE_DIR = join(homedir(), '.claude');
const PLUGIN_DIR = join(CLAUDE_DIR, 'plugins');
const PLUGIN_LINK = join(PLUGIN_DIR, 'push-todo');

// Legacy location (for migration)
const LEGACY_SKILL_DIR = join(CLAUDE_DIR, 'skills');
const LEGACY_SKILL_LINK = join(LEGACY_SKILL_DIR, 'push-todo');

const BINARY_NAME = 'push-keychain-helper';
const BINARY_DIR = join(__dirname, '../bin');
const BINARY_PATH = join(BINARY_DIR, BINARY_NAME);

// GitHub release URL pattern
const RELEASE_VERSION = '3.0.0';
const BINARY_URL = `https://github.com/MasslessAI/push-todo-cli/releases/download/v${RELEASE_VERSION}/${BINARY_NAME}-darwin-arm64`;
const BINARY_URL_X64 = `https://github.com/MasslessAI/push-todo-cli/releases/download/v${RELEASE_VERSION}/${BINARY_NAME}-darwin-x64`;

/**
 * Set up Claude Code plugin by creating symlink.
 *
 * Creates: ~/.claude/plugins/push-todo -> <npm-package-location>
 *
 * @returns {boolean} True if successful
 */
function setupClaudePlugin() {
  try {
    // Ensure ~/.claude/plugins/ directory exists
    if (!existsSync(PLUGIN_DIR)) {
      mkdirSync(PLUGIN_DIR, { recursive: true });
      console.log('[push-todo] Created ~/.claude/plugins/ directory');
    }

    // Check if symlink already exists
    if (existsSync(PLUGIN_LINK)) {
      try {
        const stats = lstatSync(PLUGIN_LINK);
        if (stats.isSymbolicLink()) {
          const currentTarget = readlinkSync(PLUGIN_LINK);
          if (currentTarget === PACKAGE_ROOT) {
            console.log('[push-todo] Claude Code plugin symlink already configured.');
            return true;
          }
          // Different target - remove and recreate
          console.log('[push-todo] Updating existing symlink...');
          unlinkSync(PLUGIN_LINK);
        } else {
          // It's a directory or file, not a symlink - back it up
          console.log('[push-todo] Found existing plugin directory, backing up...');
          const backupPath = `${PLUGIN_LINK}.backup.${Date.now()}`;
          rmSync(PLUGIN_LINK, { recursive: true });
          console.log(`[push-todo] Backed up to ${backupPath}`);
        }
      } catch (err) {
        console.log(`[push-todo] Warning: Could not check existing plugin: ${err.message}`);
      }
    }

    // Create the symlink
    symlinkSync(PACKAGE_ROOT, PLUGIN_LINK);
    console.log('[push-todo] Claude Code plugin installed:');
    console.log(`[push-todo]   ~/.claude/plugins/push-todo -> ${PACKAGE_ROOT}`);
    return true;
  } catch (error) {
    console.error(`[push-todo] Failed to set up Claude Code plugin: ${error.message}`);
    console.log('[push-todo] You can manually create the symlink:');
    console.log(`[push-todo]   ln -s "${PACKAGE_ROOT}" "${PLUGIN_LINK}"`);
    return false;
  }
}

/**
 * Clean up legacy installation (Python version in ~/.claude/skills/).
 */
function cleanupLegacyInstallation() {
  if (!existsSync(LEGACY_SKILL_LINK)) {
    return;
  }

  try {
    const stats = lstatSync(LEGACY_SKILL_LINK);

    if (stats.isSymbolicLink()) {
      const target = readlinkSync(LEGACY_SKILL_LINK);
      // Check if it points to old Python location
      if (target.includes('plugins/push-todo') || target.includes('push-todo-cli')) {
        console.log('[push-todo] Removing legacy symlink at ~/.claude/skills/push-todo');
        unlinkSync(LEGACY_SKILL_LINK);
        console.log('[push-todo] Legacy symlink removed.');
      }
    }
  } catch (error) {
    // Ignore errors - this is best-effort cleanup
    console.log(`[push-todo] Note: Could not clean up legacy installation: ${error.message}`);
  }
}

/**
 * Migrate from old Python installation if present.
 */
function migrateFromPython() {
  // Config is preserved at ~/.config/push/ - no action needed
  // Just inform the user about the migration
  const configPath = join(homedir(), '.config', 'push');

  if (existsSync(configPath)) {
    console.log('[push-todo] Existing configuration found at ~/.config/push/');
    console.log('[push-todo] Your API key and settings are preserved.');
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
  console.log('');

  // Step 1: Check for migration from Python
  migrateFromPython();

  // Step 2: Clean up legacy installation
  cleanupLegacyInstallation();

  // Step 3: Set up Claude Code plugin symlink
  console.log('[push-todo] Setting up Claude Code plugin...');
  const pluginSuccess = setupClaudePlugin();
  console.log('');

  // Step 4: Download native binary (macOS only)
  if (platform() !== 'darwin') {
    console.log('[push-todo] Skipping native binary (macOS only)');
    console.log('[push-todo] E2EE features will not be available.');
    console.log('');
    console.log('[push-todo] Installation complete.');
    if (pluginSuccess) {
      console.log('[push-todo] You can now use /push-todo in Claude Code!');
    }
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

  console.log('');
  console.log('[push-todo] Installation complete!');
  console.log('');
  console.log('[push-todo] Quick start:');
  console.log('[push-todo]   push-todo connect     Set up authentication');
  console.log('[push-todo]   push-todo             List your tasks');
  console.log('[push-todo]   /push-todo            Use in Claude Code');
}

main().catch(error => {
  console.error(`[push-todo] Post-install error: ${error.message}`);
  // Don't fail the install - E2EE is optional
  process.exit(0);
});
