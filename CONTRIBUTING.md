<!-- generated-by: gsd-doc-writer -->

# Contributing to OmniBranch

Thank you for helping make multi-worker development safer and more reproducible. Contributions are welcome across code, tests, documentation, adapters, security, and design.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use public issues for bugs and feature requests, but report vulnerabilities privately through [GitHub Security Advisories](https://github.com/MdAsifInIT/OmniBranch/security/advisories).
- Keep production repository contents, credentials, and exploit details out of issues, examples, fixtures, and logs.

## Development setup

Read [Getting started](docs/GETTING-STARTED.md) for prerequisites and a first run, then [Development](docs/DEVELOPMENT.md) for architecture boundaries and commands.

```sh
git clone https://github.com/MdAsifInIT/OmniBranch.git
cd OmniBranch
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm verify
```

## Choose the right change

Good first contributions include:

- correcting or clarifying documentation;
- adding focused regression tests;
- improving diagnostics without changing compatibility contracts;
- expanding hostile-input fixtures;
- improving mock/fake adapter coverage;
- fixing cross-platform behavior with reproducible evidence.

Discuss large architectural changes, new providers, or breaking surfaces before investing in implementation.

## Coding standards

- Run Prettier with `pnpm format` and ESLint with `pnpm lint`.
- Keep TypeScript strict and use type-only imports where required.
- Preserve package dependency direction and deterministic decision logic.
- Pass process/Git arguments as arrays and containment-check filesystem mutations.
- Never infer provider capabilities or successful validation.
- Never persist credential values.

CI enforces formatting, documentation checks, lint, types, tests, builds, package assembly, security scanning, and the release smoke test.

## Tests

Add the smallest test that proves the behavior and the relevant failure modes. See [Testing](docs/TESTING.md) for project selection and naming.

```sh
pnpm test
pnpm verify
```

Use `pnpm verify:release` when changing packaging, schemas, generated skill content, CLI compatibility, installer state, or release tooling.

## Compatibility and ADRs

The following are public compatibility surfaces:

- WorkspacePlan YAML and JSON Schemas;
- events, projections, evidence, receipts, and recovery journals;
- adapter contracts and normalized results;
- CLI commands, JSON envelopes, errors, and exit behavior;
- report formats and Agent Skill layouts.

A breaking change needs an ADR, a version change, migration or explicit rejection behavior, tests, and upgrade/compatibility documentation. Do not edit accepted ADR history to change a decision; add a superseding ADR.

## Branches and commits

- Start from current `main`.
- Use a focused branch such as `feat/provider-probe`, `fix/lease-recovery`, or `docs/getting-started`.
- Prefer atomic commits with imperative subjects: `feat: add provider detection evidence`.
- Do not combine unrelated refactors, formatting, or generated artifacts.
- Do not push tags, publish packages, or perform remote sandbox mutations without explicit authorization.

## Pull request checklist

- [ ] The change has a clear user or maintainer outcome.
- [ ] Implementation follows package and security boundaries.
- [ ] Tests cover success, failure, stale/unavailable, and dry-run behavior as relevant.
- [ ] Documentation and examples match the implemented CLI and schemas.
- [ ] Breaking surfaces include an ADR and migration/rejection path.
- [ ] `pnpm verify` passes locally.
- [ ] `pnpm verify:release` passes for release-facing changes.
- [ ] No credentials, local state, caches, or unrelated files are included.

In the pull request description, include the problem, approach, user impact, security implications, verification commands, external gates not run, and any follow-up work.

## Reporting bugs and requesting features

Include:

- OmniBranch and Node versions;
- operating system and Git version;
- command and sanitized configuration;
- expected and actual behavior;
- stable error code or JSON envelope;
- minimal reproduction steps;
- whether the failure reproduces with `--dry-run`.

Never include tokens or private repository content. Replace sensitive paths and identifiers with safe placeholders.

## License

By contributing, you agree that your contribution is licensed under the repository’s [Apache License 2.0](LICENSE).
