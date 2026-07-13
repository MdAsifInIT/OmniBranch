# `@omnibranch/adapters`

Private workspace package implementing AI-engine and GitHub-facing ports plus the offline mock adapter.

## Implementations

- `MockAiAdapter` for deterministic offline campaigns.
- `GitHubScmAdapter`, `OctokitGitHubApi`, and expected-state safe push support.
- Capability-driven CLI adapters for Codex, Claude Code, OpenCode, and Antigravity.
- Guided Antigravity IDE handoff.

## Contributor boundary

Adapters normalize provider behavior; they do not own lifecycle state, leases, policy, or validation truth. Unknown versions and missing safety controls must downgrade to guided or unsupported behavior. Live writes require scoped credentials, exact approval, stable correlation metadata, and duplicate detection.

## Verify

```sh
pnpm exec vitest run packages/adapters/src
pnpm test:contracts
pnpm test:security
```

Part of the [OmniBranch monorepo](../../README.md).
