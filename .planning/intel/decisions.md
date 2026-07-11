# Ingested Decisions

- Build a standalone provider-neutral TypeScript/Node control plane.
- Keep orchestration, Git mutations, policy, validation, scheduling, and recovery deterministic.
- Use JSONL as the canonical append-only event ledger and SQLite only as a rebuildable projection.
- Invoke native Git and engine processes through typed argument arrays, never constructed shell strings.
- Commit repository policy/configuration under `.omnibranch/`; keep mutable runtime state under the common Git directory.
- Implement GitHub first behind a provider-neutral SCM contract.
- Provide Codex and Claude CLI execution, OpenCode compatibility, and Antigravity guided fallback.
- Ship no daemon, dashboard, force push, hard reset, broad clean, or automatic stable-branch promotion in 0.1.
