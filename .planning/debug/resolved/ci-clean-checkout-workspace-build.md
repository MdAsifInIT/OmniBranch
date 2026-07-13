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
- next_action: confirm the follow-up three-OS GitHub Actions run.

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
- timestamp: 2026-07-13T08:18:19Z
  observation: after workspace resolution was fixed, Ubuntu exposed that the installer fixture inherited the runner's `XDG_CONFIG_HOME`, while macOS passed the same isolated tests.
- timestamp: 2026-07-13T08:22:38Z
  observation: run 29235121877 passed Ubuntu, macOS, and Windows; GitHub emitted only a Node 20 action-runtime deprecation warning.

## Eliminated

- hypothesis: operating-system-specific installer behavior
  reason: the same module-resolution failure occurs before installer behavior on every runner.
- hypothesis: incorrect OpenCode destination mapping
  reason: the production mapping correctly honors `XDG_CONFIG_HOME`; the test fixture failed to isolate that environment variable.

## Resolution

- root_cause: the isolated CI test step ran before TypeScript project references built private workspace packages, and its installer fixture inherited host-specific provider environment variables.
- fix: build workspace entry points before isolated tests, give the fixture a complete temporary provider environment, and update official workflow actions to their Node 24 runtime majors.
- verification: 17 isolated tests and the complete release gate pass locally; GitHub run 29235121877 passed the three-OS matrix before the warning-only action upgrade.
- files_changed: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `packages/installer/src/installer.test.ts`
