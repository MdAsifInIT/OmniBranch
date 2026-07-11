## Conflict Detection Report

### BLOCKERS (0)

None.

### WARNINGS (0)

None.

### INFO (3)

[INFO] Policy decision naming normalized
Found: Configuration uses `require_approval`; the runtime security contract uses `approval_required`.
Note: YAML accepts `require_approval` and normalization emits `approval_required`.

[INFO] Runtime support baseline
Found: The host runs Node 26 while the architecture specifies Node 22.
Note: Node 22 is the release and CI baseline; Node 26 may be used for local verification only.

[INFO] Daemon deferred
Found: The architecture shows an illustrative daemon package while ADR-009 excludes a daemon from 0.1.
Note: The 0.1 implementation is re-entrant CLI-only; scheduled/daemon operation remains post-0.1.
