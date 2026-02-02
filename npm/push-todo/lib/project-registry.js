/**
 * Project Registry for Push CLI.
 *
 * Maps git_remote to local paths for global daemon routing.
 * Enables the daemon to route tasks to the correct project directory.
 *
 * File location: ~/.config/push/projects.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const REGISTRY_FILE = join(homedir(), '.config', 'push', 'projects.json');
const REGISTRY_VERSION = 1;

/**
 * Project Registry class.
 * Manages the local project registry for global daemon routing.
 */
class ProjectRegistry {
  constructor() {
    this._ensureConfigDir();
    this._data = this._load();
  }

  _ensureConfigDir() {
    const dir = join(homedir(), '.config', 'push');
    mkdirSync(dir, { recursive: true });
  }

  _load() {
    if (!existsSync(REGISTRY_FILE)) {
      return {
        version: REGISTRY_VERSION,
        projects: {},
        defaultProject: null
      };
    }

    try {
      const content = readFileSync(REGISTRY_FILE, 'utf8');
      const data = JSON.parse(content);

      // Migration: handle older versions if needed
      if ((data.version || 0) < REGISTRY_VERSION) {
        return this._migrate(data);
      }

      return data;
    } catch {
      return {
        version: REGISTRY_VERSION,
        projects: {},
        defaultProject: null
      };
    }
  }

  _save() {
    writeFileSync(REGISTRY_FILE, JSON.stringify(this._data, null, 2));
  }

  _migrate(data) {
    // Future: handle migrations as needed
    data.version = REGISTRY_VERSION;
    return data;
  }

  /**
   * Register a project.
   *
   * @param {string} gitRemote - Normalized git remote (e.g., "github.com/user/repo")
   * @param {string} localPath - Absolute local path
   * @returns {boolean} True if newly registered, false if updated existing
   */
  register(gitRemote, localPath) {
    const isNew = !(gitRemote in this._data.projects);
    const now = new Date().toISOString();

    if (isNew) {
      this._data.projects[gitRemote] = {
        localPath,
        registeredAt: now,
        lastUsed: now
      };
    } else {
      this._data.projects[gitRemote].localPath = localPath;
      this._data.projects[gitRemote].lastUsed = now;
    }

    // Set as default if first project
    if (this._data.defaultProject === null) {
      this._data.defaultProject = gitRemote;
    }

    this._save();
    return isNew;
  }

  /**
   * Get local path for a git remote.
   * Updates lastUsed timestamp.
   *
   * @param {string} gitRemote - Normalized git remote
   * @returns {string|null} Local path or null if not registered
   */
  getPath(gitRemote) {
    const project = this._data.projects[gitRemote];
    if (project) {
      // Update last_used
      project.lastUsed = new Date().toISOString();
      this._save();
      return project.localPath;
    }
    return null;
  }

  /**
   * Get local path without updating lastUsed.
   * Useful for status checks and listing operations.
   *
   * @param {string} gitRemote - Normalized git remote
   * @returns {string|null} Local path or null if not registered
   */
  getPathWithoutUpdate(gitRemote) {
    const project = this._data.projects[gitRemote];
    return project ? project.localPath : null;
  }

  /**
   * List all registered projects.
   *
   * @returns {Object} Dict of gitRemote -> localPath
   */
  listProjects() {
    const result = {};
    for (const [remote, info] of Object.entries(this._data.projects)) {
      result[remote] = info.localPath;
    }
    return result;
  }

  /**
   * List all registered projects with full metadata.
   *
   * @returns {Object} Dict of gitRemote -> {localPath, registeredAt, lastUsed}
   */
  listProjectsWithMetadata() {
    return { ...this._data.projects };
  }

  /**
   * Unregister a project.
   *
   * @param {string} gitRemote - Normalized git remote
   * @returns {boolean} True if was registered, false if not found
   */
  unregister(gitRemote) {
    if (gitRemote in this._data.projects) {
      delete this._data.projects[gitRemote];

      if (this._data.defaultProject === gitRemote) {
        // Set new default
        const remaining = Object.keys(this._data.projects);
        this._data.defaultProject = remaining.length > 0 ? remaining[0] : null;
      }

      this._save();
      return true;
    }
    return false;
  }

  /**
   * Get the default project's git remote.
   *
   * @returns {string|null}
   */
  getDefaultProject() {
    return this._data.defaultProject;
  }

  /**
   * Set a project as the default.
   *
   * @param {string} gitRemote
   * @returns {boolean} True if successful
   */
  setDefaultProject(gitRemote) {
    if (gitRemote in this._data.projects) {
      this._data.defaultProject = gitRemote;
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Return the number of registered projects.
   *
   * @returns {number}
   */
  projectCount() {
    return Object.keys(this._data.projects).length;
  }

  /**
   * Check if a project is registered.
   *
   * @param {string} gitRemote
   * @returns {boolean}
   */
  isRegistered(gitRemote) {
    return gitRemote in this._data.projects;
  }

  /**
   * Validate that all registered paths still exist.
   *
   * @returns {Array} List of invalid entries
   */
  validatePaths() {
    const invalid = [];

    for (const [gitRemote, info] of Object.entries(this._data.projects)) {
      const path = info.localPath;

      try {
        const stats = statSync(path);
        if (!stats.isDirectory()) {
          invalid.push({
            gitRemote,
            localPath: path,
            reason: 'not_a_directory'
          });
        } else if (!existsSync(join(path, '.git'))) {
          invalid.push({
            gitRemote,
            localPath: path,
            reason: 'not_a_git_repo'
          });
        }
      } catch {
        invalid.push({
          gitRemote,
          localPath: path,
          reason: 'path_not_found'
        });
      }
    }

    return invalid;
  }
}

// Singleton instance
let _registry = null;

/**
 * Get the singleton registry instance.
 *
 * @returns {ProjectRegistry}
 */
export function getRegistry() {
  if (_registry === null) {
    _registry = new ProjectRegistry();
  }
  return _registry;
}

/**
 * Reset the singleton (for testing).
 */
export function resetRegistry() {
  _registry = null;
}

export { ProjectRegistry, REGISTRY_FILE };
