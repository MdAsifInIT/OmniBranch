# `@omnibranch/test-kit`

Private workspace package for reusable deterministic test utilities.

## Exports

- `FakeClock`
- `SequenceIdGenerator`
- Shared fixture helpers exported from `src/index.ts`

Use these helpers instead of wall time or random identifiers when testing scheduling, persistence, leases, policy, adapters, or recovery.

## Contributor boundary

Keep fixtures small, deterministic, offline, and free of production credentials. Hostile repositories and provider recordings belong under the repository-level `fixtures/` tree when they span packages.

## Verify

```sh
pnpm exec vitest run packages/test-kit/src
pnpm typecheck
```

Part of the [OmniBranch monorepo](../../README.md).
