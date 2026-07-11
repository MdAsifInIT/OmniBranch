# OmniBranch Skill Loop Specification

## 1. Status of This Document

This document is normative. The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

## 2. Scope

The Skill Loop defines how OmniBranch plans, leases, executes, validates, retries, cancels, and reconciles discrete work items inside a directed acyclic graph (DAG). The loop applies equally to local commands, SCM operations, CI jobs, approval waits, and optional AI-assisted advisory stages once they have been normalized into runtime work items.

## 3. Terms

- `Run`: a named execution instance derived from a configuration and a plan.
- `Work Item`: a single schedulable node in the DAG.
- `Attempt`: one concrete execution try for a work item.
- `Lease`: a time-bounded right for one worker to progress one attempt.
- `Ownership Lock`: an exclusive claim over a branch, worktree, path scope, lane, or other protected resource.
- `Worker`: a process authorized to execute leased work.
- `Approval`: an explicit operator or policy decision required to continue.
- `Projection`: a materialized state view derived from events.
- `Reconciliation`: the repair pass that aligns projections and external resources with persisted events.

## 4. Design Goals

The Skill Loop MUST provide:

- deterministic scheduling from the same state snapshot
- exactly-once state transitions for a single successful attempt
- at-least-once execution tolerance through idempotent work definitions
- safe crash recovery
- auditable approvals and policy decisions
- bounded retries with explicit retryability rules

## 5. Work Item Model

Every work item MUST define:

- stable `workItemId`
- stable `runId`
- `kind`
- dependency set
- ownership scope
- requested capabilities
- retry policy
- timeout policy
- idempotency key inputs
- expected output contract

Optional fields MAY include human-readable summary, advisory provenance, report annotations, and approval metadata.

## 6. Lifecycle States

### 6.1 Canonical states

A work item MUST move through the following canonical states:

1. `planned`
2. `waiting_dependencies`
3. `ready`
4. `awaiting_approval`
5. `leasing`
6. `leased`
7. `running`
8. `validating`
9. `retry_backoff`
10. `succeeded`
11. `failed`
12. `canceled`

An implementation MAY represent additional internal substates, but they MUST collapse to the canonical states above for reporting and replay.

### 6.2 State transition rules

The allowed transitions are:

- `planned -> waiting_dependencies`
- `waiting_dependencies -> ready`
- `ready -> awaiting_approval`
- `ready -> leasing`
- `awaiting_approval -> ready`
- `awaiting_approval -> canceled`
- `leasing -> leased`
- `leased -> running`
- `running -> validating`
- `running -> retry_backoff`
- `running -> failed`
- `running -> canceled`
- `validating -> succeeded`
- `validating -> retry_backoff`
- `validating -> failed`
- `retry_backoff -> ready`
- any nonterminal state -> canceled when cancellation is accepted

Any transition not listed above MUST be rejected and recorded as an invariant violation.

## 7. Global Invariants

The following invariants are REQUIRED:

- A work item MUST have at most one active lease at a time.
- A single ownership resource MUST have at most one active exclusive lock unless the lock mode is explicitly shared.
- A work item in `running` MUST have a valid unexpired lease.
- A work item in `succeeded`, `failed`, or `canceled` MUST be terminal and MUST NOT return to a nonterminal state.
- Dependency completion MUST be evaluated against terminal dependency states only.
- A work item MUST NOT execute if any required approval is absent, rejected, or expired.
- Event sequence numbers MUST be strictly ordered within a stream.
- Projection rebuild MUST reproduce the same canonical state from the same event log.

## 8. DAG Scheduling

### 8.1 Readiness

A work item becomes `ready` only when:

- all required dependencies are `succeeded`, or
- the dependency edge explicitly allows a non-success outcome and the configured condition is satisfied

If any hard dependency reaches `failed` or `canceled`, dependent nodes MUST be marked unschedulable and the run policy MUST decide whether the broader run fails fast or continues with unaffected branches.

### 8.2 Selection

The scheduler MUST evaluate ready work using a deterministic ordering function. The ordering function SHOULD be configurable, but it MUST be stable for the same input snapshot. Common sort keys MAY include:

- lane priority
- explicit work item priority
- run creation order
- topological depth
- retry attempt number

### 8.3 Capacity controls

The scheduler MUST respect:

- global concurrency
- per-lane concurrency
- per-adapter concurrency
- resource lock exclusivity
- worktree slot limits
- backoff windows

## 9. Work Leases

### 9.1 Lease acquisition

Before execution, a worker MUST acquire:

- the work item lease
- all required ownership locks
- any required worktree or branch reservations

Lease acquisition MUST be atomic with respect to conflicting claims, or it MUST fail without partial ownership that would block other work.

### 9.2 Lease contents

A lease record MUST include:

- lease identifier
- work item identifier
- worker identifier
- issue time
- expiry time
- heartbeat deadline
- attempt number
- lock references

### 9.3 Heartbeats and expiry

Workers executing non-instant work MUST heartbeat before the heartbeat deadline. If heartbeats stop and the lease expires:

- the work item MUST be considered orphaned
- the worker MUST lose authority to commit further state transitions
- reconciliation MAY requeue the work item if the attempt is retryable

## 10. Ownership Locks

Ownership locks protect shared resources such as:

- path globs
- branch names or branch prefixes
- worktree directories
- integration lanes
- report output targets

Locks MUST be derived from normalized ownership scope data. A worker MUST NOT widen a lock at runtime without returning to policy evaluation and acquisition.

Shared locks MAY be supported for read-only operations, but exclusive and shared modes MUST have explicit compatibility rules.

## 11. Execution and Validation

### 11.1 Execution phase

While in `running`, the worker MAY perform adapter calls, command execution, branch operations, or advisory AI calls permitted by policy. All external side effects SHOULD be correlated with the current attempt identifier.

### 11.2 Validation phase

After primary execution, required validators MUST run before terminal success is recorded. A work item MUST NOT enter `succeeded` until required validators pass or are explicitly waived by policy with a recorded reason.

## 12. Retries

### 12.1 Retry classification

Errors MUST be classified as:

- `retryable`
- `non_retryable`
- `policy_blocked`
- `approval_blocked`

Only `retryable` failures MAY enter `retry_backoff`.

### 12.2 Retry budget

Each work item MUST have a bounded retry budget. Once the retry budget is exhausted, the next failed attempt MUST transition to `failed`.

### 12.3 Backoff

Backoff duration MUST be deterministic from configuration, attempt number, and optional jitter rules. If jitter is supported, it MUST be reproducible from a stable seed recorded in state so that replay remains explainable.

## 13. Cancellation

Cancellation MAY be requested by:

- operator action
- policy action
- run-level failure propagation
- shutdown reconciliation

Cancellation semantics are:

- a not-yet-leased item transitions directly to `canceled`
- a leased or running item receives a cancellation request event and SHOULD attempt graceful stop
- once cancellation is acknowledged or lease authority ends, the item MUST transition to `canceled` unless policy requires retry or explicit failure instead

Cancellation MUST release locks and leases during finalization or reconciliation.

## 14. Approvals

Approvals MUST be first-class records with:

- approval identifier
- target run or work item
- requested action
- requester identity
- required approver class or explicit approvers
- creation time
- expiry time, if any
- decision and reason

An approval-granted event MUST reference the exact target and decision scope. Reusing a stale approval for a materially different action MUST be prohibited.

## 15. Crash Recovery

### 15.1 Startup recovery

On startup, the runtime MUST:

1. reload configuration
2. restore projections from checkpoints and events
3. inspect active leases
4. inspect ownership locks
5. inspect live worktrees and branch markers
6. reconcile orphans and stale reservations
7. re-enter scheduling

### 15.2 Orphan handling

If a worker crashed after performing side effects but before recording completion, reconciliation MUST prefer evidence-backed recovery over blind retry. Examples include:

- command artifact already present and checksum-valid
- branch already created with expected metadata
- CI job already completed with matching correlation identifier

If success cannot be proven, the system MAY retry only if the work item is declared idempotent or compensatable.

## 16. Reconciliation

Reconciliation is a deterministic maintenance loop that MUST:

- expire stale leases
- release or repair stale locks
- detect missing worktrees
- detect unmanaged worktrees belonging to terminated runs
- rebuild projections when drift is detected
- requeue eligible orphaned work
- emit audit events for every repair decision

Reconciliation MUST NOT fabricate terminal success without deterministic evidence.

## 17. Idempotency

Every side-effecting work item MUST define an idempotency strategy. Acceptable patterns include:

- provider-native idempotency keys
- content-addressed output directories
- branch names derived from stable identifiers
- correlation metadata recorded in commit messages or CI payloads
- preflight existence checks with exact match validation

The idempotency key SHOULD combine stable inputs such as `runId`, `workItemId`, normalized action kind, and configuration version. Attempt number MAY be included only when the target system requires unique retries and the work item is compensatable.

## 18. Policy Interactions

Policy evaluation MUST occur before:

- acquiring locks for sensitive resources
- invoking side-effecting adapters
- applying retry escalation
- bypassing failed validation
- using approvals to continue execution

Policy decisions MUST be persisted as structured events with decision, reason code, and relevant inputs.

## 19. Observability

When telemetry is explicitly enabled, the loop SHOULD emit structured metrics for:

- state transitions
- queue length
- lease latency
- lock contention
- retry counts
- approval wait time
- validation duration
- reconciliation actions

Telemetry MUST default to disabled, MUST be additive, and MUST NOT replace the authoritative event log.

## 20. Conformance Requirements

An implementation conforms to this specification only if it can demonstrate:

- invalid transitions are rejected
- lease exclusivity is enforced
- stale lease recovery works after worker termination
- retries obey configured budgets
- approval gates prevent unauthorized execution
- projection rebuild yields the same canonical states
- idempotent work can be safely retried after crash scenarios
