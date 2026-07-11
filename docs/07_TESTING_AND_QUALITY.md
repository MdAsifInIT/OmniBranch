# Testing and Quality

This document defines the quality bar for OmniBranch. The test strategy is layered so fast unit checks protect the core model while integration, concurrency, crash recovery, and OS matrix tests validate the behavior that matters in real repositories.

## Quality Principles

- Test the domain model first, then the CLI, then provider integrations.
- Prefer deterministic fixtures over live network dependencies.
- Treat adapter boundaries as contracts, not implementation details.
- Make failure modes explicit and assert on them.
- Keep release gates conservative until the repository has repeated green runs on representative machines.

## Test Layers

### 1. Unit tests

Use unit tests for:

- state transition acceptance and rejection;
- policy decisions and approval expiry;
- DAG readiness and deterministic queue ordering;
- ownership overlap and path normalization;
- lease acquisition, heartbeat, expiry, and supersession;
- event and evidence serialization;
- adapter result normalization;
- CLI argument parsing and exit-code mapping.

Unit tests should run quickly and cover the majority of branch logic.

### 2. Property tests

Use property-based testing for:

- acyclic dependency graph scheduling;
- projection replay equivalence;
- plan and reconciliation idempotence;
- lock exclusivity under arbitrary ownership globs;
- stable error normalization;
- event and configuration round trips;
- merge-safe branch selection.

Property tests should explore randomized inputs from fixtures and generated data to catch hidden assumptions.

### 3. Integration tests

Use integration tests for:

- real Git repository and worktree creation;
- default-branch and common-Git-directory discovery;
- event append plus SQLite projection rebuild;
- fixture setup and teardown;
- CLI commands against temporary repositories;
- adapter registration and capability probing;
- dry-run planning and policy explanations;
- configuration structural and semantic validation.

Integration tests should exercise the real filesystem and Git executable behavior where practical.

### 4. Concurrency tests

Use concurrency tests for:

- Parallel branch operations
- Simultaneous repository scans
- Competing lock acquisition
- Queued write operations
- Concurrent CLI invocations against the same workspace

These tests should prove the tool does not corrupt state when two workers operate at once.

### 5. Crash recovery tests

Use crash recovery tests for:

- interruption before and after every Git mutation;
- interrupted event append and projection commit;
- stale leases and orphaned worktrees;
- workers that changed files but did not report completion;
- remote side effects completed before local acknowledgement;
- resume after validation or reporting failure.

The goal is to prove that a partially completed operation can be detected and recovered safely.

### 6. Security tests

Use security tests for:

- Secret redaction
- Token leakage prevention
- Path traversal defenses
- Injection-safe command handling
- Least-privilege configuration checks
- Sensitive log scanning

Security tests should fail the build if credentials or repository contents appear in logs or artifacts.

### 7. Adapter contract tests

Use adapter contract tests to validate that every adapter implements the same observable behavior:

- version and capability discovery;
- assignment preparation;
- launch and supervision;
- structured completion, partial, blocked, failed, and cancelled results;
- resume classification;
- cancellation semantics;
- guided-mode fallback;
- authentication and permission failure mapping.

Contract tests should run against the fixture adapter first and then against each live provider adapter.

### 8. Golden tests

Use golden tests for:

- CLI help text
- Human-readable tables
- JSON output
- Error messages
- Plan summaries

Golden files should change intentionally and sparingly. Review every diff for regressions in wording or structure.

### 9. End-to-end tests

Use E2E tests for:

- `init`
- `doctor`
- `config validate`
- `campaign create`
- `plan`
- `run`
- `status`
- `resume`
- `validate`
- `review`
- `promote`
- `reconcile`
- `cleanup`
- `report`
- GitHub sandbox draft-PR creation.

Run E2E tests only after the lower-level suite is green.

## OS Matrix

At minimum, validate these environments:

- Windows
- macOS
- Linux

Recommended matrix coverage:

- Windows with PowerShell
- Windows with Git Bash if shell scripts are supported
- macOS with `zsh`
- Linux with `bash`

The OS matrix should cover:

- Path handling
- File locking
- Line endings
- Process spawning
- Permission differences
- Shell quoting
- symlinks, junctions, and path canonicalization
- process cancellation and file-lock behavior

## Release Gates

Do not ship a release unless all required gates pass:

- TypeScript type check
- Unit tests
- Property tests
- Integration tests
- Adapter contract tests
- Golden tests
- E2E tests
- Security checks
- OS matrix coverage
- Crash recovery spot check
- Configuration and event schema compatibility
- Dependency and secret scan
- Skill validation and forward-test evidence

If any gate fails, the release stays blocked until the failure is triaged and documented.

## Recommended Test Order

1. Lint and type check.
2. Run unit tests.
3. Run property tests.
4. Run integration tests with local fixtures.
5. Run adapter contract tests.
6. Run golden tests.
7. Run concurrency and crash recovery tests.
8. Run E2E tests.
9. Run security and hostile-repository tests.
10. Run OS matrix jobs.

## Coverage Expectations

Aim for coverage where it matters:

- High coverage for core plan logic and error mapping.
- Strong fixture coverage for adapter behavior.
- Targeted coverage for CLI parsing and output.
- Explicit assertions on concurrency and recovery states.

Coverage percentage alone is not a release criterion. A feature with low line coverage may still be acceptable if it has robust integration and contract coverage.

## Failure Triage

When a test fails:

- Classify it as a product bug, fixture bug, adapter bug, or test bug.
- Re-run only the minimal relevant scope after a fix.
- Preserve failing fixture inputs when they capture a real regression.
- Update the golden file only if the new output is intentionally correct.

## Local Quality Checklist

Before opening a pull request, confirm:

- The repo installs and builds locally.
- The CLI mock vertical slice works against at least one temporary fixture repo.
- New behavior has tests at the correct layer.
- Logs do not leak secrets.
- OS-sensitive behavior has been checked on at least one representative platform.
- Required unavailable validation does not report pass.
- Mutating tests use local or explicitly approved sandbox resources.

## Quality Exit Criteria

The quality system is ready for a release branch when:

- The test suite is deterministic on repeated runs.
- Fixture-based integration covers the primary command paths.
- Concurrency and crash recovery failures are understood and fixed.
- Adapter contract tests are mandatory for every provider.
- The release gates are written down and followed consistently.
