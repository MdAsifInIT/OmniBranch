# `@omnibranch/runtime`

Private workspace package containing OmniBranch’s deterministic control plane and local campaign vertical slice.

## Responsibilities

- WorkspacePlan parsing, defaults, schema/semantic validation, template expansion, and redaction.
- Work-item state transitions, DAG validation, deterministic scheduling, ownership, leases, policy, validation, and backoff.
- Canonical JSONL events, SQLite projections, native Git/worktree backend, repository discovery, and reconciliation.
- `LocalCampaignService` for offline mock planning, execution, reporting, and recovery.

## Contributor boundary

JSONL remains authoritative and SQLite remains rebuildable. Decision logic must be reproducible from equivalent inputs. Concrete provider behavior belongs in `@omnibranch/adapters`; runtime services consume contracts and normalized evidence.

## Verify

```sh
pnpm exec vitest run packages/runtime/src
pnpm test:integration
pnpm typecheck
```

Part of the [OmniBranch monorepo](../../README.md).
