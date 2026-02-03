#!/usr/bin/env node
/**
 * Pre-uninstall script for Push CLI.
 *
 * Removes the Claude Code plugin symlink.
 */

import { existsSync, unlinkSync, lstatSync, readlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root (one level up from scripts/)
const PACKAGE_ROOT = join(__dirname, '..');

// Claude Code plugin location
const PLUGIN_LINK = join(homedir(), '.claude', 'plugins', 'push-todo');

/**
 * Remove Claude Code plugin symlink if it points to this package.
 */
function removePluginSymlink() {
  if (!existsSync(PLUGIN_LINK)) {
    console.log('[push-todo] No plugin symlink found, nothing to remove.');
    return;
  }

  try {
    const stats = lstatSync(PLUGIN_LINK);

    if (!stats.isSymbolicLink()) {
      console.log('[push-todo] Plugin is not a symlink, leaving it alone.');
      return;
    }

    const target = readlinkSync(PLUGIN_LINK);

    // Only remove if it points to this package
    if (target === PACKAGE_ROOT || target.includes('node_modules/@masslessai/push-todo')) {
      unlinkSync(PLUGIN_LINK);
      console.log('[push-todo] Removed Claude Code plugin symlink.');
    } else {
      console.log('[push-todo] Plugin symlink points elsewhere, leaving it alone.');
    }
  } catch (error) {
    console.error(`[push-todo] Warning: Could not remove symlink: ${error.message}`);
  }
}

/**
 * Main pre-uninstall routine.
 */
function main() {
  console.log('[push-todo] Running pre-uninstall...');

  removePluginSymlink();

  console.log('[push-todo] Uninstall cleanup complete.');
  console.log('[push-todo] Your configuration at ~/.config/push/ has been preserved.');
  console.log('[push-todo] To remove config: rm -rf ~/.config/push');
}

main();
