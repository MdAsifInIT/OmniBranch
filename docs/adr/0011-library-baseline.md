# ADR-0011: Runtime Library Baseline

**Status:** Accepted

Use YAML 2.9.0, Ajv 8.20.0 with JSON Schema 2020-12, picomatch 4.0.5, Pino 10.3.1,
Commander 15.0.0, Execa 9.6.1, better-sqlite3 12.11.1, and Octokit REST 22.0.1. All versions
are exact and lockfile-controlled; upgrades require compatibility tests and a changeset.
