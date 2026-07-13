# `@omnibranch/contracts`

Private workspace package defining OmniBranch’s shared compatibility types and ports. It has no workspace dependencies and contains no provider behavior.

## Responsibilities

- Branded campaign, run, work-item, lease, approval, event, artifact, adapter, and worker identifiers.
- Canonical lifecycle, validation, policy, capability, adapter, assignment, event, and installer records.
- Ports for event/projection stores, Git, scheduling, policy, validation, AI, SCM, CI, and secrets.

## Contributor boundary

Changes here can affect every package and persisted compatibility surface. Breaking shapes require a versioned schema or contract, ADR, migration/rejection behavior, and contract tests. Keep this package dependency-light and free of platform or adapter implementation.

## Verify

```sh
pnpm typecheck
pnpm test:contracts
```

Part of the [OmniBranch monorepo](../../README.md).
