# Upgrade

Preview and apply a managed skill upgrade:

```sh
npx omnibranch@0.2.0 skill plan --target auto --scope user --dry-run --json
npx omnibranch@0.2.0 skill update --target auto --scope user --json
omnibranch skill doctor --scope user --json
```

`update` operates only on receipt-managed destinations. It is a no-op when hashes already match and refuses local modifications unless `--force` is explicitly supplied. Previous managed content is retained as the rollback backup.

Before upgrading the orchestration runtime, stop workers, preserve authoritative JSONL events and configuration, run the complete release gate, then reconcile in dry-run mode. Breaking configuration, event, installer, evidence, adapter, report, CLI, or skill changes require a migration.
