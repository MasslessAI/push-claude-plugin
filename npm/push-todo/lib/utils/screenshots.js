/**
 * Screenshot utilities for Push CLI.
 *
 * Screenshots are stored in iCloud Drive and can be opened via the default image viewer.
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';
import { spawn } from 'child_process';

const SCREENSHOTS_DIR = join(
  homedir(),
  'Library/Mobile Documents/iCloud~ai~massless~push/Documents/Screenshots'
);

/**
 * Get the full path to a screenshot file in iCloud Drive.
 *
 * @param {string} filename - Screenshot filename (e.g., "ABC-123.heic")
 * @returns {string} Full path to screenshot file
 */
export function getScreenshotPath(filename) {
  return join(SCREENSHOTS_DIR, filename);
}

/**
 * Check if screenshot file exists in iCloud Drive.
 *
 * @param {string} filename - Screenshot filename
 * @returns {boolean} True if file exists
 */
export function screenshotExists(filename) {
  return existsSync(getScreenshotPath(filename));
}

/**
 * Open screenshot file in default image viewer.
 *
 * @param {string} filepath - Full path to screenshot file
 * @returns {Promise<void>}
 */
export function openScreenshot(filepath) {
  return new Promise((resolve, reject) => {
    if (!existsSync(filepath)) {
      reject(new Error(`Screenshot not found: ${filepath}`));
      return;
    }

    // Use macOS 'open' command
    const child = spawn('open', [filepath], {
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`Opened screenshot: ${basename(filepath)}`);
        resolve();
      } else {
        reject(new Error(`Failed to open screenshot (exit code: ${code})`));
      }
    });
  });
}
