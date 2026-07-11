# OmniBranch Configuration Reference

## 1. Status and Scope

This document defines the normative YAML configuration model for OmniBranch. The configuration targets a TypeScript/Node 22 runtime and is intended to be validated by a JSON Schema plus semantic validation passes.

The keywords MUST, SHOULD, and MAY are normative.

## 2. Format Overview

An OmniBranch configuration document MUST:

- be UTF-8 YAML
- declare `apiVersion`
- declare `kind`
- validate against the matching JSON Schema version
- normalize into a deterministic internal configuration before execution

Recommended schema metadata:

- JSON Schema draft: `2020-12`
- schema identifier pattern: `https://omnibranch.dev/schema/<apiVersion>/<kind>.schema.json`
- top-level unknown keys: rejected by default

## 3. Complete Example

```yaml
apiVersion: omnibranch.dev/v1alpha1
kind: WorkspacePlan

metadata:
  name: sample-monorepo
  description: Cross-platform multi-lane development orchestration
  owners:
    - platform-team
    - release-engineering
  tags:
    env: local
    profile: conservative

runtime:
  nodeVersion: '22'
  workspaceRoot: .
  tempRoot: ${gitCommonDir}/omnibranch/tmp
  worktreeRoot: ${repoParent}/.omnibranch-worktrees/${metadata.name}
  shell:
    windows: powershell
    posix: bash
  dryRunDefault: true
  globalConcurrency: 4
  reconciliationInterval: 30s
  lease:
    ttl: 15m
    heartbeatInterval: 30s
    gracePeriod: 90s

branchTopology:
  trunk: auto
  integrationBranches:
    - name: omnibranch/integration
      protect: true
  laneBranches:
    routine:
      prefix: omnibranch/routine/
      base: omnibranch/integration
      ephemeral: false
    high-review:
      prefix: omnibranch/high-review/
      base: omnibranch/integration
      ephemeral: false
    experimental:
      prefix: omnibranch/experimental/
      base: omnibranch/integration
      ephemeral: true
  attemptBranches:
    prefix: omnibranch/work/
    baseFromLane: true

lanes:
  routine:
    priority: 100
    maxConcurrentRuns: 2
    maxConcurrentItems: 2
    branchClass: routine
    approvals:
      requiredFor:
        - scm.push
        - scm.pull_request
  high-review:
    priority: 80
    maxConcurrentRuns: 1
    maxConcurrentItems: 1
    branchClass: high-review
  experimental:
    priority: 40
    maxConcurrentRuns: 1
    maxConcurrentItems: 1
    branchClass: experimental
    disabledByDefault: true

ownership:
  defaultMode: exclusive
  sets:
    backend-core:
      globs:
        - backend/core/**
        - packages/core/**
      lanes:
        - routine
        - high-review
    frontend-ui:
      globs:
        - frontend/**
      lanes:
        - routine
    shared-contracts:
      globs:
        - packages/contracts/**
        - packages/config/**
      lanes:
        - routine
      requiresApproval: true

commands:
  prepare:
    - id: install
      run:
        windows: pnpm install --frozen-lockfile
        posix: pnpm install --frozen-lockfile
      timeout: 20m
  validate:
    - id: lint
      run:
        windows: pnpm lint
        posix: pnpm lint
      outputs:
        format: text
    - id: test
      run:
        windows: pnpm test
        posix: pnpm test
      timeout: 30m
    - id: build
      run:
        windows: pnpm build
        posix: pnpm build
  report:
    - id: summary
      run:
        windows: pnpm exec omnibranch report --format markdown
        posix: pnpm exec omnibranch report --format markdown

policies:
  defaultAction: require_approval
  packs:
    - name: baseline-safe-defaults
  rules:
    - id: require-approval-for-shared-contracts
      when:
        ownershipSet: shared-contracts
        actionIn:
          - lease.acquire
          - scm.push
      then:
        action: require_approval
        reason: shared-contract-scope
    - id: dry-run-external-ci-by-default
      when:
        adapterType: ci
        laneNotIn:
          - high-review
      then:
        action: force_dry_run
        reason: conservative-default

adapters:
  scm:
    provider: github
    mode: dry-run
    repository: org/repo
    apiBaseUrl: https://api.github.com
    token:
      fromEnv: GITHUB_TOKEN
  ci:
    provider: local
    mode: execute
  ai:
    default: codex-local
    providers:
      codex-local:
        provider: codex
        surface: cli
        mode: supervised
        executable: codex
        model: inherit
      claude-local:
        provider: claude-code
        surface: cli
        mode: supervised
        executable: claude
        model: inherit
  secrets:
    provider: env

state:
  projection:
    backend: sqlite
    path: ${gitCommonDir}/omnibranch/state.db
  eventStore:
    backend: jsonl
    path: ${gitCommonDir}/omnibranch/events.jsonl
  snapshots:
    enabled: true
    interval: 250

reporting:
  outputRoot: ${gitCommonDir}/omnibranch/reports
  formats:
    - markdown
    - json
  includeTelemetry: false
  redact:
    secrets: true
    envValues: true
    userPaths: false

secrets:
  rules:
    allowInline: false
    allowEnv: true
    allowFileRef: true
    allowCommandRef: false
  named:
    githubToken:
      fromEnv: GITHUB_TOKEN
```

## 4. Top-Level Keys

The root object MUST contain:

- `apiVersion`
- `kind`
- `metadata`
- `runtime`
- `branchTopology`
- `lanes`
- `ownership`
- `commands`
- `policies`
- `adapters`
- `state`
- `reporting`

`secrets` SHOULD be present when any adapter requires credential material.

## 5. Schema Expectations

## 5.1 Structural validation

The JSON Schema SHOULD enforce:

- required fields
- scalar and object types
- enum constraints for well-known providers and actions
- pattern validation for durations, branch prefixes, and identifiers
- `additionalProperties: false` at top level and for closed objects by default

## 5.2 Semantic validation

Schema validation alone is insufficient. The runtime MUST also validate:

- referenced lanes exist
- ownership sets reference declared lanes only
- command identifiers are unique
- branch prefixes do not overlap ambiguously
- adapter modes are compatible with provider types
- policy rules reference known actions and selectors
- state paths do not collide with worktree paths
- secrets rules do not contradict adapter requirements

## 5.3 Defaults

Implementations SHOULD apply these defaults unless overridden:

- `runtime.dryRunDefault: true`
- `runtime.globalConcurrency: 1`
- `runtime.reconciliationInterval: 30s`
- `runtime.lease.ttl: 15m`
- `runtime.lease.heartbeatInterval: 30s`
- `ownership.defaultMode: exclusive`
- `policies.defaultAction: require_approval` for recognized actions without a matching rule
- unknown action classes are always denied
- `reporting.formats: [markdown]`
- `reporting.includeTelemetry: false`
- `reporting.redact.secrets: true`

Defaults MUST be applied before semantic validation that depends on them.

## 6. `metadata`

`metadata` identifies the workspace plan.

Fields:

- `name` MUST be a stable identifier for reporting and event correlation.
- `description` MAY provide human-readable context.
- `owners` SHOULD list responsible teams or operators.
- `tags` MAY store environment or profile labels.

## 7. `runtime`

`runtime` defines local execution behavior.

Fields:

- `nodeVersion`
  - MUST match the supported major runtime, such as `"22"`.
- `workspaceRoot`
  - MUST resolve to the repository root or execution root.
- `tempRoot`
  - SHOULD be disposable and separate from persisted state.
- `worktreeRoot`
  - MUST be reserved for OmniBranch-managed worktrees.
  - SHOULD resolve outside the primary working tree.
- path templates
  - MAY use the normalized tokens `${gitCommonDir}`, `${repoParent}`, and `${metadata.name}`.
  - MUST reject unknown tokens during semantic validation.
- `shell.windows` and `shell.posix`
  - MUST map to supported shells on each platform.
- `dryRunDefault`
  - Controls the default safety mode for side-effecting operations.
- `globalConcurrency`
  - MUST be a positive integer.
- `reconciliationInterval`
  - MUST be a valid duration string.
- `lease`
  - MUST define `ttl`.
  - SHOULD define `heartbeatInterval` less than `ttl`.
  - MAY define `gracePeriod` for late cleanup.

## 8. `branchTopology`

`branchTopology` defines how OmniBranch reasons about ancestry and branch classes.

Fields:

- `trunk`
  - MUST name the canonical base branch or use `auto` to discover the remote default branch.
- `integrationBranches`
  - MAY define one or more long-lived integration targets.
- `laneBranches`
  - MUST define the branch class used by each lane.
- `attemptBranches`
  - SHOULD define a stable prefix for ephemeral execution branches.

Rules:

- lane branch prefixes MUST be unique
- attempt branch prefixes MUST NOT overlap lane or trunk names
- every lane branch `base` MUST refer to `trunk` or a declared integration branch
- if `baseFromLane: true`, attempt branches inherit the resolved lane base

## 9. `lanes`

`lanes` partition work by risk, purpose, or topology.

Each lane object SHOULD define:

- `priority`
- `maxConcurrentRuns`
- `maxConcurrentItems`
- `branchClass`
- `disabledByDefault`
- `approvals`

Rules:

- lane keys MUST be unique
- `branchClass` SHOULD resolve to a declared `branchTopology.laneBranches` entry
- disabled lanes MUST NOT schedule new runs unless explicitly enabled

## 10. `ownership`

`ownership` defines lock scopes and edit boundaries.

Fields:

- `defaultMode`
  - MUST be `exclusive` or `shared` if shared mode is supported.
- `sets`
  - map of ownership set name to rule object

Each ownership set SHOULD define:

- `globs`
- `lanes`
- `requiresApproval`
- optional metadata such as `description` or `priorityBoost`

Rules:

- glob patterns MUST be normalized relative to `workspaceRoot`
- the same path MAY match multiple sets only if the conflict resolution policy is deterministic
- overlapping exclusive sets SHOULD be rejected unless precedence is explicit
- ownership data MUST drive lock acquisition and policy checks

## 11. `commands`

`commands` declares executable command groups. Typical groups are `prepare`, `validate`, and `report`, but the runtime MAY support additional typed groups.

Each command entry MUST define:

- `id`
- `run`

Optional fields:

- `timeout`
- `workingDirectory`
- `env`
- `outputs`
- `continueOnError`
- `requiresApproval`

Rules:

- `run.windows` and `run.posix` SHOULD both be provided for cross-platform repos
- command IDs MUST be unique within a group
- environment variables referenced by `env` SHOULD resolve through `secrets` rules or safe literals
- long-running commands SHOULD define timeouts

## 12. `policies`

`policies` governs runtime decisions.

Fields:

- `defaultAction`
  - SHOULD be one of `allow`, `deny`, `require_approval`.
- `packs`
  - named reusable rule bundles
- `rules`
  - ordered rules evaluated by the policy engine

Supported policy actions SHOULD include:

- `allow`
- `deny`
- `require_approval`
- `force_dry_run`
- `escalate`
- `skip`

Rules:

- policy rule IDs MUST be unique
- rule conditions SHOULD be side-effect free
- actions affecting side-effecting adapters MUST be recorded in the event log
- example packs MAY include conservative defaults or product-specific safety presets, but they MUST remain optional

## 13. `adapters`

`adapters` binds provider implementations.

Recommended sections:

- `scm`
- `ci`
- `ai`
- `secrets`

Common fields:

- `provider`
- `mode`
- provider-specific connection metadata
- secret references

Rules:

- side-effecting adapter modes SHOULD distinguish `dry-run` from `execute`
- AI adapters MAY support `guided`, `supervised`, or provider-specific read-only modes and MUST NOT be configured as authoritative state writers
- multiple AI providers MAY be declared, but exactly one default provider MUST resolve when execution requires AI
- missing provider credentials MUST fail early when the adapter is required for the selected mode

## 14. `state`

`state` defines durable runtime storage.

Fields:

- `projection`
  - defines the rebuildable query store, such as SQLite
- `eventStore`
  - defines the canonical append-only event backend and path
- `snapshots`
  - snapshot enablement and cadence

Rules:

- the event store MUST support ordered append and optimistic concurrency or equivalent guarantees
- the projection store MUST be rebuildable from the event store
- local state paths MUST be writable and MUST NOT overlap temporary worktree directories
- snapshot intervals MUST be positive integers if enabled

## 15. `reporting`

`reporting` defines operator-facing outputs.

Fields:

- `outputRoot`
- `formats`
- `includeTelemetry`
- `redact`

Rules:

- `formats` SHOULD contain at least one human-readable format
- secret redaction MUST default to enabled
- telemetry MUST default to disabled
- reports MUST be derivable from state and projections without rereading live adapter responses

## 16. `secrets`

`secrets` defines allowed secret source types and named references.

Rules:

- inline secret values MUST be disallowed by default
- secret references SHOULD use `fromEnv`, `fromFile`, or OS-native secret store references
- `allowCommandRef` SHOULD default to `false`
- resolved secret values MUST NOT be persisted in event logs, reports, or normalized config snapshots

Example secret reference forms:

- `fromEnv: GITHUB_TOKEN`
- `fromFile: .secrets/github.token`
- `fromKeychain: omnibranch/github`

## 17. Validation Failure Guidance

The runtime SHOULD produce actionable validation messages that include:

- config path
- violated rule
- normalized value, when safe
- remediation hint

Validation MUST fail closed when:

- branch topology is ambiguous
- ownership conflicts are unresolved
- commands are missing for the active platform
- an enabled adapter lacks required credentials
- a policy rule references an unknown action or selector

## 18. Compatibility and Versioning

`apiVersion` MUST version breaking schema changes. Implementations SHOULD provide explicit migration or rejection behavior when older documents are encountered. Silent coercion across incompatible versions MUST NOT occur.
