# Project Charter

## 1. Purpose

OmniBranch generalizes a proven branch-based autonomous development process into a reusable open-source tool and Agent Skill. It coordinates multiple AI workers without delegating repository correctness to those workers.

The product is responsible for orchestration, not software engineering judgment. It provides isolation, scheduling, policy enforcement, evidence, and recovery so humans and AI assistants can collaborate safely across multiple workstreams.

## 2. Problem Statement

AI development tools can edit code effectively, but multi-worker repository development remains fragile:

- workers collide on shared files;
- branch topology and review burden live in informal prompts;
- state is duplicated across task lists, pull requests, and chat history;
- interrupted work is difficult to resume safely;
- validation results are incomplete or inconsistently recorded;
- assistants expose different automation, permission, skill, and subagent interfaces;
- an apparently successful worker can leave stale, conflicting, or unreviewable changes.

OmniBranch addresses these problems with a deterministic campaign engine and capability-specific AI adapters.

## 3. Target Users

- Individual developers running several AI-assisted tasks in parallel.
- Maintainers coordinating AI work through review branches.
- Teams that require approval gates, auditability, and reproducible validation.
- Tool authors who need one branch orchestration protocol across multiple AI engines.
- Open-source projects that want opt-in AI contribution workflows without granting unrestricted repository access.

## 4. Primary Use Cases

### 4.1 Parallel feature development

Plan several independent tasks, allocate disjoint ownership, create isolated worktrees, execute workers concurrently, and open reviewable branches.

### 4.2 Risk-separated integration

Route routine changes, high-review changes, and experimental work into different configurable lanes with distinct validation and promotion policies.

### 4.3 Interrupted campaign recovery

Resume after a terminal closes, machine restarts, worker fails, network disappears, or a branch is changed externally.

### 4.4 Cross-engine execution

Run equivalent bounded assignments through Codex, Claude Code, OpenCode, or Antigravity without embedding engine-specific behavior in the core state machine.

### 4.5 Read-only review and reconciliation

Inspect repository state, compare it with the event ledger, identify stale branches or leases, and produce a repair plan without mutating the repository.

## 5. Product Modes

| Mode         | Behavior                                                            |
| ------------ | ------------------------------------------------------------------- |
| `audit`      | Read-only discovery, validation, and reconciliation recommendations |
| `guided`     | Emit plans and commands; the operator performs mutations            |
| `supervised` | Execute allowed work and stop at configured approval gates          |
| `autonomous` | Execute explicitly authorized actions within policy boundaries      |

Mode selection never overrides a policy denial. `autonomous` is not unrestricted execution.

## 6. Goals

- Make campaigns deterministic, observable, and resumable.
- Support concurrent workers without overlapping write ownership.
- Keep branch strategy configurable and repository-neutral.
- Record every important state transition and external mutation.
- Produce structured validation evidence.
- Separate AI engine capabilities from orchestration semantics.
- Provide a concise, progressively disclosed Agent Skill.
- Operate on Windows, Linux, and macOS.
- Require no hosted OmniBranch service for core functionality.

## 7. Non-Goals For Version 0.1

- Replacing Git, pull requests, CI systems, or code review.
- Selecting product requirements without operator input.
- Guaranteeing the correctness of AI-generated code.
- Running arbitrary production deployments.
- Hosting a multi-tenant orchestration service.
- Providing a browser dashboard.
- Supporting every SCM provider in the first release.
- Hiding provider costs, credentials, or permission decisions.
- Maintaining long-lived autonomous daemons.

## 8. Success Criteria

Version 0.1 is successful when it can:

1. Initialize a previously unsupported Git repository without changing source files unexpectedly.
2. Validate and explain its generated configuration.
3. Plan a dependency graph from bounded work items.
4. Reject overlapping write ownership before workers start.
5. Run at least two workers concurrently in separate worktrees.
6. Recover deterministically after forced termination at each mutation boundary.
7. Collect validation evidence and prevent promotion when required checks fail or are unavailable.
8. Open a GitHub pull request through an explicit policy-approved action.
9. Execute one end-to-end fixture through Codex and Claude Code adapters.
10. Run guided compatibility flows for OpenCode and Antigravity.
11. Dogfood a campaign against an independent reference repository without writing to its stable branch.

## 9. Core Invariants

- One canonical machine-readable campaign state exists.
- Events are append-only.
- A task has at most one active write lease.
- Conflicting ownership scopes cannot be leased concurrently.
- A worker cannot authorize its own prohibited or approval-gated action.
- Validation states distinguish pass, fail, unavailable, skipped, and error.
- Only `pass` satisfies a required validation gate unless policy explicitly says otherwise.
- Git mutations are preconditioned on expected refs and recorded afterward.
- Cleanup verifies containment before deleting a branch or worktree.
- Reports are projections of state, never independent state stores.

## 10. Terminology

| Term            | Definition                                                                                |
| --------------- | ----------------------------------------------------------------------------------------- |
| Campaign        | One bounded multi-task development effort                                                 |
| Run             | One execution of a campaign plan against a specific configuration and repository snapshot |
| Skill Loop      | The complete discover-to-archive lifecycle                                                |
| Work item       | A planned unit of development with acceptance criteria                                    |
| Lane            | A configurable integration path with risk and promotion policy                            |
| Assignment      | The immutable worker-facing contract for one execution attempt                            |
| Worker          | An AI engine session or guided human process executing an assignment                      |
| Adapter         | Provider-specific implementation of a capability contract                                 |
| Lease           | Time-bounded exclusive permission to execute a work item                                  |
| Ownership scope | Allowed and forbidden repository path globs                                               |
| Evidence        | Structured output supporting a state transition or policy decision                        |
| Promotion       | Moving reviewed work to a higher-trust integration target                                 |
| Reconciliation  | Comparing actual Git/SCM state with recorded campaign state                               |
| Policy pack     | Repository or domain-specific action and safety rules                                     |

## 11. Governance Principles

- Public behavior is specified before it is automated.
- Backward compatibility applies to configuration schemas, event schemas, and adapter contracts once declared stable.
- Security-sensitive behavior requires tests and documented rollback.
- Provider-specific features may extend capabilities but must not alter core invariants.
- Breaking decisions require an architecture decision record and migration guidance.
