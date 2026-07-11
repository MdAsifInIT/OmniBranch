# OmniBranch

[![Node.js 22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

OmniBranch is a local-first, provider-neutral CLI for coordinating bounded AI-assisted development work across Git branches and worktrees. It keeps the control plane deterministic: Git operations, scheduling, ownership, policy checks, validation evidence, and recovery are handled by the CLI, while AI tools work through narrowly scoped adapters.

The project is for maintainers who want to run parallel development work without treating prompts or model output as the source of truth for repository state.

## What it provides

- Isolated Git worktrees for concurrent, bounded work.
- Deterministic campaigns with dependency-aware scheduling and ownership leases.
- Resumable local state, canonical JSONL events, and rebuildable SQLite projections.
- Policy gates and approval evidence for sensitive actions.
- Validation, review, reconciliation, and human-readable or JSON reports.
- A mock adapter for offline development plus GitHub and AI-engine adapter foundations.
- Conservative defaults: no force push, no direct stable-branch writes, no automatic promotion, and no telemetry by default.

## Status

`0.1.0` is an active, source-distributed release. The project has a complete local vertical slice and intentionally remains conservative around remote mutations and stable-branch promotion. Please read [limitations](docs/LIMITATIONS.md), [compatibility](docs/COMPATIBILITY.md), and the [security policy](SECURITY.md) before using it with a production repository.

## Requirements

- Node.js 22 or later
- Git with worktree support
- Corepack and pnpm `11.11.0`

## Quick start

Clone the repository and build it from source:

```sh
git clone https://github.com/MdAsifInIT/OmniBranch.git
cd OmniBranch
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm build
```

Run the prerequisite check in the repository you plan to manage:

```sh
pnpm omnibranch -- doctor --json
```

Initialize a conservative workspace configuration, then validate it:

```sh
pnpm omnibranch -- init --json
pnpm omnibranch -- config validate --json
```

The `0.1` release is not published to npm. See the [installation guide](docs/INSTALLATION.md) for details and [examples](docs/EXAMPLES.md) for the campaign workflow.

## Typical workflow

```text
Discover → configure → create a campaign → plan → run isolated work
         → validate → review → promote with explicit approval → reconcile
```

The primary commands are:

```sh
pnpm omnibranch -- init
pnpm omnibranch -- doctor
pnpm omnibranch -- config validate
pnpm omnibranch -- campaign create --name example
pnpm omnibranch -- plan --campaign <id> --dry-run
pnpm omnibranch -- run --campaign <id>
pnpm omnibranch -- status --campaign <id>
pnpm omnibranch -- validate
pnpm omnibranch -- review --campaign <id>
pnpm omnibranch -- report --campaign <id>
```

Use `--json` for the stable machine-readable result envelope and `--dry-run` before any command that could mutate local state. Remote writes and promotion require separately created approval evidence.

## How it works

```text
Workspace plan + policy → deterministic runtime and policy gates → isolated Git worktrees
                                     │                              │
                                     └── events, evidence, reports ──┴── capability-based AI/SCM adapters
```

AI adapters can propose or execute bounded tasks, but cannot become the source of truth for lifecycle transitions, locks, or policy decisions. The runtime is designed to resume after interrupted processes, failed workers, or externally changed branches.

## Documentation

| Resource                                                      | Description                                             |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| [Project charter](docs/00_PROJECT_CHARTER.md)                 | Goals, users, scope, and success criteria               |
| [Architecture](docs/01_ARCHITECTURE.md)                       | Runtime model, package boundaries, and invariants       |
| [Skill Loop specification](docs/02_SKILL_LOOP_SPEC.md)        | State machine, ownership, recovery, and execution rules |
| [Configuration reference](docs/03_CONFIGURATION_REFERENCE.md) | Workspace plans, policies, lanes, and validation        |
| [Engine adapters](docs/04_ENGINE_ADAPTERS.md)                 | Adapter capabilities and provider integration contract  |
| [Security and policy](docs/05_SECURITY_AND_POLICY.md)         | Threat model, approvals, redaction, and audit model     |
| [Build guide](docs/06_BUILD_GUIDE.md)                         | Development and implementation guidance                 |
| [Testing and quality](docs/07_TESTING_AND_QUALITY.md)         | Test strategy and release gates                         |
| [Roadmap](docs/08_RELEASE_AND_ROADMAP.md)                     | Release phases and future scope                         |
| [Contributing](CONTRIBUTING.md)                               | How to contribute changes and adapters                  |

## Development

Use the pinned package manager and run the full check before opening a pull request:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:release
```

The repository is a TypeScript/pnpm workspace:

```text
apps/cli/            Command-line interface
packages/contracts/  Shared schemas and public contracts
packages/platform/   Host, process, logging, and filesystem primitives
packages/runtime/    Campaign, policy, state, and Git orchestration
packages/adapters/   AI and SCM adapter implementations
```

## Community and contributing

We welcome bug reports, documentation improvements, tests, adapter work, and thoughtful design discussion.

1. Search existing issues and discussions before opening a new one.
2. Keep pull requests focused, explain the user impact, and include tests for behavioral changes.
3. Run `pnpm verify` locally before requesting review.
4. For adapter changes, declare unsupported capabilities explicitly, retain the guided-mode fallback, and add hostile-input coverage.
5. Propose an ADR and migration note for breaking configuration, event, adapter, CLI, or report changes.

Please be constructive and respectful. The project values reproducible evidence, clear ownership, and human review over automation theatre.

## Security

Do not report vulnerabilities in public issues. Use [GitHub Security Advisories](https://github.com/MdAsifInIT/OmniBranch/security/advisories) for private reports. Never include credentials, production repository contents, or exploit details in public discussions. See [SECURITY.md](SECURITY.md) for the project policy.

## License

Copyright 2026 OmniBranch contributors.

OmniBranch is licensed under the [Apache License, Version 2.0](LICENSE). Contributions are accepted under the same license.
