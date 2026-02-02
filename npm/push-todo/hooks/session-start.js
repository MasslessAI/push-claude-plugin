#!/usr/bin/env node
/**
 * Session start hook for Push CLI.
 *
 * Displays task count notification when Claude Code starts.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_FILE = join(homedir(), '.config', 'push', 'config');
const API_BASE = 'https://jxuzqcbqhiaxmfitzxlo.supabase.co/functions/v1';

/**
 * Get the API key from config.
 */
function getApiKey() {
  // Check environment variable first
  if (process.env.PUSH_API_KEY) {
    return process.env.PUSH_API_KEY;
  }

  // Read from config file
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf8');
    const match = content.match(/^export\s+PUSH_KEY\s*=\s*["']?([^"'\n]+)["']?/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get the git remote for the current directory.
 */
function getGitRemote() {
  try {
    const result = execSync('git remote get-url origin', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let url = result.trim();
    if (!url) return null;

    // Normalize
    const prefixes = ['https://', 'http://', 'git@', 'ssh://git@'];
    for (const prefix of prefixes) {
      if (url.startsWith(prefix)) {
        url = url.slice(prefix.length);
        break;
      }
    }

    if (url.includes(':') && !url.includes('://')) {
      url = url.replace(':', '/');
    }

    if (url.endsWith('.git')) {
      url = url.slice(0, -4);
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * Fetch task count from the API.
 */
async function fetchTaskCount(apiKey, gitRemote) {
  try {
    const params = new URLSearchParams();
    if (gitRemote) {
      params.set('git_remote', gitRemote);
    }
    params.set('count_only', 'true');

    const url = `${API_BASE}/synced-todos?${params}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.count || 0;
  } catch {
    return null;
  }
}

/**
 * Main entry point.
 */
async function main() {
  const apiKey = getApiKey();

  if (!apiKey) {
    // No API key - silent exit
    process.exit(0);
  }

  const gitRemote = getGitRemote();
  const count = await fetchTaskCount(apiKey, gitRemote);

  if (count === null) {
    // API error - silent exit
    process.exit(0);
  }

  if (count > 0) {
    // Output notification for Claude Code
    console.log(`[Push] You have ${count} active task${count !== 1 ? 's' : ''} from your iPhone. Say 'push-todo' to see them.`);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
