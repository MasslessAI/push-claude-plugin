/**
 * Machine Identification for Push CLI.
 *
 * Generates and persists a unique machine identifier used for:
 * - Atomic task claiming (prevents multi-Mac race conditions)
 * - Task attribution (which Mac executed a task)
 * - Worktree naming (prevents branch conflicts)
 *
 * File location: ~/.config/push/machine_id
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { homedir, hostname, platform, release, version, arch } from 'os';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

const MACHINE_ID_FILE = join(homedir(), '.config', 'push', 'machine_id');

/**
 * Get or create a unique machine identifier.
 *
 * Format: "{hostname}-{random_hex}"
 * Example: "Yuxiang-MacBook-Pro-a1b2c3d4"
 *
 * The ID is persisted to disk and reused across sessions.
 *
 * @returns {string} Unique machine identifier
 */
export function getMachineId() {
  // Try to read existing ID
  if (existsSync(MACHINE_ID_FILE)) {
    try {
      const storedId = readFileSync(MACHINE_ID_FILE, 'utf8').trim();
      if (storedId) {
        return storedId;
      }
    } catch {
      // Fall through to generate new ID
    }
  }

  // Generate new ID: hostname + random suffix
  const host = hostname(); // e.g., "Yuxiang-MacBook-Pro"
  const randomSuffix = randomUUID().slice(0, 8); // e.g., "a1b2c3d4"
  const machineId = `${host}-${randomSuffix}`;

  // Persist to disk
  try {
    mkdirSync(dirname(MACHINE_ID_FILE), { recursive: true });
    writeFileSync(MACHINE_ID_FILE, machineId);
  } catch {
    // If we can't persist, still return the ID for this session
  }

  return machineId;
}

/**
 * Get human-readable machine name.
 *
 * Returns the hostname without the random suffix.
 * Example: "Yuxiang-MacBook-Pro"
 *
 * @returns {string} Human-readable machine name
 */
export function getMachineName() {
  return hostname();
}

/**
 * Get full machine information for debugging.
 *
 * @returns {Object} Machine info
 */
export function getMachineInfo() {
  return {
    machineId: getMachineId(),
    machineName: getMachineName(),
    platform: platform(),      // "darwin" for macOS
    release: release(),        // OS kernel version
    version: version(),        // OS version string
    arch: arch(),              // "arm64" or "x64"
  };
}

/**
 * Delete the stored machine ID (for testing/debugging).
 * The next call to getMachineId() will generate a new ID.
 */
export function resetMachineId() {
  if (existsSync(MACHINE_ID_FILE)) {
    try {
      unlinkSync(MACHINE_ID_FILE);
    } catch {
      // Ignore errors
    }
  }
}

export { MACHINE_ID_FILE };
