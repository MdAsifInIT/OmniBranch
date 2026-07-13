# Initial Implementation Backlog

> **Historical backlog:** This decomposition is preserved for design traceability and is not the current contributor task list. Use GitHub issues and [Contributing](../CONTRIBUTING.md) for active work.

This backlog is ordered by dependency. Do not start real AI adapters before the deterministic mock-adapter vertical slice passes recovery and concurrency tests.

## Epic 0: Repository Foundation

Deliverables:

- pnpm workspace and strict TypeScript configuration;
- package dependency rules;
- lint, format, test, type-check, and build commands;
- GitHub CI for Windows, Linux, and macOS;
- Apache-2.0 license, security policy, contribution guide, and release process;
- architecture decision record template.

Exit criteria:

- clean install and build on all supported operating systems;
- no package dependency cycles;
- reproducible lockfile installation;
- one command runs all non-E2E quality checks.

## Epic 1: Configuration And Repository Discovery

Deliverables:

- YAML parser and JSON Schema validation;
- configuration migration/version field;
- repository root, common Git directory, default branch, and remote discovery;
- `omnibranch init`, `doctor`, and `config validate`;
- dry-run explanation of generated configuration.

Exit criteria:

- fixture repositories cover normal clone, worktree, detached HEAD, no remote, multiple remotes, and non-`main` default branch;
- invalid configuration reports source locations and remediation;
- initialization is idempotent.

## Epic 2: Event Store And Campaign Projection

Deliverables:

- versioned event envelope;
- append-only JSONL writer with atomic fsync strategy;
- SQLite projection store;
- projection rebuild from events;
- campaign, work-item, attempt, lease, evidence, and approval models;
- `campaign create`, `status`, and projection-backed `report` foundations.

Exit criteria:

- deleting SQLite and rebuilding produces the same campaign state;
- duplicate event IDs and invalid transitions are rejected;
- interrupted writes do not corrupt prior events.

## Epic 3: Git And Worktree Backend

Deliverables:

- typed Git subprocess wrapper;
- ref preconditions and ancestry checks;
- branch create, sync, inspect, and cleanup operations;
- isolated worktree lifecycle;
- deterministic naming and collision handling;
- repository-level mutation lock.

Exit criteria:

- no force operations are used by default;
- cleanup refuses uncontained commits and dirty worktrees;
- every mutation can be retried safely after simulated process death.

## Epic 4: Planner, DAG, Ownership, And Scheduler

Deliverables:

- work-item schema and dependency validation;
- cycle detection;
- ownership glob normalization and conflict detection;
- lease acquisition, heartbeat, expiry, and recovery;
- configurable global, lane, and adapter concurrency limits;
- deterministic runnable-task selection.

Exit criteria:

- conflicting paths never receive simultaneous write leases;
- expired leases are not silently reused;
- scheduler decisions are reproducible from the same state;
- property tests cover arbitrary dependency graphs.

## Epic 5: Validation And Evidence

Deliverables:

- shell-neutral command specification;
- working directory, environment, timeout, and platform conditions;
- pass/fail/error/unavailable/skipped results;
- log capture and secret redaction;
- validation dependency graph;
- JSON evidence export and human-readable summaries.

Exit criteria:

- required unavailable checks block promotion by default;
- exit code, duration, command identity, and redacted logs are retained;
- Windows and POSIX quoting tests cover hostile arguments.

## Epic 6: Policy And Approval Engine

Deliverables:

- action classification;
- allow, require-approval, and deny evaluation;
- repository, lane, task, and invocation policy layers;
- approval provenance and expiry;
- preflight explanations;
- immutable policy-decision evidence.

Exit criteria:

- workers cannot approve their own gated actions;
- higher-risk actions cannot be weakened by a lower-priority policy layer;
- secrets and destructive actions are denied by default.

## Epic 7: Mock Adapter Vertical Slice

Deliverables:

- adapter capability interface;
- version probing and compatibility result;
- structured assignment envelope;
- mock adapter capable of deterministic edits, failures, timeouts, and malformed responses;
- result collection, cancellation, and retry behavior.
- `plan`, `run`, `resume`, `validate`, `reconcile`, and `cleanup` command integration.

Exit criteria:

- a two-task campaign completes through isolated worktrees and validation;
- forced failures at every boundary resume correctly;
- malformed worker output cannot promote a task.

## Epic 8: GitHub SCM Adapter

Deliverables:

- repository identity and authentication probe;
- branch push, draft PR creation, labels, comments, checks, and merge-state reads;
- idempotency keys or equivalent duplicate detection;
- explicit policy gates for all remote writes;
- local fake or recorded contract tests.
- `review` and `promote` command integration behind policy gates.

Exit criteria:

- repeated PR creation resolves to the existing OmniBranch PR;
- insufficient permissions produce actionable errors;
- no test mutates a real repository by default.

## Epic 9: Codex And Claude Code Adapters

Deliverables:

- capability probes;
- non-interactive execution where supported;
- structured event/result parsing;
- session identification and resume behavior;
- bounded permission configuration;
- adapter-specific skill installation guidance.

Exit criteria:

- both adapters pass the same contract suite;
- unsupported capabilities downgrade to guided mode;
- adapter output schema changes fail clearly rather than silently.

## Epic 10: OpenCode And Antigravity Compatibility

Deliverables:

- OpenCode execution adapter and skill materialization;
- Antigravity CLI capability probe;
- Antigravity and Antigravity IDE guided-mode handoff;
- compatibility matrix generated from probes and tests.

Exit criteria:

- core behavior remains unchanged when an adapter lacks resume or streaming;
- guided-mode instructions contain stable task IDs and worktree paths;
- results can be imported and validated without trusting free-form completion claims.

## Epic 11: Agent Skill Package

Deliverables:

- concise `skills/omnibranch/SKILL.md` with only the operational workflow;
- `references/` for configuration, policy, recovery, and adapter details;
- deterministic scripts for initialization or validation when repetition justifies them;
- generated engine-specific installation layouts;
- skill metadata and validation.

Exit criteria:

- the core `SKILL.md` remains under 500 lines;
- detailed references are one level deep and not duplicated;
- independent forward tests can initialize, inspect, and run a safe fixture campaign.

## Epic 12: Dogfood And Release Candidate

Deliverables:

- independent reference-repository profile and policy pack;
- controlled campaign using non-stable targets;
- recovery exercise, security review, and performance measurements;
- installation documentation and sample repositories;
- release candidate artifacts and SBOM.

Exit criteria:

- no direct write reaches the reference repository's stable branch;
- all mutations and approvals are represented in the event ledger;
- release gates in the testing guide pass;
- known limitations are documented and accepted.
