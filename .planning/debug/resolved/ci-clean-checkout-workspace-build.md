---
status: resolved
trigger: 'Fix the Github Actions CI.'
created: 2026-07-13
updated: 2026-07-13
---

# CI clean-checkout workspace build

## Symptoms

- Expected: isolated installer lifecycle tests pass on Node 22 across Ubuntu, macOS, and Windows.
- Actual: all three jobs fail before `pnpm verify:release`.
- Error: workspace imports resolve to missing `packages/*/dist/index.js` files.
- Reproduction: install dependencies in a clean checkout and run the isolated tests before TypeScript project references have built package entry points.

## Current Focus

- hypothesis: confirmed
- test: build workspace package entry points with `pnpm typecheck` before the isolated Vitest invocation.
- expecting: the isolated lifecycle tests resolve all private packages, followed by a successful release gate.
- next_action: confirm the pushed three-OS GitHub Actions run.

## Evidence

- timestamp: 2026-07-13T08:12:06Z
  observation: GitHub run 29234577604 failed on all three operating systems in the isolated installer lifecycle step.
- timestamp: 2026-07-13T08:12:06Z
  observation: Ubuntu and macOS logs report missing `@omnibranch/platform` and `@omnibranch/adapters/dist/index.js` entry points.
- timestamp: 2026-07-13T08:20:00Z
  observation: package manifests export `./dist/index.js`; the standard `verify` script runs `typecheck` before `test`, but the isolated CI step bypassed that ordering.
- timestamp: 2026-07-13T08:46:17Z
  observation: the CI-equivalent workspace build and isolated test sequence passed all 17 tests locally.
- timestamp: 2026-07-13T08:47:27Z
  observation: the complete release gate passed all 59 tests, package verification, security checks, and artifact generation.

## Eliminated

- hypothesis: operating-system-specific installer behavior
  reason: the same module-resolution failure occurs before installer behavior on every runner.

## Resolution

- root_cause: the isolated CI test step ran before TypeScript project references built the private workspace packages exported from `dist/index.js`.
- fix: add a `pnpm typecheck` workspace-entry-point build immediately after dependency installation and before isolated tests.
- verification: 17 isolated tests and the complete release gate pass locally; GitHub three-OS confirmation follows the push.
- files_changed: `.github/workflows/ci.yml`
