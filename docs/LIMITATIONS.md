# Limitations

OmniBranch `0.3.0` is intentionally conservative.

## Distribution

- The npm package is assembled and verified but not published by this repository state.
- Node.js 22 or newer is required; native standalone executables are deferred.
- The public package retains the native `better-sqlite3` dependency.

## Provider verification

- Certified skill targets are Codex, Claude Code, OpenCode, Antigravity, and generic Agent Skills.
- Codex project-scoped discovery is not verified; use `.agents/skills` for project scope.
- Claude Code, OpenCode, and Antigravity engine executables were absent during local verification; fixture contracts pass, live execution does not.
- Antigravity IDE integration is a guided handoff, not unattended IDE control.
- Unknown versions or missing safety controls downgrade to guided mode.

## Product boundaries and caching

- No dashboard, daemon, hosted control plane, deployment agent, or automatic stable-branch promotion ships in 0.3.0.
- Semantic cache does not handle non-deterministic or side-effecting intents; queries with ambient environment inputs, live timestamps, or unseeded dynamic responses bypass the cache.
- Budget enforcement freezes active campaign execution upon reaching token or cost ceilings rather than performing dynamic model tier downgrades.
- Retry policies govern transient worker errors and network timeouts with exponential backoff, but unrecoverable contract violations halt execution immediately.
- No provider executable is installed or upgraded by `omnibranch skill`.
- No telemetry is enabled by default.

## External mutation

- GitHub live writes require a named sandbox repository, scoped credentials, and exact approval.
- npm, tags, releases, pull requests, pushes, and marketplace changes are separate external actions.
- Remote ref movement cannot be made atomic with a force lease because force push is intentionally absent; Git and branch protection provide the final rejection.

## Filesystems and state

- Junction/symlink behavior depends on host filesystem support and permissions; detected containment uncertainty fails closed.
- JSONL is authoritative and SQLite is rebuildable, but operators must preserve compatible event schemas during runtime rollback.
- Schema migrations require sequential version steps; skipping intermediate schema versions during rollback or forward migration requires explicit re-indexing.
- User- and project-scope receipts are local to their installer state roots; moving managed destinations manually breaks their evidence relationship.

See [Compatibility](COMPATIBILITY.md) for supported surfaces and [Release](RELEASE.md) for external gates.
