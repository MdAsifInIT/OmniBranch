<!-- generated-by: gsd-doc-writer -->

# Testing

OmniBranch uses Vitest `4.1.10` with four named projects: unit, integration, contracts, and security. Real temporary Git repositories and isolated home/project directories are used where operating-system behavior matters.

## Install test dependencies

```sh
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
```

The default suite is offline and uses mock/fake adapters. Live GitHub writes and unavailable engine executables are explicit optional gates.

## Run tests

```sh
# Everything
pnpm test

# Named projects
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm test:security

# One file
pnpm exec vitest run packages/installer/src/installer.test.ts
```

Run the complete development gate:

```sh
pnpm verify
```

Run the release/package gate:

```sh
pnpm verify:release
```

The release gate builds the bundled CLI, validates every skill layout, performs security and production advisory scans, inspects `npm pack`, installs the tarball into an empty temporary prefix, exercises its binary, and regenerates signed-input-ready artifacts and checksums. It does not publish anything.

## Test organization

| Suffix                  | Vitest project | Purpose                                                                         |
| ----------------------- | -------------- | ------------------------------------------------------------------------------- |
| `*.test.ts`             | unit           | State transitions, policy, ordering, serialization, normalization               |
| `*.integration.test.ts` | integration    | Git/worktrees, JSONL/SQLite, CLI flows, process and filesystem behavior         |
| `*.contract.test.ts`    | contracts      | Adapter dispositions, schema/layout compatibility, generated provider equality  |
| `*.security.test.ts`    | security       | Hostile paths/arguments, secrets, stale authority, plugin trust, unsafe actions |

Tests live beside their implementation under `apps/*/src` and `packages/*/src`. Shared Git and configuration fixtures live under `fixtures/`; reusable deterministic helpers live in `packages/test-kit`.

## Writing tests

- Inject `FakeClock` and `SequenceIdGenerator` instead of depending on wall time or random UUIDs.
- Use temporary directories and real argument-array Git commands for integration behavior.
- Assert stable error codes and evidence, not incidental error prose.
- Cover dry-run and mutation paths separately.
- Include Windows path, symlink/junction, traversal, and containment cases for filesystem changes.
- Treat unavailable providers as a disposition to test, never as a pass.
- For adapters, cover probe, preparation, launch, collection, cancellation, resume classification, malformed output, and guided fallback.
- For installer changes, cover every target/scope mapping, receipts, modification refusal, recovery, rollback, uninstall, and concurrency.

## Coverage

V8 coverage reporting is configured, but the repository does not define a numeric coverage threshold. Acceptance is behavior- and risk-based: every documented transition, failure mode, compatibility surface, and security boundary affected by a change needs direct evidence.

To produce coverage output:

```sh
pnpm exec vitest run --coverage
```

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests across Ubuntu, macOS, and Windows with Node 22 and pnpm 11.11.0. It executes isolated installer lifecycle tests and `pnpm verify:release`.

Cross-platform CI results must not be inferred from a single local operating system. Local results and external engine/GitHub gates should be reported separately.

## Test review checklist

- Does the test fail before the intended change?
- Is the assertion deterministic across Windows, macOS, and Linux?
- Are temporary paths contained and cleaned safely?
- Are secrets represented only by references or obvious fake values?
- Does the test cover stale, malformed, denied, unavailable, and interrupted outcomes where relevant?
- Does it avoid network access unless it is an explicitly named external gate?
