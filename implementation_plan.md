# Implementation Plan — OmniBranch Resilience & Expansion

> **Source:** [ARCHITECTURAL_ANALYSIS.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/ARCHITECTURAL_ANALYSIS.md)  
> **Target Version:** 0.3.0  
> **Baseline:** OmniBranch v0.2.1  

> [!IMPORTANT]
> This plan implements mitigations M-1 through M-10 from the architectural analysis, addresses all 12 edge cases and 8 failure points, then extends the system with intelligent scheduling and observability. Each phase gates on verification before proceeding.

---

## Scope

28 work items across 5 phases, touching 10 source files and creating 8 new files. All changes maintain backward compatibility with existing `WorkspacePlan` schemas and event formats.

### Affected Packages

| Package | Files Modified | Files Created |
|---|---|---|
| `@omnibranch/platform` | [index.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/platform/src/index.ts) | `index.test.ts` |
| `@omnibranch/runtime` | [orchestration.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/orchestration.ts), [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts), [config.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/config.ts), [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts), [task-history.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/task-history.ts), [documentation.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/documentation.ts) | `telemetry.ts`, `semantic-cache.ts` |
| `@omnibranch/adapters` | [github.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/adapters/src/github.ts), [engines.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/adapters/src/engines.ts) | — |
| `@omnibranch/contracts` | [index.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/contracts/src/index.ts) | — |
| `apps/cli` | [main.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/apps/cli/src/main.ts) | — |
| Docs | Multiple | `OBSERVABILITY.md`, ADRs |
| Schemas | [workspace-plan.schema.json](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/schemas/workspace-plan.schema.json) | — |

---

## Phase 1: Resilience Hardening

> **Duration:** ~2 weeks  
> **Analysis References:** EC-1, EC-2, EC-3, EC-4, EC-5, EC-12, FP-1, FP-2, FP-3, FP-5, FP-6, FP-7  
> **Mitigations:** M-1, M-2, M-3, M-5, M-6, M-7, M-9

### 1.1 — Compare-and-Swap FileMutex

**Analysis ref:** FP-2 (TOCTOU race), EC-1 (stale lock race), Mitigation M-2  

**What:** Replace the `unlink → openSync('wx')` stale lock recovery in `FileMutex.acquire()` with atomic `rename`-based replacement. Add a nonce field to lock content for ownership verification in `release()`.

**Files:**
- [MODIFY] [index.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/platform/src/index.ts) — `FileMutex` class

**Approach:**
1. When a stale lock is detected, create a new lock file at `lockPath.${pid}.${Date.now()}`
2. Write new lock content (with `crypto.randomUUID()` nonce) to temp file
3. Use `fs.renameSync(tmp, lockPath)` to atomically replace (POSIX + NTFS atomic)
4. Store nonce on instance; `release()` only unlinks if nonce matches file content
5. Add jitter to retry sleep to reduce contention: `100 + Math.random() * 100ms`

**Verification:**
- New test: concurrent `FileMutex.acquire()` stress test with 10 parallel processes
- Existing tests must continue passing

**Docs to update:** Add [ADR-0012](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/adr/) for CAS FileMutex decision

---

### 1.2 — Dependency Cycle Detection

**Analysis ref:** FP-3 (permanent deadlock), EC-5 (cycle → hang), Mitigation M-3  

**What:** Add cycle detection via Kahn's algorithm to `validateSemantics()` in config loading. Reject plans with circular `dependsOn` chains at validation time instead of silently deadlocking at runtime.

**Files:**
- [MODIFY] [config.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/config.ts) — add `detectDependencyCycles()` function, call from `validateSemantics()`

**Approach:**
1. Build adjacency list from `tasks[].dependsOn` references
2. Run Kahn's topological sort — if sorted count < task count, cycle exists
3. Identify participating task IDs and include them in `ConfigValidationError`
4. No changes to `DeterministicScheduler` — the scheduler's existing `validateDag()` already handles DAG validation at runtime; this adds an earlier fail-fast at config load

**Verification:**
```bash
pnpm test:unit -- --filter config
```
- New fixture: `fixtures/plans/cyclic-plan.yaml` with A→B→C→A dependency
- Test that `loadWorkspacePlan('fixtures/plans/cyclic-plan.yaml')` throws `ConfigValidationError` with cycle details

**Docs to update:** [CONFIGURATION.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/CONFIGURATION.md) — add note about cycle detection, [03_CONFIGURATION_REFERENCE.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/03_CONFIGURATION_REFERENCE.md) — document the constraint

---

### 1.3 — JSONL Truncation Recovery

**Analysis ref:** EC-3 (truncated line on crash), FP-1 (event store reliability), Mitigation M-9  

**What:** Make `JsonlEventStore.readAll()` tolerant of truncated last lines. Back up corrupt files and repair by dropping the incomplete line.

**Files:**
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — `JsonlEventStore.readAll()` and `readFrom()`

**Approach:**
1. Wrap each `JSON.parse(line)` in try/catch
2. If the last line fails to parse (truncated write), skip it, back up original to `events.jsonl.corrupt.<timestamp>`, write repaired file
3. If a non-last line fails to parse, throw `EventStoreError` with `CORRUPT_EVENT_LINE` code — requires manual intervention
4. Log a warning via `pino` for recovered events

**Verification:**
- New test: write a valid JSONL file, append a truncated line, call `readAll()`, verify recovery
- New test: corrupt a middle line, verify throw with `CORRUPT_EVENT_LINE`

---

### 1.4 — Indexed Event Store Reads

**Analysis ref:** FP-1 (O(n) read bottleneck), EC-2 (scan degradation), Mitigation M-1  

**What:** Add byte-offset checkpoint tracking to `JsonlEventStore` so `readFrom()` seeks to the last known position instead of reading from byte 0.

**Files:**
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — `JsonlEventStore`

**Approach:**
1. Add private `checkpoint: { lastSequence: number; byteOffset: number }` field
2. In `readFrom()`, if `afterSequence >= checkpoint.lastSequence`, open file and read from `checkpoint.byteOffset` using `fs.readSync` with offset
3. Fast path: if `stat.size === checkpoint.byteOffset`, return empty (no new data) — O(1)
4. Update checkpoint after each successful read
5. If requesting events before checkpoint, fall back to full read (backward compatibility)

**Verification:**
- New benchmark test: create 10,000 events, measure `readFrom()` latency before/after
- Existing integration tests must pass unchanged

---

### 1.5 — Mutex-Guarded History/Documentation Writes

**Analysis ref:** FP-5 (documentation clobber), EC-4 (read-modify-write race), Mitigation M-5  

**What:** Wrap `TaskHistoryService.append()` and `ProjectDocumentationService.generate()` in `FileMutex` acquisition to prevent concurrent completions from clobbering each other's writes.

**Files:**
- [MODIFY] [task-history.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/task-history.ts) — add mutex parameter, wrap append
- [MODIFY] [documentation.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/documentation.ts) — add mutex parameter, wrap generate
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — pass mutex to services

**Approach:**
1. Add `FileMutex` constructor parameter to both services
2. In `append()` / `generate()`, call `mutex.acquire(10_000)` before read, `mutex.release()` in finally
3. Campaign service creates a shared `history-docs.lock` mutex and passes it to both services
4. Use a 10s timeout — these writes are fast; anything longer indicates deadlock

**Verification:**
- Existing history/documentation tests pass
- New test: simulate two concurrent `append()` calls, verify both entries present

---

### 1.6 — Applied Events Table Compaction

**Analysis ref:** FP-6 (unbounded table growth), Mitigation M-6  

**What:** Add `compact()` method to `SqliteProjectionStore` that deletes old `applied_events` rows and runs incremental vacuum. Invoke after campaign completion.

**Files:**
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — `SqliteProjectionStore` add `compact(retainAfterSequence)`
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — call compaction in finalization

**Approach:**
1. `compact(n)` → `DELETE FROM applied_events WHERE sequence < n`
2. Update `projection_meta` with `compacted_through` key
3. Run `PRAGMA incremental_vacuum` to reclaim disk space
4. In campaign finalization: compact if `lastAppliedSequence > 1000`, retaining last 100 events
5. The compaction is non-destructive — the JSONL event store remains the authoritative record

**Verification:**
- New test: insert 2000 applied events, compact, verify table size reduced
- Verify that post-compaction projection rebuild still works (events come from JSONL, not applied_events)

---

### 1.7 — YAML Alias Bomb Protection

**Analysis ref:** EC-12 (YAML alias expansion bomb)  

**What:** Configure the `yaml` parser with `maxAliasCount` limit to prevent exponential expansion from malicious anchor chains.

**Files:**
- [MODIFY] [config.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/config.ts) — add `maxAliasCount` to `yaml.parse()` options

**Approach:**
1. Set `yaml.parse(content, { maxAliasCount: 1000 })` — generous enough for legitimate use, blocks exponential expansion
2. The `yaml` library throws when the limit is exceeded
3. Catch and wrap in `ConfigValidationError` with a clear message

**Verification:**
- New fixture: `fixtures/plans/alias-bomb.yaml` with nested aliases
- Test that loading it throws `ConfigValidationError` mentioning alias limit

---

### 1.8 — Graceful Shutdown with Child Process Cleanup

**Analysis ref:** FP-7 (adapter process orphaning), Mitigation M-7  

**What:** Register SIGTERM/SIGINT handlers in `LocalCampaignService` that terminate active child processes, release locks, and close stores before exit.

**Files:**
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — add `activeChildPids` tracking, register shutdown handler

**Approach:**
1. Track `AdapterRunHandle.processId` in a `Set<number>` on the campaign service
2. On SIGTERM/SIGINT: send SIGTERM to all tracked PIDs, wait 5s, SIGKILL survivors
3. Release campaign lock and git lock
4. Close event store and projection store
5. Exit with appropriate code (143 for SIGTERM, 130 for SIGINT)
6. Persist active PIDs to `.omnibranch/active-pids.json` so `CampaignCleanupService.reconcile()` can terminate orphans on next startup

**Verification:**
- Manual test: start a campaign with mock adapter, send SIGINT, verify clean exit and lock release
- Verify no orphan `.lock` files remain after interrupted run

---

### Phase 1 Gate

```bash
pnpm verify   # format, build, docs, lint, typecheck, test
```

All existing tests pass + new tests for each item above.

---

## Phase 2: Adapter Resilience

> **Duration:** ~1.5 weeks  
> **Analysis References:** EC-6, EC-9, EC-10, EC-11, FP-4, FP-8  
> **Mitigations:** M-4, M-8, M-10

### 2.1 — GitHub Adapter Retry with Backoff

**Analysis ref:** FP-4 (429 rate limit without retry), Mitigation M-4  

**What:** Add `withRetry()` method to `GitHubScmAdapter` that retries on HTTP 429 (rate limited) and 5xx (server error) with exponential backoff and Retry-After header parsing.

**Files:**
- [MODIFY] [github.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/adapters/src/github.ts) — add `withRetry` private method, wrap mutation methods

**Approach:**
1. Add private `withRetry<T>(fn, { maxAttempts: 3, context: string })` method
2. Catch `GitHubAdapterError`, check code: `rate_limited` → parse `Retry-After` header for delay, fallback to `1000 * 2^attempt`; `server_error` → fixed `2000 * 2^attempt`
3. Wrap `probe()`, `createPullRequest()`, `mergePullRequest()`, `getStatus()` in `withRetry`
4. Non-retryable errors (`authentication`, `permission_denied`, `validation_failed`) propagate immediately

**Verification:**
- New contract test: mock Octokit to return 429 on first call, 200 on second → verify retry succeeds
- New contract test: mock 3 consecutive 429s → verify final error propagation
- Existing contract tests pass unchanged

---

### 2.2 — Validation Command Sandboxing

**Analysis ref:** FP-8 (validation side effects), EC-11 (env override attack), Mitigation M-8  

**What:** Strip sensitive environment variables and block dangerous overrides before executing validation commands.

**Files:**
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — add `buildValidationEnv()` helper, use in validation execution

**Approach:**
1. Define `STRIPPED_ENV_VARS` set: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`
2. Define `BLOCKED_ENV_OVERRIDES` set: `PATH`, `HOME`, `USER`, `SHELL`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`
3. Build validation env: clone `process.env`, strip sensitive vars, apply command env with blocked key check
4. If a command env attempts to override a blocked key, throw `ConfigValidationError`
5. Validation commands already run via `ProcessRunner` with `shell: false` — this adds env hardening

**Verification:**
- New security test: validation command with `env.PATH` override → verify rejection
- New security test: verify `GITHUB_TOKEN` is not present in validation command env
- Existing validation tests pass unchanged

---

### 2.3 — Policy Condition DSL Enhancement

**Analysis ref:** EC-9 (shallow matching), EC-10 (untyped conditions), Mitigation M-10  

**What:** Upgrade `DeterministicPolicyEngine` condition matching from strict equality to support glob patterns (for strings) and array inclusion (for enum values).

**Files:**
- [MODIFY] [orchestration.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/orchestration.ts) — modify condition matching in `evaluate()`

**Approach:**
1. For string pattern with `*` or `?` → use `picomatch` (already a dependency) for glob matching
2. For array pattern → check if action value is included in the array
3. For all other types → strict equality (backward compatible)
4. This enables rules like `when: { path: "*.config.*" }` and `when: { class: ["git_read", "git_write_safe"] }`

**Verification:**
- New unit test: glob pattern matching in policy rules
- New unit test: array-based matching
- Existing policy tests pass (strict equality is a subset of glob matching)

**Docs to update:** [05_SECURITY_AND_POLICY.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/05_SECURITY_AND_POLICY.md) — document new matching capabilities

---

### 2.4 — Adapter Probe Resilience

**Analysis ref:** EC-6 (adapter probe false negative)  

**What:** Make adapter probes more resilient by treating non-zero exit codes from `--version` as potentially valid (the engine exists but may need configuration). Add a fallback `which`/`where` check.

**Files:**
- [MODIFY] [engines.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/adapters/src/engines.ts) — enhance `probe()` logic

**Approach:**
1. If `--version` returns non-zero but the executable exists (no ENOENT), report `{ available: true, version: 'unknown', diagnostics: [{ message: 'CLI returned non-zero from version check; may need configuration' }] }`
2. Only report `{ available: false }` on ENOENT (binary not found)
3. Add a `severity` field to diagnostics: `'warning'` vs `'error'`
4. Preflight service shows warnings but doesn't block on them

**Verification:**
- New contract test: mock `--version` returning exit code 1 → verify `available: true` with warning
- New contract test: mock ENOENT → verify `available: false`

---

### Phase 2 Gate

```bash
pnpm verify
pnpm test:security
```

---

## Phase 3: Observability & Testing

> **Duration:** ~2 weeks  
> **Analysis References:** Test coverage gap matrix from architectural analysis appendix

### 3.1 — Platform Package Test Suite

**What:** Create comprehensive tests for `@omnibranch/platform` — currently has zero test files despite being the foundational utilities package.

**Files:**
- [NEW] `packages/platform/src/index.test.ts`

**Coverage targets:**
- `FileMutex`: acquisition, release, stale detection, contention (new CAS behavior from 1.1)
- `atomicWrite`: normal write, crash between write and rename (simulate with tmp file inspection), directory sync failure on Windows
- `isPathInside` / `canonicalPathInside`: symlink traversal, `..` segments, absolute paths, Windows drive letters
- `ExecaProcessRunner`: timeout, NUL byte rejection, exit code handling, signal propagation
- `redact`: GitHub tokens, OpenAI keys, Anthropic keys, Bearer tokens, custom secrets
- `stableHash`: determinism, collision resistance

**Verification:**
```bash
pnpm test:unit -- --filter platform
```
Target: 80% line coverage for `platform/src/index.ts`

---

### 3.2 — Concurrency Stress Tests

**What:** Add integration tests that simulate concurrent campaign operations to validate FileMutex, event store, and projection store under contention.

**Files:**
- [NEW] `packages/runtime/src/concurrency.integration.test.ts`

**Tests:**
1. Two concurrent `JsonlEventStore.append()` calls — verify no data loss or corruption
2. Concurrent `SqliteProjectionStore.applyEvents()` — verify idempotency
3. Concurrent `FileMutex.acquire()` with stale lock — verify exactly one winner
4. Campaign lock prevents concurrent campaign execution — verify second campaign gets clear error

---

### 3.3 — Property-Based Tests with fast-check

**What:** Use `fast-check` (already a devDependency) for property-based testing of deterministic components.

**Files:**
- [NEW] `packages/runtime/src/orchestration.property.test.ts`

**Properties to test:**
1. `DeterministicScheduler.selectReady()` is deterministic: same inputs → same outputs, always
2. `deterministicBackoff` with same seed and attempt → same value, always
3. `LeaseManager.acquire()` with non-overlapping paths → always succeeds
4. `LeaseManager.acquire()` with overlapping exclusive paths → always throws `InvariantViolation`
5. `validateDag()` detects all cycles in arbitrary graphs

---

### 3.4 — Schema Migration Versioning

**What:** Add a `schema_migrations` table to `SqliteProjectionStore` to support future schema changes without manual intervention.

**Files:**
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — add migration system

**Approach:**
1. Create `schema_migrations` table: `version INTEGER PRIMARY KEY, applied_at TEXT, description TEXT`
2. Define migrations array: `[{ version: 1, description: 'Initial schema', sql: EXISTING_SCHEMA }]`
3. On store open: check applied versions, run unapplied migrations in transaction
4. Future schema changes append to the migrations array

**Docs to update:** [01_ARCHITECTURE.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/01_ARCHITECTURE.md) — document migration system

---

### 3.5 — CLI Test Expansion

**What:** Add tests for CLI command wiring, error formatting, and `--json` output mode. Currently only 1 test file exists for the CLI.

**Files:**
- [NEW] `apps/cli/src/commands.test.ts`

**Tests:**
1. `validate` command with valid plan → exit 0
2. `validate` command with invalid plan → exit 2, `ConfigValidationError`
3. `--json` output is valid `CliEnvelope` JSON
4. Error formatting maps all known error types to user-friendly messages
5. `status` command with no campaign → clear "no active campaign" message

---

### Phase 3 Gate

```bash
pnpm verify
pnpm test:unit -- --coverage
```
Target: 80%+ coverage on `platform` and `runtime` packages.

---

## Phase 4: Intelligent Features

> **Duration:** ~3 weeks  
> **Analysis References:** Strategic Expansion Plan sections 3.1–3.4

### 4.1 — Token Usage Tracking

**What:** Add token usage tracking to the projection store so API costs can be queried per task and per campaign.

**Files:**
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — add `token_usage` and `cost_usd` columns via migration
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — extract and persist token usage from adapter results
- [MODIFY] [index.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/contracts/src/index.ts) — add `TokenUsage` type to `AdapterResult`

**Approach:**
1. Add `TokenUsage` type: `{ inputTokens?: number, outputTokens?: number, estimatedCostUsd?: number }`
2. Schema migration v2: `ALTER TABLE work_items ADD COLUMN token_usage TEXT; ALTER TABLE work_items ADD COLUMN cost_usd REAL DEFAULT 0`
3. After `adapter.collect()`, extract token usage from `AdapterResult.metadata` if present
4. Persist to projection store
5. Add `omnibranch cost [--run-id]` CLI command to display aggregated costs

---

### 4.2 — Cost-Aware Model Routing

**What:** Extend the scheduler to consider model cost/capability when multiple adapters are available for a lane.

**Files:**
- [NEW] `packages/runtime/src/model-router.ts`
- [MODIFY] [orchestration.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/orchestration.ts) — integrate routing hints into scheduling

**Approach:**
1. Define `ModelProfile` with cost, context window, capabilities, and latency
2. `selectModel(task, models)` → filter by context window fit, match capabilities, sort by cost
3. Scheduler passes routing hint to adapter via `PreparedAssignment.modelHint`
4. Adapters use the hint if available, fallback to configured default

---

### 4.3 — Semantic Result Caching

**What:** Cache adapter results by task intent hash to skip redundant API calls for identical tasks across campaigns.

**Files:**
- [NEW] `packages/runtime/src/semantic-cache.ts`
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — schema migration for `semantic_cache` table
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — check cache before adapter launch

**Approach:**
1. Cache key = `stableHash(intent + context_hash + engine_name)`
2. Before launching adapter: check cache for matching key within TTL (default 24h)
3. On cache hit: replay cached diff patch via `git apply`
4. On cache miss: execute normally, store result + diff patch on success
5. Cache is opt-in via `WorkspacePlan.runtime.semanticCache: { enabled: boolean, ttlSeconds: number }`

---

### 4.4 — Token Budget Enforcement

**What:** Allow plans to specify maximum token/cost budgets. Pause campaign and require operator approval when budget is exceeded.

**Files:**
- [MODIFY] [index.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/contracts/src/index.ts) — add `TokenBudget` type to `RuntimeConfig`
- [MODIFY] [campaign.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/campaign.ts) — check budget before each adapter launch
- [MODIFY] [workspace-plan.schema.json](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/schemas/workspace-plan.schema.json) — add `tokenBudget` properties

**Approach:**
1. `TokenBudget`: `{ maxInputTokens?, maxOutputTokens?, maxCostUsd?, warnAtPercent? }`
2. Before each adapter launch: aggregate spent tokens from projection store
3. If `spent >= budget * warnAtPercent/100`: emit warning event
4. If `spent >= budget`: emit `campaign.budget_exceeded` event, pause campaign
5. Resume requires operator `omnibranch resume --approve-budget` flag

---

### 4.5 — Streaming Adapter Output

**What:** Switch adapter output collection from buffered to streaming for real-time progress visibility.

**Files:**
- [MODIFY] [engines.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/adapters/src/engines.ts) — use `execa` streaming API with bounded ring buffer

**Approach:**
1. Use `execa`'s `buffer: false` option for adapter processes
2. Pipe stdout to: (a) logger for real-time display, (b) bounded ring buffer (last 10MB) for final capture
3. Stream stderr similarly
4. The `AdapterRunHandle.isSettled()` check remains the same — streams close when process exits
5. Backward compatible: `AdapterResult.rawOutput` contains the buffered content

---

### Phase 4 Gate

```bash
pnpm verify
pnpm test:unit
pnpm test:integration
```

---

## Phase 5: Documentation & Governance

> **Duration:** ~1.5 weeks  
> **Analysis References:** All sections; Appendix test coverage gap matrix

### 5.1 — Update LIMITATIONS.md

**File:** [LIMITATIONS.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/LIMITATIONS.md)

**Changes:**
- Remove limitations addressed by Phase 1-4 (e.g., "no retry", "no budget enforcement")
- Add new limitations introduced by Phase 4 (e.g., "semantic cache does not handle non-deterministic intents")
- Update version references to 0.3.0

---

### 5.2 — Update Architecture Documentation

**Files:**
- [MODIFY] [ARCHITECTURE.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/ARCHITECTURE.md) — add sections on schema migrations, event store indexing, semantic caching
- [MODIFY] [01_ARCHITECTURE.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/01_ARCHITECTURE.md) — update component diagram with new modules

---

### 5.3 — Add New ADRs

**Files:**
- [NEW] `docs/adr/0012-cas-filemutex.md` — Documents the CAS approach for stale lock replacement
- [NEW] `docs/adr/0013-cycle-detection-at-config.md` — Documents early cycle detection vs runtime detection
- [NEW] `docs/adr/0014-schema-migration-versioning.md` — Documents SQLite migration system
- [NEW] `docs/adr/0015-semantic-caching.md` — Documents caching trade-offs and invalidation strategy

---

### 5.4 — Create OBSERVABILITY.md

**File:** [NEW] `docs/OBSERVABILITY.md`

**Contents:**
- Token usage tracking setup and querying
- Cost dashboard CLI commands
- Semantic cache hit rates
- Event store health metrics
- How to read campaign reports

---

### 5.5 — Update Backlog and Roadmap

**Files:**
- [MODIFY] [09_IMPLEMENTATION_BACKLOG.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/09_IMPLEMENTATION_BACKLOG.md) — mark completed items, add new items from Phase 4
- [MODIFY] [08_RELEASE_AND_ROADMAP.md](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/docs/08_RELEASE_AND_ROADMAP.md) — add v0.3.0 milestone with Phase 1-5 deliverables

---

### 5.6 — HMAC Audit Chain for Event Integrity

**What:** Add HMAC-SHA256 chain to event envelopes for tamper detection.

**Files:**
- [MODIFY] [persistence.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/runtime/src/persistence.ts) — compute and store HMAC on append
- [MODIFY] [index.ts](file:///c:/Users/mdasifinit/Documents/Code/OmniBranch/packages/contracts/src/index.ts) — add `hmac` field to `EventEnvelope`

**Approach:**
1. Each event envelope gets `hmac = HMAC-SHA256(prev_hmac + JSON.stringify(event), secret)`
2. Secret comes from `OMNIBRANCH_AUDIT_SECRET` env var (optional — if absent, HMAC is skipped)
3. `omnibranch audit verify` CLI command walks the chain and reports any breaks
4. Chain breaks don't prevent operation — they generate warnings. This is forensic, not preventive.

---

### Phase 5 Gate

```bash
pnpm verify
pnpm docs:check    # verify all internal doc links
pnpm verify:release
```

---

## Open Questions

> [!IMPORTANT]
> The following items need your input before execution begins:

1. **Semantic cache scope:** Should the semantic cache be per-repository (shared across campaigns) or per-campaign (isolated)? Per-repo offers higher hit rates but risks stale results across different base branches.

2. **Token budget default:** Should `tokenBudget` have a default maximum, or should it be unlimited by default? Unlimited is more permissive; a default cap (e.g., $50) prevents accidental cost overruns.

3. **HMAC audit chain priority:** Should 5.6 (HMAC chain) be deferred to a later release? It adds complexity to the event envelope format and is listed as Phase 5 governance in the analysis, but it provides strong tamper detection.

4. **Phase 4 ordering:** Token tracking (4.1) is a prerequisite for budget enforcement (4.4) and cost-aware routing (4.2). Semantic caching (4.3) and streaming output (4.5) are independent. Should we prioritize any of these differently?

5. **ADR process:** Should new ADRs be full documents or minimal stubs consistent with the existing terse ADR format in `docs/adr/`?

---

## Verification Plan

### Automated Tests
```bash
# After each phase:
pnpm format:check && pnpm build && pnpm docs:check && pnpm lint && pnpm typecheck && pnpm test

# Full release verification after Phase 5:
pnpm verify:release
```

### Manual Verification
- Run a real campaign with mock adapter after Phase 1 to verify shutdown handler and lock behavior
- Send SIGINT during campaign execution to verify graceful shutdown
- Create a plan with circular dependencies to verify early detection
- Inspect `.omnibranch/events.jsonl` after crash recovery to verify JSONL repair
