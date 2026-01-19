#!/usr/bin/env python3
"""
Check for push-todo plugin updates from GitHub.

This script compares the local version with the remote version and
auto-updates if a newer version is available (enabled by default).

Usage:
    python check_updates.py

Environment:
    PUSH_PLUGIN_AUTO_UPDATE: Set to "false" to disable auto-updates (default: true)

Telemetry output:
    [Push] Plugin updated: v1.1.0 → v1.2.0     # Auto-update succeeded
    [Push] Update available: v1.1.0 → v1.2.0   # Can't auto-update (manual needed)
"""

import os
import sys
import json
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Tuple

# Configuration
GITHUB_REPO = "MasslessAI/push-claude-plugin"
PLUGIN_DIR = Path(__file__).parent.parent
VERSION_FILE = PLUGIN_DIR / ".claude-plugin" / "plugin.json"
GITHUB_RAW_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/plugins/push-todo/.claude-plugin/plugin.json"


def get_local_version() -> Optional[str]:
    """Get the locally installed version."""
    try:
        if VERSION_FILE.exists():
            data = json.loads(VERSION_FILE.read_text())
            return data.get("version")
    except (json.JSONDecodeError, IOError):
        pass
    return None


def get_remote_version() -> Optional[str]:
    """Fetch the latest version from GitHub."""
    try:
        req = urllib.request.Request(GITHUB_RAW_URL)
        req.add_header("User-Agent", "push-todo-updater/1.0")

        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            return data.get("version")
    except (urllib.error.URLError, json.JSONDecodeError, IOError):
        return None


def parse_version(version: str) -> Tuple[int, int, int]:
    """Parse semantic version string into tuple."""
    try:
        parts = version.split(".")
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except (IndexError, ValueError):
        return (0, 0, 0)


def is_newer(remote: str, local: str) -> bool:
    """Check if remote version is newer than local."""
    return parse_version(remote) > parse_version(local)


def is_git_repo() -> bool:
    """Check if plugin directory is a git repository."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            cwd=PLUGIN_DIR,
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def git_pull() -> bool:
    """Pull latest changes from origin."""
    try:
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            cwd=PLUGIN_DIR,
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.returncode == 0
    except Exception:
        return False


def get_installation_source() -> str:
    """Detect how the plugin was installed."""
    # Check if it's a symlink
    skill_path = Path.home() / ".claude" / "skills" / "push-todo"
    if skill_path.is_symlink():
        return "symlink"

    # Check if it's a git repo
    if is_git_repo():
        return "git"

    return "manual"


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Check for push-todo updates")
    parser.add_argument("--auto-update", action="store_true",
                        help="Automatically pull updates if available")
    args = parser.parse_args()

    # Auto-update is ON by default. Set PUSH_PLUGIN_AUTO_UPDATE=false to disable.
    env_value = os.environ.get("PUSH_PLUGIN_AUTO_UPDATE", "true").lower()
    auto_update = args.auto_update or env_value != "false"

    # Get versions
    local_version = get_local_version()
    if not local_version:
        # Can't determine local version, skip check
        return

    remote_version = get_remote_version()
    if not remote_version:
        # Can't reach GitHub, skip silently
        return

    # Compare versions
    if not is_newer(remote_version, local_version):
        # Already up to date
        return

    # Update available!
    source = get_installation_source()

    if auto_update and source in ("git", "symlink"):
        # Try to auto-update
        if is_git_repo() or source == "symlink":
            # For symlinks, the actual repo is elsewhere - find it
            actual_path = PLUGIN_DIR
            if source == "symlink":
                skill_path = Path.home() / ".claude" / "skills" / "push-todo"
                if skill_path.is_symlink():
                    actual_path = skill_path.resolve().parent.parent.parent  # Go up to repo root

            # Try git pull
            try:
                result = subprocess.run(
                    ["git", "pull", "--ff-only"],
                    cwd=actual_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    print(f"[Push] Plugin updated: v{local_version} → v{remote_version}")
                    return
            except Exception:
                pass

    # Notify user about available update (couldn't auto-update)
    print(f"[Push] Update available: v{local_version} → v{remote_version}")
    print(f"[Push] To update: cd ~/.claude/skills/push-todo && git pull")


if __name__ == "__main__":
    main()
