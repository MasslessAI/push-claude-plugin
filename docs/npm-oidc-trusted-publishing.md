# npm OIDC Trusted Publishing Guide

**Last Updated:** 2026-02-03
**Status:** Working in production

This document captures everything learned about setting up npm OIDC trusted publishing for GitHub Actions, after extensive debugging and research.

---

## TL;DR - Working Configuration

```yaml
name: Publish to npm

on:
  push:
    branches: [main]
    paths:
      - 'your-package/**'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write    # For creating GitHub releases
      id-token: write    # REQUIRED for OIDC

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          # NO registry-url! It breaks OIDC.

      - name: Upgrade npm for OIDC support
        run: npm install -g npm@latest && npm --version
        # Must be npm 11.5.1+ for OIDC

      - name: Publish to npm
        working-directory: your-package
        run: npm publish --access public
        # No --provenance flag needed (automatic)
        # No NODE_AUTH_TOKEN needed (OIDC handles it)
```

---

## Prerequisites

### 1. npm Account Setup

1. Go to https://www.npmjs.com/package/YOUR_PACKAGE/access
2. Scroll to **"Publishing access"** section
3. Click **"Add trusted publisher"** → Select **"GitHub Actions"**
4. Fill in EXACTLY:
   - **Organization or user:** `YourGitHubOrg` (case-sensitive)
   - **Repository:** `your-repo-name` (without org prefix)
   - **Workflow filename:** `npm-publish.yml` (exact filename)
   - **Environment name:** (leave blank unless using GitHub environments)
5. Click **"Save changes"**

### 2. package.json Requirements

```json
{
  "name": "@yourorg/your-package",
  "repository": {
    "type": "git",
    "url": "https://github.com/YourOrg/your-repo"
  }
}
```

The `repository.url` MUST match your GitHub repository exactly.

---

## Critical Requirements

| Requirement | Details |
|-------------|---------|
| **npm version** | 11.5.1 or later (Node 22 ships with npm 10.x, must upgrade) |
| **Node.js version** | 22+ recommended |
| **Workflow permission** | `id-token: write` is REQUIRED |
| **NO registry-url** | Don't use `registry-url` in setup-node |
| **NO NODE_AUTH_TOKEN** | Don't set this env var at all |
| **NO --provenance flag** | Provenance is automatic with trusted publishing |

---

## Common Pitfalls & Solutions

### Pitfall 1: Using `registry-url` in setup-node

**Symptom:** `npm error code E404` or `Access token expired or revoked`

**Cause:** `actions/setup-node` with `registry-url` creates an `.npmrc` that sets a default `NODE_AUTH_TOKEN`, which overrides OIDC.

**Solution:** Don't use `registry-url`:
```yaml
# ❌ WRONG
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    registry-url: 'https://registry.npmjs.org'  # This breaks OIDC!

# ✅ CORRECT
- uses: actions/setup-node@v4
  with:
    node-version: '22'
```

### Pitfall 2: npm version too old

**Symptom:** `npm error code ENEEDAUTH` - need to log in

**Cause:** OIDC trusted publishing requires npm 11.5.1+. Node 22 ships with npm 10.x.

**Solution:** Explicitly upgrade npm:
```yaml
- name: Upgrade npm for OIDC support
  run: npm install -g npm@latest && npm --version
```

### Pitfall 3: Setting NODE_AUTH_TOKEN

**Symptom:** `npm error 404 Not Found` despite correct trusted publisher config

**Cause:** Any value in `NODE_AUTH_TOKEN` (even empty string) makes npm try token auth instead of OIDC.

**Solution:** Don't set `NODE_AUTH_TOKEN` at all:
```yaml
# ❌ WRONG
- run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}  # Breaks OIDC!

# ❌ ALSO WRONG
- run: npm publish
  env:
    NODE_AUTH_TOKEN: ""  # Even empty string breaks it!

# ✅ CORRECT
- run: npm publish --access public
  # No env vars needed
```

### Pitfall 4: Mismatched trusted publisher config

**Symptom:** Provenance signs successfully but publish fails with 404

**Cause:** The trusted publisher config on npm doesn't match the GitHub workflow exactly.

**Solution:** Verify these match EXACTLY:
- GitHub org/user name (case-sensitive)
- Repository name (without org prefix)
- Workflow filename (including `.yml` extension)
- Environment name (if using GitHub environments)

### Pitfall 5: Missing id-token permission

**Symptom:** OIDC token not generated

**Cause:** Workflow doesn't have permission to generate OIDC tokens.

**Solution:** Add to job permissions:
```yaml
jobs:
  publish:
    permissions:
      id-token: write  # REQUIRED
      contents: write  # If creating releases
```

### Pitfall 6: Using --provenance flag

**Symptom:** Usually works but can cause issues with older npm

**Cause:** With trusted publishing, provenance is automatic. The flag is redundant.

**Solution:** Don't use `--provenance`:
```yaml
# ❌ REDUNDANT (works but unnecessary)
- run: npm publish --provenance --access public

# ✅ CORRECT
- run: npm publish --access public
```

---

## Debugging Checklist

If OIDC publishing fails, check these in order:

1. [ ] Is npm version 11.5.1 or later? Run `npm --version` in workflow
2. [ ] Is `id-token: write` permission set on the job?
3. [ ] Is `registry-url` removed from setup-node?
4. [ ] Is `NODE_AUTH_TOKEN` NOT set anywhere?
5. [ ] Does trusted publisher config match workflow exactly?
6. [ ] Does `repository.url` in package.json match GitHub repo?
7. [ ] Is the package published at least once? (First publish can't use OIDC)

---

## Version History

| Date | npm CLI | Status | Notes |
|------|---------|--------|-------|
| Dec 2025 | 11.5.1+ | Required | Classic tokens deprecated |
| Jul 2025 | 11.5.1 | GA | Trusted publishing generally available |
| Pre-2025 | Any | N/A | Use classic NPM_TOKEN |

---

## References

- [npm Trusted Publishing Docs](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Changelog: OIDC GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
- [GitHub Community Discussion](https://github.com/orgs/community/discussions/176761)
- [Troubleshooting Guide](https://dev.to/zhangjintao/from-deprecated-npm-classic-tokens-to-oidc-trusted-publishing-a-cicd-troubleshooting-journey-4h8b)
- [setup-npm-trusted-publish tool](https://github.com/azu/setup-npm-trusted-publish)

---

## Our Working Workflow

See `.github/workflows/npm-publish.yml` for the complete working configuration used in this repository.
