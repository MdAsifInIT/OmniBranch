# Requirements: OmniBranch

**Defined:** 2026-07-12
**Core Value:** Repository correctness remains deterministic, auditable, and resumable while multiple workers operate concurrently.

## v1 Requirements

### Foundation and Configuration

- [x] **BASE-01**: A clean checkout installs, formats, lints, type-checks, tests, and builds with a pinned toolchain.
- [x] **CONF-01**: Users can initialize an unsupported Git repository idempotently without unexpected source changes.
- [x] **CONF-02**: Users receive exact structural and semantic diagnostics for invalid WorkspacePlan YAML.
- [x] **CONF-03**: Repository root, common Git directory, trunk, remotes, and worktrees are discovered safely.

### State and Git

- [x] **STATE-01**: Events append atomically with global ordering, stream concurrency, duplicate rejection, and no secrets.
- [x] **STATE-02**: Deleting SQLite and replaying JSONL reproduces identical canonical projections.
- [x] **GIT-01**: Branch and worktree mutations use expected-ref preconditions and are safe to retry after interruption.
- [x] **GIT-02**: Cleanup refuses dirty, uncontained, or unrelated work.

### Orchestration and Safety

- [x] **ORCH-01**: DAG scheduling is deterministic and respects dependencies and capacity limits.
- [x] **ORCH-02**: Conflicting ownership scopes never receive simultaneous write leases.
- [x] **ORCH-03**: Leases heartbeat, expire, supersede stale actors, and recover orphaned work safely.
- [x] **SAFE-01**: Unknown, destructive, secret, and external mutation actions fail closed or require explicit approval.
- [x] **VAL-01**: Required validation passes only on explicit `pass`; unavailable or malformed evidence blocks promotion.

### Execution and Interfaces

- [x] **CLI-01**: Every documented CLI command provides stable JSON output and mutations support `--dry-run`.
- [x] **MOCK-01**: Two disjoint mock workers complete concurrently in isolated worktrees and resume after every mutation boundary.
- [x] **SCM-01**: GitHub reads and dry-run writes work offline against fakes; approved sandbox writes are idempotent.
- [ ] **AI-01**: Codex and Claude implement the common adapter contract; unsupported capability downgrades safely.
- [ ] **AI-02**: OpenCode and Antigravity preserve assignment identity and evidence through execution or guided handoff.
- [ ] **SKILL-01**: The canonical OmniBranch skill validates, remains under 500 lines, and supports an independent safe fixture run.

### Quality and Release

- [ ] **QUAL-01**: Unit, property, integration, concurrency, recovery, security, contract, golden, and E2E suites pass offline.
- [ ] **QUAL-02**: Windows, macOS, and Linux CI pass on Node 22.
- [ ] **REL-01**: Installation, upgrade, rollback, SBOM, checksums, provenance, compatibility, and limitations are documented and automated without publishing.

## v2 Requirements

- **SCM-02**: Add GitLab, Bitbucket, and Azure DevOps providers.
- **TEAM-01**: Add optional remote state synchronization and multi-operator coordination.
- **UI-01**: Add a read-focused campaign dashboard.
- **DAEMON-01**: Add explicit scheduled resume and bounded background operation.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Production deployment agent | Violates the bounded local-first 0.1 safety posture |
| Automatic stable-branch promotion | Requires explicit human and policy approval |
| Unrestricted destructive Git | Data-loss risk; denied by design |
| Hosted control plane | Core functionality must work locally |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BASE-01, CONF-01, CONF-02, CONF-03 | Phase 1 | Complete |
| STATE-01, STATE-02, GIT-01, GIT-02 | Phase 2 | Complete |
| ORCH-01, ORCH-02, ORCH-03, SAFE-01, VAL-01 | Phase 3 | Complete |
| CLI-01, MOCK-01 | Phase 4 | Complete |
| SCM-01 | Phase 5 | Complete |
| AI-01, AI-02, SKILL-01 | Phase 6 | Pending |
| QUAL-01, QUAL-02, REL-01 | Phase 7 | Pending |

**Coverage:** 21 v1 requirements, 21 mapped, 0 unmapped.

---
*Requirements defined: 2026-07-12*
