<!-- generated-by: gsd-doc-writer -->

# Configuration

OmniBranch reads a strict YAML `WorkspacePlan` at `.omnibranch/workspace.yaml` by default. The compatibility surface is `omnibranch.dev/v1alpha1`, validated with the JSON Schema in `schemas/v1alpha1/workspace-plan.schema.json`. Unknown keys are rejected in closed objects.

## Create and validate a plan

```sh
omnibranch init --name my-repository --json
omnibranch config validate .omnibranch/workspace.yaml --json
```

`init` never overwrites an existing file. Validation returns YAML-path diagnostics with a rule, message, severity, and remediation. Snapshots redact secret-like references and environment values.

## Minimal working example

```yaml
apiVersion: omnibranch.dev/v1alpha1
kind: WorkspacePlan
metadata:
  name: my-repository
runtime:
  workspaceRoot: .
  tempRoot: ${gitCommonDir}/omnibranch/tmp
  worktreeRoot: ${repoParent}/.omnibranch-worktrees/${metadata.name}
branchTopology:
  trunk: main
  integrationBranches:
    - name: omnibranch/integration
      protect: true
  laneBranches:
    routine:
      prefix: omnibranch/routine/
      base: omnibranch/integration
      ephemeral: false
  attemptBranches:
    prefix: omnibranch/work/
lanes:
  routine:
    branchClass: routine
    maxConcurrentRuns: 1
    maxConcurrentItems: 1
ownership:
  sets:
    source:
      globs: [packages/**, apps/**]
      lanes: [routine]
commands:
  validate:
    - id: test
      run:
        windows: pnpm test
        posix: pnpm test
policies:
  defaultAction: require_approval
adapters:
  scm:
    provider: local
    mode: dry-run
state:
  projection:
    backend: sqlite
    path: ${gitCommonDir}/omnibranch/state.db
  eventStore:
    backend: jsonl
    path: ${gitCommonDir}/omnibranch/events.jsonl
reporting:
  outputRoot: ${gitCommonDir}/omnibranch/reports
```

## Top-level sections

| Section | Purpose |
| --- | --- |
| `metadata` | Stable workspace identity, owners, descriptions, and tags |
| `runtime` | Workspace, temporary, worktree, shell, concurrency, and lease settings |
| `branchTopology` | Trunk, integration, lane, and attempt branch namespaces |
| `lanes` | Priority, concurrency, branch class, and approval behavior |
| `ownership` | Repository-relative path globs assigned to lanes |
| `commands` | Cross-platform prepare, validate, or reporting commands |
| `policies` | Default action, named packs, and deterministic rules |
| `adapters` | Provider-specific configuration; structurally open in v1alpha1 |
| `state` | Canonical JSONL and rebuildable SQLite paths |
| `reporting` | Output formats, location, telemetry, and redaction |
| `secrets` | Allowed secret-reference mechanisms and named references |

## Defaults

| Setting | Default |
| --- | --- |
| `runtime.nodeVersion` | `22` |
| `runtime.dryRunDefault` | `true` |
| `runtime.globalConcurrency` | `1` |
| `runtime.reconciliationInterval` | `30s` |
| `runtime.shell.windows` / `.posix` | `powershell` / `bash` |
| `runtime.lease.ttl` | `15m` |
| `runtime.lease.heartbeatInterval` | `30s` |
| `runtime.lease.gracePeriod` | `90s` |
| `ownership.defaultMode` | `exclusive` |
| `policies.defaultAction` | `require_approval` |
| `state.snapshots.enabled` / `.interval` | `true` / `250` |
| `reporting.formats` | `[markdown]` |
| `reporting.includeTelemetry` | `false` |
| `reporting.redact.secrets` / `.envValues` | `true` / `true` |

## Template tokens

Only these path tokens are accepted:

- `${gitCommonDir}` — the repository’s common Git directory.
- `${repoParent}` — the parent of the repository root.
- `${metadata.name}` — the validated workspace name.

Unknown tokens fail validation. Relative paths resolve from the repository root. `workspaceRoot` must stay inside the repository, while persistent state must not overlap the managed worktree root.

## Semantic validation

After JSON Schema validation, OmniBranch rejects:

- lanes that reference an unknown branch class;
- lane branches whose base is neither trunk nor a declared integration branch;
- overlapping lane/attempt branch prefixes;
- ownership sets that reference unknown lanes;
- absolute, drive-qualified, or traversal ownership globs;
- ambiguous exclusive ownership overlap;
- duplicate command IDs within a group;
- commands missing for the active operating system;
- persistent state placed under the managed worktree root.

## Environment variables

The core WorkspacePlan does not require environment variables for local mock execution. Supported runtime variables are:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OMNIBRANCH_LOG_LEVEL` | No | `info` | Pino log level |
| `CODEX_HOME` | No | `~/.codex` | Codex user-scope skill root |
| `XDG_CONFIG_HOME` | No | `~/.config` | OpenCode configuration root |

Provider credentials are needed only for the corresponding live adapter and must be supplied as scoped secret references. Never place credential values directly in the WorkspacePlan.

## Secret references and redaction

The schema supports `fromEnv`, `fromFile`, and `fromKeychain` references. Inline and command-based secret resolution are disabled by conservative configuration. Resolved values must not be persisted to events, projections, reports, prompts, or logs.

## Compatibility

Breaking changes require a new `apiVersion`, migration guidance, or explicit rejection. OmniBranch does not silently coerce unknown schema versions. See the exhaustive [configuration reference](03_CONFIGURATION_REFERENCE.md) and [WorkspacePlan schema](../schemas/v1alpha1/workspace-plan.schema.json).
