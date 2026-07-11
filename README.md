# OmniBranch

OmniBranch is a provider-neutral orchestration system for running bounded AI development work across isolated Git branches and worktrees. It turns a branch-based development process into a persistent, repeatable Skill Loop while preserving explicit ownership, validation, review, and promotion gates.

OmniBranch does not ask an AI model to manage repository state by convention alone. A deterministic CLI owns Git operations, state transitions, scheduling, policy decisions, and evidence. AI engines receive narrowly scoped assignments through adapters.

## Project Status

This repository is currently a design and implementation blueprint. Start with the project charter and architecture documents before creating production code.

The intended first release is a local-first `0.1.0` CLI with:

- local Git and GitHub support;
- isolated worktree workers;
- dependency-aware scheduling and path ownership locks;
- configurable review lanes and approval gates;
- resumable campaign state and append-only audit evidence;
- Codex and Claude Code execution adapters;
- OpenCode and Antigravity guided or skill-compatible adapters;
- generated task, review, and merge reports.

## Design Principles

1. Deterministic control plane, probabilistic workers.
2. Capability-driven adapters instead of a lowest-common-denominator agent API.
3. Safe, idempotent, and resumable Git operations.
4. Explicit ownership before concurrent writes.
5. Validation evidence before promotion.
6. Human approval at policy-defined boundaries.
7. Local-first operation with no required telemetry.
8. Machine-readable state with generated human-readable reports.

## Skill Loop

```text
Discover -> Intake -> Plan -> Dependency Graph -> Ownership Allocation
         -> Isolated Execution -> Validation -> Integration Review
         -> Promotion -> Reconciliation -> Archive/Learn
```

The loop is re-entrant. `omnibranch resume` must be able to continue after a process crash, interrupted worker, externally merged branch, or partially completed validation pass.

## Documentation

| Document                                                      | Purpose                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Project charter](docs/00_PROJECT_CHARTER.md)                 | Product goals, users, scope, terminology, and success criteria       |
| [Architecture](docs/01_ARCHITECTURE.md)                       | Components, package boundaries, dependencies, and runtime model      |
| [Skill Loop specification](docs/02_SKILL_LOOP_SPEC.md)        | Normative state machine, invariants, leases, and recovery behavior   |
| [Configuration reference](docs/03_CONFIGURATION_REFERENCE.md) | Repository configuration, policies, lanes, validation, and adapters  |
| [Engine adapters](docs/04_ENGINE_ADAPTERS.md)                 | Codex, Claude Code, OpenCode, and Antigravity integration contract   |
| [Security and policy](docs/05_SECURITY_AND_POLICY.md)         | Threat model, action classification, approvals, redaction, and audit |
| [Build guide](docs/06_BUILD_GUIDE.md)                         | End-to-end instructions for implementing the project                 |
| [Testing and quality](docs/07_TESTING_AND_QUALITY.md)         | Test architecture, fixtures, platform matrix, and release gates      |
| [Release and roadmap](docs/08_RELEASE_AND_ROADMAP.md)         | Delivery phases, exit criteria, releases, and post-MVP scope         |
| [Implementation backlog](docs/09_IMPLEMENTATION_BACKLOG.md)   | Ordered epics and acceptance criteria for the first implementation   |
| [Architecture decisions](docs/10_ARCHITECTURE_DECISIONS.md)   | Initial decisions and deferred choices                               |
| [Contributing](CONTRIBUTING.md)                               | Contribution workflow and adapter requirements                       |

## Recommended Technology Baseline

- Node.js 22 LTS or later supported LTS release.
- TypeScript with strict compiler settings.
- pnpm workspaces.
- A schema-first configuration model using YAML plus JSON Schema.
- SQLite for local projections and JSON Lines for append-only events.
- Native `git` subprocesses behind a typed adapter.
- Vitest for unit and integration tests.
- Temporary repositories for Git integration tests.
- GitHub Actions for the initial CI and release pipeline.

Exact library choices must be recorded in architecture decision records before they become stable public contracts.

## Bootstrap Sequence

Do not implement all adapters at once. Build the deterministic vertical slice first:

```text
config -> state/events -> Git discovery -> worktree lifecycle
       -> ownership/leases -> command validation -> policy gates
       -> CLI status/resume -> mock agent adapter -> GitHub adapter
       -> Codex adapter -> Claude adapter -> skill packaging
```

Follow [Build Guide](docs/06_BUILD_GUIDE.md) for commands and package-by-package implementation instructions.

## Safety Defaults

OmniBranch must ship with these defaults:

- no direct writes to the stable branch;
- no force push;
- no automatic lane-to-stable promotion;
- no branch deletion before ancestry verification;
- no cloud, production, or destructive actions without approval;
- no secret values in prompts, reports, logs, or event payloads;
- no telemetry unless the operator explicitly enables it.

## License Recommendation

Use Apache License 2.0 for the open-source project because it includes an explicit patent grant. Confirm repository, npm scope, domain, and trademark availability before public release.
