# Release And Roadmap

This roadmap separates implementation checkpoints from public compatibility promises. The first stable `0.1.0` includes the local Skill Loop, GitHub integration, core AI adapters, and the distributable OmniBranch Skill.

## 1. Release Discipline

- Use semantic versioning.
- Use reviewed changesets or equivalent structured release metadata.
- Publish only from signed, protected tags produced by CI.
- Generate release notes from accepted changes, migrations, known limitations, and security impact.
- Produce npm provenance, checksums, and an SBOM.
- Keep remote mutation disabled by default in every pre-`1.0` release.
- Never make an undocumented event or configuration schema change.

## 2. Compatibility Surfaces

Track compatibility separately for:

- CLI commands and exit codes;
- YAML configuration schema;
- event and evidence schemas;
- adapter contract;
- Skill directory and reference structure;
- plugin/adapter package API;
- generated reports.

Before `1.0`, breaking changes are allowed only with an explicit migration note. After `1.0`, stable surfaces follow semantic versioning.

## 3. Development Milestones

### Milestone A: Specification Freeze

Deliver:

- charter, architecture, Skill Loop, configuration, adapter, security, build, and testing specifications;
- accepted ADRs for language, package manager, event store, SQLite library, process runner, schema validator, glob library, logger, and CLI parser;
- initial JSON Schemas and conformance fixtures.

Exit criteria:

- no unresolved contradiction between normative documents;
- example configuration passes its draft schema and semantic rules;
- threat model has an owner and review date.

### Milestone B: `0.1.0-alpha.1` Repository Foundation

Deliver:

- Node 22 and pinned pnpm workspace;
- contracts, platform, configuration, and test-kit packages;
- strict lint, type-check, formatting, and OS-matrix CI;
- `init`, `doctor`, and `config validate` CLI commands.

Exit criteria:

- clean build on Windows, Linux, and macOS;
- invalid config produces actionable diagnostics;
- repository initialization is idempotent.

### Milestone C: `0.1.0-alpha.2` Deterministic Vertical Slice

Deliver:

- append-only event log and rebuildable SQLite projections;
- Git/worktree backend;
- ownership locks, leases, scheduler, policy engine, and validation graph;
- mock worker adapter;
- `campaign create`, `plan`, `run`, `status`, `resume`, `validate`, `reconcile`, `cleanup`, and `report` commands.

Exit criteria:

- two independent fixture workers run concurrently;
- overlapping ownership is rejected;
- forced termination at each mutation boundary resumes correctly;
- required unavailable validation blocks promotion.

### Milestone D: `0.1.0-beta.1` GitHub Sandbox

Deliver:

- GitHub read operations;
- dry-run remote mutation plans;
- explicitly approved branch push and draft PR creation;
- check and mergeability observation;
- `review` and `promote` commands with policy-gated local and remote actions;
- duplicate-PR and retry protection.

Exit criteria:

- all remote tests target a dedicated sandbox repository;
- repeated operations are idempotent or safely rejected;
- credentials are absent from logs, reports, and event payloads.

### Milestone E: `0.1.0-beta.2` Engine Adapters And Skill

Deliver:

- Codex CLI and Claude Code CLI adapters;
- OpenCode CLI compatibility;
- Antigravity CLI capability probe;
- Antigravity IDE guided handoff;
- canonical `skills/omnibranch` package and generated provider layouts;
- adapter compatibility report.

Exit criteria:

- Codex and Claude pass the same adapter contract suite;
- unsupported capabilities downgrade to guided mode;
- OpenCode and Antigravity flows preserve assignment identity and evidence;
- independent forward tests can run a safe fixture campaign using the skill.

### Milestone F: `0.1.0-rc.1` Dogfood And Security Review

Deliver:

- an independent reference-repository profile and safety policy pack;
- a controlled multi-worker campaign on non-stable branches;
- recovery exercise and adversarial repository fixtures;
- installation, upgrade, and rollback verification;
- third-party dependency and release-pipeline review.

Exit criteria:

- no direct mutation of the reference repository's stable branch;
- every GitHub write has policy and approval evidence;
- no open critical or high-severity security defects;
- documentation matches observed behavior.

### Milestone G: `0.1.0` Initial Stable Release

Deliver:

- npm CLI package;
- source archive, checksums, SBOM, provenance, and release notes;
- OmniBranch Skill package;
- example repositories and configuration profiles;
- documented compatibility matrix and limitations.

Exit criteria:

- all release gates pass from a clean checkout;
- the release candidate has no known data-loss defect;
- install, initialize, run, resume, and uninstall paths are verified;
- public support and security-reporting channels exist.

## 4. Post-0.1 Roadmap

### `0.2`: Additional SCM Providers

- GitLab merge requests and pipelines;
- Bitbucket pull requests;
- Azure DevOps repositories and pull requests;
- provider-neutral approval and required-check hardening.

Do not add a provider until its adapter passes the same contract and hostile-input suites as GitHub.

### `0.3`: Team Coordination

- optional remote state synchronization;
- multi-operator leases and approval inbox;
- identity provider integration;
- repository policy distribution.

Local-only operation remains supported.

### `0.4`: Read-Focused Dashboard

- campaign and DAG visualization;
- branch/worktree occupancy;
- validation and approval evidence;
- adapter health and compatibility.

Remote mutation remains CLI/policy controlled until separately reviewed.

### `0.5`: Scheduled Runner

- explicit scheduled resume and reconciliation;
- bounded background execution;
- service lifecycle, health, update, and shutdown behavior;
- no hidden promotion or production mutation.

### `1.0`: Stable Protocol

`1.0` requires:

- stable configuration and event schemas;
- documented migrations from every supported `0.x` schema;
- at least two SCM providers passing conformance;
- at least three AI engine adapters passing maintained compatibility tests;
- proven crash recovery and concurrency behavior;
- external security review;
- published governance and deprecation policy.

## 5. Explicit Non-Goals

OmniBranch will not become:

- a replacement for Git or code review;
- a provider that hides AI usage or cost;
- a secret-management system;
- a cloud-only hosted dependency;
- an unrestricted production deployment agent;
- a workflow that treats model output as validation evidence;
- a branch-cleanup tool that deletes uncontained work.

## 6. Roadmap Change Rules

A roadmap change requires:

1. an issue describing user value and compatibility impact;
2. an ADR for architectural or security-boundary changes;
3. updated exit criteria and test coverage;
4. maintainer approval;
5. release notes when the change affects a published milestone.
