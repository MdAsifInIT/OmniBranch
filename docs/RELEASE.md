# Release runbook

This runbook assembles and verifies release artifacts. Publication is a separately authorized action.

## Prerequisites

- Clean checkout of the intended commit
- Node.js 22
- pnpm 11.11.0
- Completed Windows, macOS, and Linux CI for the release commit
- Protected `npm-production` GitHub environment for publication

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

- `artifacts/omnibranch-0.2.0.tgz`
- `artifacts/omnibranch-skill-0.2.0.tar.gz`
- `artifacts/omnibranch-claude-plugin-0.2.0.tar.gz`
- `artifacts/omnibranch-0.2.0.sbom.json`
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

The tag workflow verifies signed tags and uploads artifacts. Ordinary tags do not publish npm or create a GitHub release.

Tagging and pushing require explicit authorization:

```sh
git tag -s v0.2.0 -m "OmniBranch 0.2.0"
git push origin v0.2.0
```

## Publish npm with provenance

Publication requires all of the following:

1. manual workflow dispatch;
2. `publish_npm=true` input;
3. approval of the protected `npm-production` environment;
4. GitHub OIDC trusted publishing;
5. the previously verified `artifacts/omnibranch-0.2.0.tgz`.

The workflow runs `npm publish ... --provenance --access public`. Do not run it from an unreviewed local checkout.

## Roll back a release

Do not overwrite an npm version or move a signed tag. Stop further promotion, document the issue, publish a corrected version through the full gate, and follow the [runtime/skill rollback guide](ROLLBACK.md) for affected users.
