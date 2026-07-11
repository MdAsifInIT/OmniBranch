# Upgrade

1. Stop active workers and record `omnibranch status --json`.
2. Back up canonical `.omnibranch/runtime/events.jsonl` and configuration.
3. Fetch the desired signed source revision through your normal reviewed process.
4. Install with the pinned pnpm version and frozen lockfile.
5. Run `pnpm verify:release`, `omnibranch config validate --json`, and `omnibranch reconcile --dry-run --json`.
6. Rebuild SQLite from JSONL before resuming.

Breaking configuration, event, evidence, adapter, report, CLI, or skill changes require a migration and a documented compatibility note.
