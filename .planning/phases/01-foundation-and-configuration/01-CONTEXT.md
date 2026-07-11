# Phase 1: Foundation and Configuration - Context

**Gathered:** 2026-07-12
**Status:** Ready for execution
**Mode:** Approved autonomous implementation

<domain>
## Phase Boundary

Create the strict Node/TypeScript workspace, public contracts, host abstractions, configuration pipeline, repository discovery, and the `init`, `doctor`, and `config validate` commands.

</domain>

<decisions>
## Implementation Decisions

- Target Node 22 while allowing the host Node 26 runtime for local checks.
- Pin pnpm 11.11.0 and the exact dependencies named in the approved plan.
- Use ESM, TypeScript project references, explicit package exports, and no adapter dependency in contracts/platform.
- Accept configuration `require_approval` but normalize it to runtime `approval_required`.
- Default external effects to dry-run and fail closed on unknown keys, actions, paths, or template tokens.

</decisions>

<specifics>
## Specific Ideas

All CLI commands return one stable JSON envelope when `--json` is supplied. Configuration diagnostics include a source path, rule, message, and remediation hint.

</specifics>

<deferred>
## Deferred Ideas

Persistence, Git mutation, scheduling, live adapters, and release packaging belong to later phases.

</deferred>
