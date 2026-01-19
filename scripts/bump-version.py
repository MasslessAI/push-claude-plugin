#!/usr/bin/env python3
"""
Bump the plugin version following X.Y.Z rules.

Version Rules:
- Format: X.Y.Z (major.minor.patch)
- Z (patch): Increments 0-9, then resets to 0
- Y (minor): Increments when Z overflows (0-9 range)
- X (major): Increments when Y overflows (0-9 range)

Examples:
    1.1.0 → 1.1.1
    1.1.9 → 1.2.0 (NOT 1.1.10)
    1.9.9 → 2.0.0

Usage:
    python scripts/bump-version.py              # Bump patch version
    python scripts/bump-version.py --dry-run    # Show what would change
    python scripts/bump-version.py --minor      # Force minor bump
    python scripts/bump-version.py --major      # Force major bump
"""

import argparse
import json
import sys
from pathlib import Path

# Path to plugin.json
PLUGIN_JSON = Path(__file__).parent.parent / "plugins" / "push-todo" / ".claude-plugin" / "plugin.json"


def parse_version(version: str) -> tuple[int, int, int]:
    """Parse version string into (major, minor, patch) tuple."""
    parts = version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid version format: {version}")
    return int(parts[0]), int(parts[1]), int(parts[2])


def format_version(major: int, minor: int, patch: int) -> str:
    """Format version tuple into string."""
    return f"{major}.{minor}.{patch}"


def bump_version(current: str, force_minor: bool = False, force_major: bool = False) -> str:
    """
    Bump version following X.Y.Z rules.

    - Z goes 0-9, then overflows to Y
    - Y goes 0-9, then overflows to X
    """
    major, minor, patch = parse_version(current)

    if force_major:
        # Major bump: X.Y.Z → (X+1).0.0
        return format_version(major + 1, 0, 0)

    if force_minor:
        # Minor bump: X.Y.Z → X.(Y+1).0
        if minor >= 9:
            return format_version(major + 1, 0, 0)
        return format_version(major, minor + 1, 0)

    # Patch bump with overflow logic
    patch += 1

    if patch > 9:
        # Overflow to minor
        patch = 0
        minor += 1

        if minor > 9:
            # Overflow to major
            minor = 0
            major += 1

    return format_version(major, minor, patch)


def main():
    parser = argparse.ArgumentParser(description="Bump plugin version")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without modifying")
    parser.add_argument("--minor", action="store_true", help="Force minor version bump")
    parser.add_argument("--major", action="store_true", help="Force major version bump")
    args = parser.parse_args()

    if not PLUGIN_JSON.exists():
        print(f"Error: {PLUGIN_JSON} not found", file=sys.stderr)
        sys.exit(1)

    # Read current version
    data = json.loads(PLUGIN_JSON.read_text())
    current = data.get("version", "0.0.0")

    # Calculate new version
    new = bump_version(current, force_minor=args.minor, force_major=args.major)

    print(f"Version: {current} → {new}")

    if args.dry_run:
        print("(dry run - no changes made)")
        return

    # Update version
    data["version"] = new
    PLUGIN_JSON.write_text(json.dumps(data, indent=2) + "\n")

    print(f"Updated {PLUGIN_JSON}")


if __name__ == "__main__":
    main()
