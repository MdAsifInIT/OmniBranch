# Phase 8: Installer Contracts and Core - Context

**Gathered:** 2026-07-13
**Status:** Ready for execution

<domain>
## Phase Boundary

Implement provider target resolution and a safe, deterministic installation lifecycle independent of CLI and package publishing.

</domain>

<decisions>
## Implementation Decisions

- Support Codex, Claude, OpenCode, Antigravity, and generic Agent Skills.
- Default to user scope; project scope requires a resolved project root.
- Treat project-scoped Codex as unsupported and recommend the generic target.
- Copy complete canonical skill directories; never symlink.
- Refuse unmanaged or modified installs by default; use explicit replacement/force flags.
- Store user state under `~/.omnibranch/installer` and project state under `<project>/.omnibranch/installer`.
- Stage, journal, verify, and rename atomically with rollback backups.

</decisions>

<code_context>

## Existing Code Insights

- Platform utilities already provide containment checks, atomic writes, redaction, hashing, and file locks.
- Contracts use strict branded/versioned interfaces and schemas.
- JSON CLI envelopes and dry-run semantics already exist.

</code_context>

<specifics>
## Specific Ideas

The user supplied a decision-complete 0.2.0 plan; no additional grey-area decisions remain.

</specifics>

<deferred>
## Deferred Ideas

Native binaries and broader provider certification remain out of scope.

</deferred>
