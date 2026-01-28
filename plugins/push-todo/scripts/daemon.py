#!/usr/bin/env python3
"""
Push Task Execution Daemon

Polls Supabase for queued tasks and executes them via Claude Code.
Auto-heals (starts) on any /push-todo command via daemon_health.py.

Architecture:
- Git branch = worktree = Claude session (1:1:1 mapping)
- Uses Claude's --continue to resume sessions in worktrees
- SessionEnd hook reports completion (no wrapper script needed)

See: /docs/20260127_parallel_task_execution_research.md
See: /docs/20260127_parallel_task_execution_implementation_plan.md
"""

import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

# ==================== Configuration ====================

API_BASE_URL = "https://jxuzqcbqhiaxmfitzxlo.supabase.co/functions/v1"
POLL_INTERVAL = 30  # seconds
MAX_CONCURRENT_TASKS = 3  # Max parallel Claude sessions

PID_FILE = Path.home() / ".push" / "daemon.pid"
LOG_FILE = Path.home() / ".push" / "daemon.log"
CONFIG_FILE = Path.home() / ".config" / "push" / "config"

# Track running tasks to avoid duplicates
running_tasks: Dict[int, subprocess.Popen] = {}


# ==================== Logging ====================

def log(message: str):
    """Log with timestamp to both stdout and log file."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {message}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ==================== Configuration ====================

def get_api_key() -> Optional[str]:
    """Get API key from config file or environment."""
    # Check environment first
    if os.environ.get("PUSH_API_KEY"):
        return os.environ["PUSH_API_KEY"]

    # Then check config file
    if CONFIG_FILE.exists():
        try:
            for line in CONFIG_FILE.read_text().splitlines():
                line = line.strip()
                if line.startswith("export PUSH_API_KEY="):
                    value = line.split("=", 1)[1].strip()
                    return value.strip('"').strip("'")
        except Exception as e:
            log(f"Error reading config: {e}")
    return None


def get_git_remote() -> Optional[str]:
    """Get normalized git remote for current directory."""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return None

        url = result.stdout.strip()

        # Normalize: remove protocol prefixes
        for prefix in ["https://", "http://", "git@", "ssh://git@"]:
            if url.startswith(prefix):
                url = url[len(prefix):]
                break

        # Normalize: git@github.com:user/repo -> github.com/user/repo
        if ":" in url and "://" not in url:
            url = url.replace(":", "/", 1)

        # Remove .git suffix
        if url.endswith(".git"):
            url = url[:-4]

        return url
    except Exception:
        return None


# ==================== API Helpers ====================

def api_request(
    endpoint: str,
    method: str = "GET",
    data: Optional[Dict] = None,
    timeout: int = 15
) -> Optional[Dict]:
    """Make authenticated API request to Supabase."""
    api_key = get_api_key()
    if not api_key:
        log("No API key configured")
        return None

    url = f"{API_BASE_URL}/{endpoint}"

    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")

    if data:
        req.data = json.dumps(data).encode()

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        log(f"API error ({e.code}): {e.reason}")
        return None
    except Exception as e:
        log(f"Request error: {e}")
        return None


def update_task_status(
    display_number: int,
    status: str,
    summary: Optional[str] = None,
    error: Optional[str] = None
):
    """Update task execution status via edge function."""
    payload: Dict[str, Any] = {
        "displayNumber": display_number,
        "status": status,
    }
    if summary:
        payload["summary"] = summary
    if error:
        payload["error"] = error

    result = api_request("update-task-execution", method="PATCH", data=payload)
    if result and result.get("success"):
        log(f"Updated task #{display_number} to {status}")
    else:
        log(f"Failed to update task #{display_number}")


# ==================== Task Fetching ====================

def fetch_queued_tasks() -> List[Dict]:
    """Fetch tasks with execution_status='queued' from Supabase."""
    git_remote = get_git_remote()

    # Build query params
    params = {"execution_status": "queued"}
    if git_remote:
        params["git_remote"] = git_remote

    query_string = urllib.parse.urlencode(params)
    endpoint = f"synced-todos?{query_string}"

    result = api_request(endpoint)
    if result:
        return result.get("todos", [])
    return []


# ==================== Task Execution ====================

def get_worktree_path(display_number: int) -> Path:
    """Get the worktree path for a task."""
    # Worktrees go in parent of current working directory
    return Path.cwd().parent / f"push-{display_number}"


def create_worktree(display_number: int) -> bool:
    """Create git worktree for task if it doesn't exist."""
    branch = f"push-{display_number}"
    worktree_path = get_worktree_path(display_number)

    if worktree_path.exists():
        log(f"Worktree already exists: {worktree_path}")
        return True

    try:
        result = subprocess.run(
            ["git", "worktree", "add", str(worktree_path), "-b", branch],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            log(f"Created worktree: {worktree_path}")
            return True
        else:
            # Branch might already exist, try without -b
            result = subprocess.run(
                ["git", "worktree", "add", str(worktree_path), branch],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                log(f"Created worktree (existing branch): {worktree_path}")
                return True
            else:
                log(f"Failed to create worktree: {result.stderr}")
                return False

    except Exception as e:
        log(f"Worktree creation error: {e}")
        return False


def execute_task(task: Dict):
    """Create worktree and run Claude for a task."""
    display_num = task.get("displayNumber") or task.get("display_number")
    content = (
        task.get("normalizedContent") or
        task.get("normalized_content") or
        task.get("summary") or
        "Work on this task"
    )

    if not display_num:
        log(f"Task has no display number, skipping")
        return

    if display_num in running_tasks:
        log(f"Task #{display_num} already running, skipping")
        return

    if len(running_tasks) >= MAX_CONCURRENT_TASKS:
        log(f"Max concurrent tasks ({MAX_CONCURRENT_TASKS}) reached, skipping #{display_num}")
        return

    log(f"Starting task #{display_num}: {content[:60]}...")

    # Update status to running
    update_task_status(display_num, "running")

    # Create worktree
    if not create_worktree(display_num):
        update_task_status(display_num, "failed", error="Failed to create git worktree")
        return

    worktree_path = get_worktree_path(display_num)

    # Build prompt for Claude
    prompt = f"""Work on Push task #{display_num}:

{content}

IMPORTANT: When you're done, the SessionEnd hook will automatically report completion to Supabase.

If you need to understand the codebase, start by reading the CLAUDE.md file if it exists."""

    try:
        # Run Claude in headless mode
        # SessionEnd hook will handle reporting completion
        proc = subprocess.Popen(
            [
                "claude",
                "-p", prompt,
                "--allowedTools", "Read,Edit,Write,Glob,Grep,Bash(git *)",
                "--output-format", "json"
            ],
            cwd=str(worktree_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        # Track the running process
        running_tasks[display_num] = proc

        log(f"Started Claude for task #{display_num} (PID: {proc.pid})")

    except Exception as e:
        log(f"Error starting Claude for task #{display_num}: {e}")
        update_task_status(display_num, "failed", error=str(e))


def check_running_tasks():
    """Check status of running tasks and clean up completed ones."""
    completed = []

    for display_num, proc in running_tasks.items():
        retcode = proc.poll()

        if retcode is not None:
            # Process completed
            completed.append(display_num)

            if retcode == 0:
                log(f"Task #{display_num} completed (Claude exited cleanly)")
                # SessionEnd hook should have already reported completion
                # But we'll set a fallback summary just in case
                # update_task_status(display_num, "completed", summary="Completed via daemon")
            else:
                log(f"Task #{display_num} failed (Claude exit code: {retcode})")
                stderr = proc.stderr.read() if proc.stderr else ""
                update_task_status(display_num, "failed", error=f"Exit code {retcode}: {stderr[:200]}")

    # Remove completed tasks from tracking
    for display_num in completed:
        del running_tasks[display_num]


# ==================== Signal Handling ====================

def cleanup(signum, frame):
    """Handle shutdown gracefully."""
    log("Daemon shutting down...")

    # Terminate any running Claude processes
    for display_num, proc in running_tasks.items():
        log(f"Terminating task #{display_num}")
        proc.terminate()

    # Remove PID file
    try:
        PID_FILE.unlink(missing_ok=True)
    except Exception:
        pass

    sys.exit(0)


# ==================== Main Loop ====================

def main():
    """Main daemon loop."""
    # Set up signal handlers
    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    # Create directories
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Write PID file
    PID_FILE.write_text(str(os.getpid()))

    log("=" * 60)
    log("Push task execution daemon started")
    log(f"PID: {os.getpid()}")
    log(f"Polling interval: {POLL_INTERVAL}s")
    log(f"Max concurrent tasks: {MAX_CONCURRENT_TASKS}")
    log(f"Working directory: {Path.cwd()}")
    log(f"Log file: {LOG_FILE}")
    log("=" * 60)

    # Check for API key
    if not get_api_key():
        log("WARNING: No API key configured. Run '/push-todo connect' first.")

    while True:
        try:
            # Check running tasks for completion
            check_running_tasks()

            # Fetch new queued tasks
            tasks = fetch_queued_tasks()

            if tasks:
                log(f"Found {len(tasks)} queued task(s)")
                for task in tasks:
                    execute_task(task)
            elif len(running_tasks) > 0:
                log(f"No new tasks. {len(running_tasks)} task(s) running.")

        except KeyboardInterrupt:
            cleanup(None, None)
        except Exception as e:
            log(f"Error in main loop: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
