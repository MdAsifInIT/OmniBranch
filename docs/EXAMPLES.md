# Examples

All examples support the stable JSON envelope with `--json`. Use `--dry-run` before mutations when you are evaluating behavior.

## Inspect skill targets

```sh
omnibranch skill targets --scope user --json
omnibranch skill plan --target auto --scope user --dry-run --json
```

## Install every compatible user target

```sh
omnibranch skill install --target all --scope user --json
omnibranch skill status --target all --scope user --json
omnibranch skill doctor --scope user --json
```

## Install the generic skill into a repository

```sh
omnibranch skill install --target agents --scope project --project . --json
```

## Update, uninstall, and restore

```sh
omnibranch skill update --target agents --scope user --json
omnibranch skill uninstall --target agents --scope user --json
omnibranch skill rollback --target agents --scope user --json
```

Rollback restores the latest verified backup. Update is a no-op when the installed payload already matches.

## Initialize and validate a repository

From a source checkout:

```sh
pnpm omnibranch -- doctor --json
pnpm omnibranch -- init --name example-repository --dry-run --json
pnpm omnibranch -- init --name example-repository --json
pnpm omnibranch -- config validate .omnibranch/workspace.yaml --json
```

## Run the mock campaign

```sh
pnpm omnibranch -- campaign create --name example --json
pnpm omnibranch -- plan --campaign <campaign-id> --dry-run --json
pnpm omnibranch -- run --campaign <campaign-id> --json
pnpm omnibranch -- status --campaign <campaign-id> --json
pnpm omnibranch -- validate --json
pnpm omnibranch -- review --campaign <campaign-id> --json
pnpm omnibranch -- report --campaign <campaign-id> --json
```

The current local service plans a deterministic two-item fixture. It is designed to prove worktree isolation, evidence persistence, recovery, and reporting offline.

## Reconcile interrupted work

```sh
pnpm omnibranch -- reconcile --campaign <campaign-id> --dry-run --json
pnpm omnibranch -- resume --campaign <campaign-id> --dry-run --json
```

Remove `--dry-run` only after reviewing the plan and policy evidence.

## Inspect promotion policy

```sh
pnpm omnibranch -- promote --campaign <campaign-id> --dry-run --json
```

Promotion does not imply an automatic stable-branch or remote write. Approval and adapter capability must be explicit.

## Read the JSON envelope

Successful commands use this shape:

```json
{
  "ok": true,
  "command": "skill install",
  "data": {},
  "warnings": [],
  "policyDecisions": [],
  "dryRun": true
}
```

Failures add structured `code`, `message`, `retryability`, and optional `details` under `error`.
