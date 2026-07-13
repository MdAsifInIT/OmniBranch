# Upgrade

Upgrades are receipt-managed and preserve the previous verified skill as a rollback backup.

## Preview an upgrade

Use the version of the CLI that contains the desired skill payload:

```sh
omnibranch skill plan --target auto --scope user --dry-run --json
omnibranch skill status --target auto --scope user --json
```

Review every destination, mode, warning, and policy decision.

## Apply and verify

```sh
omnibranch skill update --target auto --scope user --json
omnibranch skill doctor --scope user --json
```

If the payload hash already matches, update is a no-op. Update fails when the destination is unmanaged, missing, or locally modified.

## Locally modified installations

Preserve your changes outside the managed destination, then compare them with the new canonical payload. Use `--force` only when replacing those edits is intentional:

```sh
omnibranch skill update --target agents --scope user --force --json
```

## Upgrade project-scoped skills

```sh
omnibranch skill update --target agents --scope project --project . --json
omnibranch skill doctor --scope project --project . --json
```

## Upgrade the orchestration runtime

1. Stop active workers and record campaign status/report output.
2. Preserve canonical JSONL events, configuration, reports, and the previous package/source revision.
3. Install the new reviewed version and run `pnpm verify:release` for source builds.
4. Validate the WorkspacePlan and reconcile in dry-run mode.
5. Rebuild SQLite from JSONL if the projection version or integrity requires it.
6. Resume only after policy and validation evidence is acceptable.

Breaking schema or evidence changes require documented migration or explicit rejection. Never silently coerce incompatible event or installer state.

See [Rollback](ROLLBACK.md) before upgrading a critical environment.
