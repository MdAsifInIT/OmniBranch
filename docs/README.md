<!-- generated-by: gsd-doc-writer -->

# OmniBranch documentation

Choose the shortest path for what you want to accomplish.

## Use OmniBranch

| Goal                                                    | Start here                            |
| ------------------------------------------------------- | ------------------------------------- |
| Install the CLI or Agent Skill                          | [Installation](INSTALLATION.md)       |
| Reach a working result quickly                          | [Getting started](GETTING-STARTED.md) |
| Copy a practical command sequence                       | [Examples](EXAMPLES.md)               |
| Configure branches, lanes, ownership, policy, and state | [Configuration](CONFIGURATION.md)     |
| Check provider and operating-system support             | [Compatibility](COMPATIBILITY.md)     |
| Upgrade a managed installation                          | [Upgrade](UPGRADE.md)                 |
| Recover or remove an installation safely                | [Rollback](ROLLBACK.md)               |
| Understand current boundaries                           | [Limitations](LIMITATIONS.md)         |

## Build and contribute

| Goal                                | Start here                         |
| ----------------------------------- | ---------------------------------- |
| Understand components and data flow | [Architecture](ARCHITECTURE.md)    |
| Set up a contributor checkout       | [Development](DEVELOPMENT.md)      |
| Run or extend the test suite        | [Testing](TESTING.md)              |
| Submit a change                     | [Contributing](../CONTRIBUTING.md) |
| Report a vulnerability              | [Security policy](../SECURITY.md)  |
| Prepare release artifacts           | [Release runbook](RELEASE.md)      |

## Technical references

The numbered documents are detailed implementation and design references. The guides above are the supported onboarding path.

| Reference                                                     | Subject                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| [00 — Project charter](00_PROJECT_CHARTER.md)                 | Product purpose, users, scope, and success criteria        |
| [01 — Architecture reference](01_ARCHITECTURE.md)             | Normative architectural principles and invariants          |
| [02 — Skill Loop specification](02_SKILL_LOOP_SPEC.md)        | State machine, ownership, leases, validation, and recovery |
| [03 — Configuration reference](03_CONFIGURATION_REFERENCE.md) | Complete WorkspacePlan field reference                     |
| [04 — Engine adapters](04_ENGINE_ADAPTERS.md)                 | Provider lifecycle and capability contracts                |
| [05 — Security and policy](05_SECURITY_AND_POLICY.md)         | Threat model, actions, approvals, and redaction            |
| [06 — Build guide](06_BUILD_GUIDE.md)                         | Repository implementation conventions                      |
| [07 — Testing and quality](07_TESTING_AND_QUALITY.md)         | Test taxonomy and release gates                            |
| [08 — Release and roadmap](08_RELEASE_AND_ROADMAP.md)         | Historical 0.1 milestones and later roadmap                |
| [09 — Implementation backlog](09_IMPLEMENTATION_BACKLOG.md)   | Historical implementation decomposition                    |
| [10 — Architecture decisions](10_ARCHITECTURE_DECISIONS.md)   | Decision summary and ADR index                             |
| [ADRs](adr/README.md)                                         | Immutable accepted decisions                               |

## Brand assets

The [Branch Nexus logo package](assets/brand/README.md) contains self-contained light/dark SVGs, a compact icon, and PNG fallbacks.

## Documentation principles

- Commands and paths must exist in the current repository.
- Implemented behavior and external verification are reported separately.
- Unknown provider capabilities are not presented as supported autonomy.
- Examples use fake identifiers and never include credential values.
- ADR history is preserved; changed decisions require superseding records.
