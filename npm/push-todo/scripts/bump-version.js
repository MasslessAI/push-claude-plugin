#!/usr/bin/env node
/**
 * Bump the package version following X.Y.Z rules.
 *
 * Version Rules:
 * - Format: X.Y.Z (major.minor.patch)
 * - Z (patch): Increments 0-9, then resets to 0
 * - Y (minor): Increments when Z overflows (0-9 range)
 * - X (major): Increments when Y overflows (0-9 range)
 *
 * Examples:
 *   1.1.0 → 1.1.1
 *   1.1.9 → 1.2.0 (NOT 1.1.10)
 *   1.9.9 → 2.0.0
 *
 * Usage:
 *   node scripts/bump-version.js              # Bump patch version
 *   node scripts/bump-version.js --dry-run    # Show what would change
 *   node scripts/bump-version.js --minor      # Force minor bump
 *   node scripts/bump-version.js --major      # Force major bump
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');

// Files to update
const FILES = {
  packageJson: join(PACKAGE_ROOT, 'package.json'),
  pluginJson: join(PACKAGE_ROOT, '.claude-plugin', 'plugin.json'),
  cliJs: join(PACKAGE_ROOT, 'lib', 'cli.js')
};

function parseVersion(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return parts.map(p => parseInt(p, 10));
}

function formatVersion(major, minor, patch) {
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(current, { forceMinor = false, forceMajor = false } = {}) {
  let [major, minor, patch] = parseVersion(current);

  if (forceMajor) {
    return formatVersion(major + 1, 0, 0);
  }

  if (forceMinor) {
    if (minor >= 9) {
      return formatVersion(major + 1, 0, 0);
    }
    return formatVersion(major, minor + 1, 0);
  }

  // Patch bump with overflow logic
  patch += 1;

  if (patch > 9) {
    patch = 0;
    minor += 1;

    if (minor > 9) {
      minor = 0;
      major += 1;
    }
  }

  return formatVersion(major, minor, patch);
}

function updatePackageJson(newVersion, dryRun) {
  const content = JSON.parse(readFileSync(FILES.packageJson, 'utf8'));
  const oldVersion = content.version;
  content.version = newVersion;

  if (!dryRun) {
    writeFileSync(FILES.packageJson, JSON.stringify(content, null, 2) + '\n');
  }

  console.log(`  package.json: ${oldVersion} → ${newVersion}`);
}

function updatePluginJson(newVersion, dryRun) {
  const content = JSON.parse(readFileSync(FILES.pluginJson, 'utf8'));
  const oldVersion = content.version;
  content.version = newVersion;

  if (!dryRun) {
    writeFileSync(FILES.pluginJson, JSON.stringify(content, null, 2) + '\n');
  }

  console.log(`  plugin.json: ${oldVersion} → ${newVersion}`);
}

function updateCliJs(newVersion, dryRun) {
  let content = readFileSync(FILES.cliJs, 'utf8');
  const match = content.match(/const VERSION = '([^']+)'/);

  if (!match) {
    console.log(`  cli.js: VERSION constant not found (skipped)`);
    return;
  }

  const oldVersion = match[1];
  content = content.replace(
    /const VERSION = '[^']+'/,
    `const VERSION = '${newVersion}'`
  );

  if (!dryRun) {
    writeFileSync(FILES.cliJs, content);
  }

  console.log(`  cli.js: ${oldVersion} → ${newVersion}`);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forceMinor = args.includes('--minor');
  const forceMajor = args.includes('--major');

  // Read current version from package.json
  const packageJson = JSON.parse(readFileSync(FILES.packageJson, 'utf8'));
  const currentVersion = packageJson.version;

  // Calculate new version
  const newVersion = bumpVersion(currentVersion, { forceMinor, forceMajor });

  console.log(`\nBumping version: ${currentVersion} → ${newVersion}\n`);

  // Update all files
  updatePackageJson(newVersion, dryRun);
  updatePluginJson(newVersion, dryRun);
  updateCliJs(newVersion, dryRun);

  if (dryRun) {
    console.log('\n(dry run - no changes made)');
  } else {
    console.log('\nDone! Now commit and push to trigger publish.');
  }
}

main();
