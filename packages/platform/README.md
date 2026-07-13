# `@omnibranch/platform`

Private workspace package for deterministic host, process, filesystem, path, logging, clock, and identifier primitives.

## Key exports

- `SystemClock`, `FakeClock`, `UuidGenerator`, and `SequenceIdGenerator`.
- `ExecaProcessRunner` for executable-plus-argument-array process execution.
- Repository path normalization and containment helpers.
- Atomic writes, filesystem mutexes, stable hashing, redaction, host facts, and structured logging.

## Contributor boundary

Keep provider and orchestration policy out of this package. Filesystem changes must validate containment and process APIs must not interpolate untrusted shell strings. Tests should inject clocks and deterministic IDs.

## Verify

```sh
pnpm exec vitest run packages/platform/src
pnpm typecheck
```

Part of the [OmniBranch monorepo](../../README.md).
