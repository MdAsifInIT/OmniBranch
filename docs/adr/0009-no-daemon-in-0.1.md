# ADR-0009: No Daemon in 0.1

**Status:** Accepted

The CLI is re-entrant and resumable but no long-lived background service ships in 0.1. Scheduling
and reconciliation occur through explicit invocations.
