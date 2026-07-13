# Limitations

- The 0.2 distributable requires Node 22; native standalone executables are deferred.
- Certified installation targets are Codex, Claude Code, OpenCode, Antigravity, and generic Agent Skills only.
- Codex project-scoped discovery is not verified; use the generic `.agents/skills` target.
- Antigravity IDE uses guided handoff; missing or unknown provider safety capabilities never imply autonomy.
- No dashboard, daemon, hosted control plane, automatic stable-branch promotion, or telemetry ships in 0.2.
- GitHub live writes and package/marketplace publication require separate named approvals and credentials.
- Claude, OpenCode, and Antigravity live engine execution remains unverified on this host; fixture contracts pass.
- Junction and symlink behavior depends on host filesystem capabilities, but containment failures are denied.
- JSONL remains authoritative; SQLite is a rebuildable local projection.
