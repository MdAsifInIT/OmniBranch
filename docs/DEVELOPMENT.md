<!-- generated-by: gsd-doc-writer -->

# Development

OmniBranch is a strict TypeScript monorepo built with Node 22, pnpm workspaces, TypeScript project references, Vitest, ESLint, Prettier, and tsup.

## Local setup

```sh
git clone https://github.com/MdAsifInIT/OmniBranch.git
cd OmniBranch
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm verify
```

No `.env` file or live provider credential is required for the offline development and test suites.

## Repository map

```text
apps/cli/             Public CLI source, bundle config, and packaged skill
packages/contracts/   Public compatibility types and ports
packages/platform/    Host/process/filesystem abstractions
packages/runtime/     Deterministic orchestration and persistence
packages/adapters/    Provider and mock adapters
packages/installer/   Universal skill installer
packages/test-kit/    Shared deterministic test fixtures
schemas/              Versioned JSON Schemas
skills/omnibranch/    Canonical Agent Skill source
fixtures/             Integration and hostile-input fixtures
scripts/              Build, docs, security, and release tooling
```

The dependency direction is documented in [Architecture](ARCHITECTURE.md). Keep deterministic logic out of provider adapters and CLI presentation.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm format` | Rewrite supported files with Prettier |
| `pnpm format:check` | Check formatting without mutation |
| `pnpm lint` | Run ESLint with zero warnings allowed |
| `pnpm typecheck` | Build TypeScript project references for type checking |
| `pnpm test` | Run every Vitest project |
| `pnpm build` | Compile packages, generate skill/package assets, and bundle the CLI |
| `pnpm docs:check` | Validate documentation, assets, links, headings, and CLI examples |
| `pnpm verify` | Run formatting, docs, lint, types, tests, and build |
| `pnpm verify:release` | Run the complete package, security, audit, artifact, and smoke gate |
| `pnpm skill:validate` | Verify the canonical skill and provider copies |
| `pnpm security:scan` | Scan source/distribution roots for forbidden patterns |
| `pnpm package:verify` | Pack, install, and exercise the npm tarball in an empty prefix |

## Code style

- TypeScript is strict, ESM-first, and uses NodeNext resolution.
- Prettier owns formatting; do not hand-align code against it.
- ESLint uses the flat config in `eslint.config.js` and enforces consistent type-only imports.
- Use `apply_patch` or focused edits; do not mix unrelated cleanup into a change.
- Public types, CLI envelopes, schemas, events, reports, and skill layouts are compatibility surfaces.

## Implementation rules

- Pass Git and process arguments as arrays. Never construct shell command strings from repository or user data.
- Keep JSONL authoritative and SQLite rebuildable.
- Use injected clocks and ID generators in deterministic code.
- Reject unknown state transitions, action classes, schema versions, and autonomy capabilities.
- Preserve dry-run behavior for mutations and include immutable policy/evidence records.
- Add containment checks before filesystem cleanup, rename, backup, or recovery.
- Never put secrets in tests, fixtures, events, prompts, reports, snapshots, or logs.

## Adding or changing a package

1. Declare a private workspace package and strict project reference.
2. Define shared contracts in `packages/contracts` when the surface crosses package boundaries.
3. Keep dependency flow inward; adapters may implement ports but deterministic packages must not import concrete providers.
4. Add focused unit tests plus integration/security/contract coverage appropriate to the boundary.
5. Update the corresponding package README and [Architecture](ARCHITECTURE.md).

## Changing public compatibility surfaces

Breaking changes require:

1. an ADR or an explicit superseding decision;
2. a versioned schema/type/layout change;
3. migration or deterministic rejection behavior;
4. compatibility and upgrade documentation;
5. contract tests and release notes.

This applies to WorkspacePlan YAML, installer state, event envelopes, evidence, adapter results, reports, CLI JSON, exit codes, and Agent Skill layouts.

## Branches, commits, and pull requests

- Branch from `main` and use a short category prefix such as `feat/`, `fix/`, `docs/`, or `chore/`.
- Keep commits atomic and use imperative subjects, for example `fix: reject unsafe recovery paths`.
- Keep pull requests focused; describe user impact, security implications, tests, and migration needs.
- Do not include generated caches, credentials, local runtime state, or unrelated formatting.
- Ensure `pnpm verify` passes before requesting review; use `pnpm verify:release` for packaging or compatibility changes.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contributor checklist.
