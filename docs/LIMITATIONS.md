# Limitations

- No dashboard, daemon, hosted control plane, deployment agent, or automatic stable-branch promotion ships in 0.1.
- JSONL is authoritative; SQLite is a disposable local projection.
- GitHub live writes require a named sandbox, scoped credentials, and exact human approval.
- Provider CLI syntax is compatibility configuration until verified for an installed version.
- Cross-platform CI results cannot be claimed from a single Windows host.
- Ordinary Git push uses an expected-remote preflight plus non-force push; concurrent remote movement is ultimately rejected by Git/branch protection, not made atomic by a force lease.
- Junction/symlink behavior depends on host filesystem support and permissions.
