/**
 * Git utilities for Push CLI.
 *
 * Provides helpers for git operations like getting remote URLs.
 */

import { execSync } from 'child_process';

/**
 * Get the normalized git remote URL for the current directory.
 *
 * Normalizes URLs to a consistent format:
 * - git@github.com:user/repo.git → github.com/user/repo
 * - https://github.com/user/repo.git → github.com/user/repo
 *
 * @returns {string|null} Normalized git remote or null if not a git repo
 */
export function getGitRemote() {
  try {
    const result = execSync('git remote get-url origin', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let url = result.trim();
    if (!url) {
      return null;
    }

    // Normalize: remove protocol, convert : to /, remove .git
    // git@github.com:user/repo.git → github.com/user/repo
    // https://github.com/user/repo.git → github.com/user/repo

    // Remove protocol prefixes
    const prefixes = ['https://', 'http://', 'git@', 'ssh://git@'];
    for (const prefix of prefixes) {
      if (url.startsWith(prefix)) {
        url = url.slice(prefix.length);
        break;
      }
    }

    // Convert : to / (for git@ style)
    if (url.includes(':') && !url.includes('://')) {
      url = url.replace(':', '/');
    }

    // Remove .git suffix
    if (url.endsWith('.git')) {
      url = url.slice(0, -4);
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * Check if the current directory is a git repository.
 *
 * @returns {boolean}
 */
export function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name.
 *
 * @returns {string|null}
 */
export function getCurrentBranch() {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get the root directory of the git repository.
 *
 * @returns {string|null}
 */
export function getGitRoot() {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get recent commit messages for context.
 *
 * @param {number} count - Number of commits to fetch
 * @returns {string[]} Array of commit messages
 */
export function getRecentCommits(count = 5) {
  try {
    const result = execSync(`git log --oneline -${count}`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if there are uncommitted changes.
 *
 * @returns {boolean}
 */
export function hasUncommittedChanges() {
  try {
    const result = execSync('git status --porcelain', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
