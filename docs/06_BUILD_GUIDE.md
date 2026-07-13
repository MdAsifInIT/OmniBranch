# Build Guide

> **Reference status:** This document records the original implementation decomposition. For the current repository layout and supported commands, use [Development](DEVELOPMENT.md) and the package READMEs.

This guide takes OmniBranch from an empty directory to a tested local vertical slice. Build the deterministic control plane before connecting a real AI engine or remote SCM provider.

## 1. Prerequisites

Required:

- Git 2.40 or newer with worktree support;
- Node.js 22 LTS;
- Corepack;
- pnpm 9 or the current project-pinned compatible release;
- a terminal capable of running child processes without rewriting arguments.

Recommended:

- PowerShell 7 on Windows;
- Bash or Zsh on Linux and macOS;
- GitHub CLI for manual sandbox inspection only;
- Docker for optional hostile-repository and integration isolation.

Verify the host:

```text
node --version
corepack --version
git --version
```

Enable and pin pnpm:

```text
corepack enable
corepack prepare pnpm@9 --activate
pnpm --version
```

Replace the broad `pnpm@9` selector with the exact tested release in the root `packageManager` field before the first commit.

## 2. Create The Repository

Create a new standalone repository. Do not initialize it inside a repository that OmniBranch will later manage as a target.

PowerShell:

```powershell
New-Item -ItemType Directory -Path OmniBranch
Set-Location OmniBranch
git init
git branch -M main
```

POSIX:

```bash
mkdir OmniBranch
cd OmniBranch
git init
git branch -M main
```

Copy this documentation set into the new repository before implementation so architecture and acceptance criteria are versioned with the code.

## 3. Bootstrap The Workspace

Initialize the package manifest:

```text
pnpm init
```

Set these root `package.json` properties:

```json
{
  "name": "omnibranch",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@<exact-tested-version>",
  "engines": {
    "node": ">=22 <23"
  },
  "scripts": {
    "build": "tsc -b",
    "clean": "node scripts/clean.mjs",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:contracts": "vitest run --project contracts",
    "typecheck": "tsc -b --pretty false",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Install the initial development toolchain:

```text
pnpm add -D typescript @types/node vitest fast-check eslint @eslint/js typescript-eslint prettier tsx tsup
```

Do not install runtime libraries until the relevant ADR is accepted. At minimum, record decisions for YAML parsing, JSON Schema validation, process execution, glob matching, logging, and SQLite access.

## 4. Create The Monorepo Layout

Use Node for cross-platform directory creation:

```text
node -e "const fs=require('fs'); for (const p of ['apps/cli','packages/contracts','packages/platform','packages/config','packages/event-store','packages/projections','packages/git-backend','packages/work-ownership','packages/core','packages/scheduler','packages/policy-engine','packages/validation-graph','packages/reporting','packages/adapter-ai','packages/adapter-scm','packages/adapter-ci','packages/adapter-secrets','packages/test-kit','schemas','skills/omnibranch/agents','skills/omnibranch/references','skills/omnibranch/scripts','scripts','fixtures/repos','docs/adr']) fs.mkdirSync(p,{recursive:true})"
```

The root should become:

```text
apps/
  cli/
packages/
  contracts/
  platform/
  config/
  event-store/
  projections/
  git-backend/
  work-ownership/
  core/
  scheduler/
  policy-engine/
  validation-graph/
  reporting/
  adapter-ai/
  adapter-scm/
  adapter-ci/
  adapter-secrets/
  test-kit/
schemas/
skills/omnibranch/
fixtures/repos/
scripts/
docs/adr/
```

Each package must contain:

- `package.json` with a unique scoped name such as `@omnibranch/contracts`;
- `src/index.ts` as its public entrypoint;
- `tsconfig.json` extending the root configuration;
- an explicit `exports` map;
- only the workspace dependencies permitted by the architecture document.

Use TypeScript project references so `tsc -b` enforces dependency order. Keep `packages/contracts` and `packages/platform` free of adapter dependencies.

## 5. Establish Repository Quality Gates

Before product code, add:

- `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `useUnknownInCatchVariables`;
- an ESLint flat configuration with zero warnings in CI;
- Prettier configuration with LF line endings;
- `.editorconfig`;
- `.gitignore` covering `node_modules`, `dist`, coverage, temporary fixtures, and local OmniBranch runtime state;
- `vitest.config.ts` with unit, integration, and contract projects;
- `SECURITY.md`, `LICENSE`, and architecture decision record template;
- CI jobs for Windows, Linux, and macOS.

Run the empty baseline:

```text
pnpm install
pnpm verify
```

The baseline must pass before implementing the control plane.

## 6. Implement Packages In Dependency Order

### 6.1 Contracts

Implement stable identifiers and schemas for:

- campaign, work item, attempt, lane, assignment, lease, and approval;
- event envelopes and schema versions;
- validation evidence;
- adapter capabilities and normalized results;
- policy actions and decisions;
- Git refs, expected-head preconditions, and mutation results.

Keep contracts serializable and free of provider objects. Add round-trip and schema-version tests immediately.

### 6.2 Platform

Wrap nondeterministic host behavior:

- clock and random/ID generation;
- filesystem and canonical path resolution;
- environment and secret references;
- subprocess execution using argument arrays;
- signal handling and cancellation;
- atomic file writes and file locks.

Tests must inject fake clocks and deterministic IDs.

### 6.3 Configuration

Implement:

1. YAML parse without interpolation.
2. JSON Schema structural validation.
3. semantic validation for topology, ownership, commands, adapters, and policies.
4. approved template-token expansion.
5. defaults and normalization.
6. redacted configuration snapshots.

Ship schemas under `schemas/` and make `omnibranch config validate` report the exact YAML path and remediation.

### 6.4 Event Store And Projections

Treat JSONL events as canonical and SQLite as rebuildable:

- append events atomically with a global sequence and stream version;
- reject duplicate event IDs and optimistic-concurrency violations;
- rebuild projections from an empty database;
- checkpoint only after the projection transaction commits;
- never persist secrets in either store.

Add forced-termination tests around append, fsync, projection commit, and checkpoint update.

### 6.5 Git Backend

Invoke native Git through structured argument arrays. Implement read operations first:

- repository root and common Git directory discovery;
- worktree enumeration;
- status, refs, remotes, default-branch discovery, merge base, and ancestry;
- dirty/untracked/conflicted state detection.

Then implement mutations with expected-ref preconditions:

- branch creation;
- worktree add/remove;
- safe synchronization;
- containment-checked cleanup.

Do not implement force push, hard reset, or broad clean in the first release.

### 6.6 Ownership, Core, And Scheduler

Implement ownership glob normalization before concurrency:

- canonical repository-relative paths;
- exclusive and read-only scopes;
- overlap detection;
- high-conflict resource locks;
- work leases with heartbeat, expiry, and supersession.

The scheduler consumes a validated DAG and deterministic ready queue. It must never allocate a task when dependencies, capacity, ownership, approval, or adapter capability requirements are unsatisfied.

### 6.7 Validation And Policy

Validation commands must use platform-specific argument arrays or explicitly configured shell commands. Record:

- command identity and redacted invocation;
- input revision;
- start/end/duration;
- exit code;
- `pass`, `fail`, `error`, `unavailable`, or `skipped`;
- artifact and log references.

Only `pass` satisfies a required gate by default.

The policy engine must classify each requested action and return `allow`, `approval_required`, or `deny`. Unknown actions are denied. The AI worker cannot alter the result.

### 6.8 Reporting And CLI

Generate reports only from projections. Implement the CLI in this order:

```text
omnibranch init
omnibranch doctor
omnibranch config validate
omnibranch campaign create
omnibranch plan
omnibranch run
omnibranch status
omnibranch resume
omnibranch validate
omnibranch review
omnibranch promote
omnibranch reconcile
omnibranch cleanup
omnibranch report
```

Every command must support structured JSON output. Mutating commands must support `--dry-run` and print policy decisions before executing side effects.

## 7. Build The First Vertical Slice

Use a deterministic mock worker before a real AI engine.

The first fixture campaign must:

1. Initialize a temporary repository and local bare remote.
2. Create one integration lane and two independent work items.
3. Allocate disjoint ownership scopes.
4. Create two worktrees.
5. Run mock workers concurrently.
6. Produce deterministic file edits.
7. Run fixture validation commands.
8. Record events and rebuild SQLite projections.
9. Generate JSON and Markdown reports.
10. Simulate interruption after every mutation boundary and resume successfully.

Do not proceed to GitHub or AI adapters until this passes on Windows, Linux, and macOS.

## 8. Add The GitHub Adapter

Implement in increasing-risk order:

1. Probe authentication and repository identity.
2. Read refs, pull requests, checks, labels, and branch protection.
3. Produce remote mutation plans in dry-run mode.
4. Push a fixture branch to a dedicated sandbox repository.
5. Create or resolve one draft pull request idempotently.
6. Add comments and labels only through explicit policy-approved actions.
7. Read mergeability and required checks.

Never use a production repository for automated adapter tests. Credentials must come from secret references and must not enter event payloads.

## 9. Add AI Engine Adapters

Implement the shared contract before provider launch code:

```text
probe -> capabilities -> prepare -> launch -> supervise
      -> collect -> cancel/resume -> normalize result
```

Recommended order:

1. Mock adapter.
2. Codex CLI adapter.
3. Claude Code CLI adapter.
4. OpenCode CLI adapter.
5. Antigravity CLI adapter.
6. Antigravity IDE guided handoff.

Each adapter must pass the same contract suite. Unsupported or unverified capabilities must downgrade to guided mode rather than being guessed.

## 10. Build The OmniBranch Skill

The distributable skill is not the project documentation bundle. Keep it concise:

```text
skills/omnibranch/
  SKILL.md
  agents/openai.yaml
  references/
    configuration.md
    policies.md
    recovery.md
    adapters.md
  scripts/
    doctor.*
    validate-config.*
```

Requirements:

- folder name and frontmatter name are `omnibranch`;
- `SKILL.md` contains only essential operational workflow and remains under 500 lines;
- trigger conditions live in the frontmatter description;
- detailed provider/configuration material lives one reference level deep;
- scripts exist only for deterministic repeated actions and are directly tested;
- user-facing README, installation guide, and changelog remain outside the skill folder.

Use engine adapters or release tooling to materialize the canonical skill into provider-specific install locations. Do not maintain divergent hand-edited copies.

## 11. Local Development Loop

Use this sequence for every package change:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm build
```

Run live-adapter E2E tests only through an explicit opt-in environment and dedicated sandbox resources.

## 12. Definition Of Build Complete

The initial implementation is build-complete when:

- a clean checkout installs and builds with the pinned toolchain;
- all deterministic packages run without network access;
- the mock vertical slice survives crash-recovery tests;
- path ownership prevents conflicting workers;
- required unavailable validation cannot report pass;
- GitHub remote writes are dry-run by default and idempotent when enabled;
- Codex and Claude adapters pass the common contract suite;
- OpenCode and Antigravity provide at least verified guided compatibility;
- the skill validates and succeeds in independent forward tests;
- release gates in the testing guide pass on all supported operating systems.
