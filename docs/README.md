# Developer Documentation

Internal documentation for maintaining the push-todo CLI and npm package.

## CI/CD & Publishing

| Document | Description |
|----------|-------------|
| [npm-oidc-trusted-publishing.md](./npm-oidc-trusted-publishing.md) | How npm OIDC trusted publishing works (no tokens needed) |

## Workflows

| Workflow | Purpose |
|----------|---------|
| `.github/workflows/npm-publish.yml` | Build binaries + publish to npm + create GitHub release |

## Version Bumping

### Quick Way (Recommended)

```bash
cd npm/push-todo
node scripts/bump-version.js           # Bump patch (most common)
node scripts/bump-version.js --minor   # Bump minor
node scripts/bump-version.js --major   # Bump major
node scripts/bump-version.js --dry-run # Preview without changing
```

This updates all 3 version locations automatically.

### Version Rules

**Single-digit segments only** — each segment goes 0-9, then overflows:

| Current | Next Patch | Explanation |
|---------|------------|-------------|
| `1.1.0` | `1.1.1` | Normal increment |
| `1.1.9` | `1.2.0` | Patch overflows → minor bumps |
| `1.9.9` | `2.0.0` | Both overflow → major bumps |

**Why?** Simpler mental model, no `1.1.10` vs `1.2.0` debates.

### Files Updated

| File | Field |
|------|-------|
| `npm/push-todo/package.json` | `version` |
| `npm/push-todo/.claude-plugin/plugin.json` | `version` |
| `npm/push-todo/lib/cli.js` | `VERSION` constant |

### After Bumping

```bash
git add -A && git commit -m "v3.5.0" && git push
```

The workflow automatically:
- Builds macOS binaries (arm64 + x64)
- Publishes to npm via OIDC
- Creates GitHub release with binaries attached
