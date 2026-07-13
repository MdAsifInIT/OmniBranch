# `@omnibranch/installer`

Private workspace package implementing universal, receipt-backed Agent Skill installation. It is bundled into the public CLI and is not published independently.

## Responsibilities

- Detect and resolve Codex, Claude Code, OpenCode, Antigravity, and generic Agent Skills targets.
- Produce deterministic, deduplicated user/project installation plans.
- Validate skill frontmatter, references, hashes, path containment, and managed-file evidence.
- Install, update, inspect, recover, roll back, and uninstall with locks, staging, journals, receipts, and backups.

## Contributor boundary

Planning must remain side-effect free. Mutation must refuse unmanaged or modified destinations unless the exact explicit flag is present. Journal-derived deletion or rename paths require revalidation before use.

## Verify

```sh
pnpm exec vitest run packages/installer/src/installer.test.ts
pnpm exec vitest run packages/installer/src/distribution.contract.test.ts
```

Part of the [OmniBranch monorepo](../../README.md).
