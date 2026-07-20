# Release runbook

This runbook assembles and verifies release artifacts. Publication is a separately authorized action.

## Prerequisites

- Clean checkout of the intended commit
- Node.js 22
- pnpm 11.11.0
- Completed Windows, macOS, and Linux CI for the release commit
- Protected `npm-production` GitHub environment for publication

## One-time Repository & Account Setup

Before publishing the package for the first time, you must configure your accounts and repository secrets:

### 1. npm Account & Access Token

You need an npm account with publishing rights to publish the package.

1. Create an account at [npmjs.com](https://www.npmjs.com/) if you don't have one.
2. Generate an **Automation** token at [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens).
3. In this repository on GitHub, go to **Settings → Environments** and create an environment named exactly `npm-production`.
4. In this repository on GitHub, go to **Settings → Secrets and variables → Actions**, and add a new repository secret named `NODE_AUTH_TOKEN` containing your Automation token.

### 2. (Optional) GPG Tag Signing

The release workflow is triggered by Git tags. While you can sign tags, it is no longer strictly required.

1. You can create a normal tag: `git tag v0.2.1 -m "Release 0.2.1"`.
2. Push the tag: `git push origin v0.2.1`.

## Build and verify

```sh
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm verify:release
```

The gate runs formatting, documentation validation, lint, types, tests, bundling, skill validation, security scanning, production dependency audit, release checks, `npm pack --dry-run`, empty-prefix package installation, binary lifecycle smoke tests, archive generation, SBOM, and checksums.

## Inspect artifacts

Review:

- `artifacts/omnibranch-0.2.1.tgz`
- `artifacts/omnibranch-skill-0.2.1.tar.gz`
- `artifacts/omnibranch-claude-plugin-0.2.1.tar.gz`
- `artifacts/omnibranch-0.2.1.sbom.json`
- `artifacts/SHA256SUMS`

Confirm `npm pack` contains only the allowlisted public manifest, license, README, README brand assets, bundled CLI, and canonical skill payload. The public manifest must contain only `better-sqlite3@12.11.1` as a runtime dependency.

## External verification record

Before release, record separately:

- three-OS CI result;
- available live engine contract results;
- GitHub sandbox mutation result, if authorized;
- dependency audit result;
- package smoke result;
- unavailable or intentionally skipped gates.

Never report a missing credential, provider, or operating system as passed.

## Tag artifacts

The tag workflow triggers on any version tag (`v*`) and uploads artifacts.

Tagging and pushing require explicit authorization:

```sh
git tag v0.2.1 -m "OmniBranch 0.2.1"
git push origin v0.2.1
```

## Publish npm with provenance

Publication requires all of the following:

1. manual workflow dispatch;
2. `publish_npm=true` input;
3. approval of the protected `npm-production` environment;
4. GitHub OIDC trusted publishing;
5. the previously verified `artifacts/omnibranch-0.2.1.tgz`.

The workflow runs `npm publish ... --provenance --access public`. Do not run it from an unreviewed local checkout.

## Roll back a release

Do not overwrite an npm version or move a signed tag. Stop further promotion, document the issue, publish a corrected version through the full gate, and follow the [runtime/skill rollback guide](ROLLBACK.md) for affected users.
