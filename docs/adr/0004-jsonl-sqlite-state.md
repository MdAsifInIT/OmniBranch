# ADR-0004: JSONL Event Ledger and SQLite Projections

**Status:** Accepted

Canonical events are append-only JSON Lines under the common Git directory. better-sqlite3 12.11.1
stores rebuildable transactional projections; a projection never becomes an independent authority.
