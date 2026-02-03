#!/usr/bin/env node
/**
 * Session end hook for Push CLI.
 *
 * Reports session completion status to the backend.
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_FILE = join(homedir(), '.config', 'push', 'config');
const API_BASE = 'https://jxuzqcbqhiaxmfitzxlo.supabase.co/functions/v1';

/**
 * Get the API key from config.
 */
function getApiKey() {
  if (process.env.PUSH_API_KEY) {
    return process.env.PUSH_API_KEY;
  }

  if (!existsSync(CONFIG_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf8');
    const match = content.match(/^export\s+PUSH_API_KEY\s*=\s*["']?([^"'\n]+)["']?/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get the machine ID.
 */
function getMachineId() {
  const machineIdFile = join(homedir(), '.config', 'push', 'machine_id');

  if (existsSync(machineIdFile)) {
    try {
      return readFileSync(machineIdFile, 'utf8').trim();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Report session end to backend.
 */
async function reportSessionEnd(apiKey, machineId, exitReason) {
  try {
    const response = await fetch(`${API_BASE}/session-end`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        machine_id: machineId,
        exit_reason: exitReason,
        timestamp: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(10000)
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Main entry point.
 */
async function main() {
  const apiKey = getApiKey();
  const machineId = getMachineId();

  if (!apiKey || !machineId) {
    // Not configured - silent exit
    process.exit(0);
  }

  // Get exit reason from environment (Claude Code may set this)
  const exitReason = process.env.CLAUDE_EXIT_REASON || 'normal';

  // Report to backend
  await reportSessionEnd(apiKey, machineId, exitReason);

  process.exit(0);
}

main().catch(() => process.exit(0));
