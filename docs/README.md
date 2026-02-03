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

All versions are unified. When releasing:

1. Bump version in `npm/push-todo/package.json`
2. Bump version in `npm/push-todo/.claude-plugin/plugin.json`
3. Bump VERSION constant in `npm/push-todo/lib/cli.js`
4. Commit and push to `main`

The workflow automatically:
- Builds macOS binaries (arm64 + x64)
- Publishes to npm via OIDC
- Creates GitHub release with binaries attached
