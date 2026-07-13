# Phase 9 Summary

Converted the CLI workspace into the public `omnibranch@0.2.0` Node 22 package, with Apache-2.0/repository metadata, an explicit file allowlist, a bundled CommonJS executable, and `better-sqlite3@12.11.1` as its sole runtime dependency. Workspace packages and JavaScript dependencies are bundled by tsup.

Added all eight `omnibranch skill` commands to the stable CLI envelope with common target, scope, project, dry-run, JSON, replacement, and force options. Installer failures retain their structured error codes, and mutations include policy evidence.

The canonical skill now generates full `omnibranch/SKILL.md` trees for every provider, the npm payload, and the Claude plugin. Codex UI metadata and the `omnibranch-tools` Claude marketplace are versioned and contract-tested.
