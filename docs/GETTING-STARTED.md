<!-- generated-by: gsd-doc-writer -->

# Getting started

This guide takes you from an empty machine to a verified OmniBranch skill installation and an optional local mock campaign.

## Prerequisites

- Node.js `>=22`
- Git with worktree support
- pnpm `11.11.0` through Corepack when developing from source

The installer itself does not require provider credentials. Live GitHub or engine operations may require their own scoped credentials and approvals.

## Install OmniBranch

The npm package is release-ready but not yet published. Choose one current path.

### Verified repository tarball

```sh
git clone https://github.com/MdAsifInIT/OmniBranch.git
cd OmniBranch
npm install --global ./artifacts/omnibranch-0.2.0.tgz
omnibranch --version
```

### Source checkout

```sh
git clone https://github.com/MdAsifInIT/OmniBranch.git
cd OmniBranch
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm omnibranch -- --version
```

After an authorized registry release, `npm install --global omnibranch@0.2.0` and `npx omnibranch@0.2.0 ...` become the supported registry entry points.

## Install the Agent Skill

Preview provider detection and destinations:

```sh
omnibranch skill targets --scope user --json
omnibranch skill plan --target auto --scope user --dry-run --json
```

Install and verify:

```sh
omnibranch skill install --target auto --scope user --json
omnibranch skill doctor --scope user --json
```

If no provider is detected, `auto` installs only the generic Agent Skills target and returns a warning. Use `--target all` to install every compatible user destination.

For a repository-local skill:

```sh
omnibranch skill install --target agents --scope project --project . --json
```

Codex project scope is not supported; the generic project target is the documented alternative.

## Run the offline mock campaign

Campaign commands currently exercise the built-in mock vertical slice. Run them inside a disposable Git repository or this project checkout:

```sh
pnpm omnibranch -- doctor --json
pnpm omnibranch -- init --json
pnpm omnibranch -- config validate --json
pnpm omnibranch -- campaign create --name first-campaign --json
```

Copy the returned campaign ID into the following commands:

```sh
pnpm omnibranch -- plan --campaign <campaign-id> --dry-run --json
pnpm omnibranch -- run --campaign <campaign-id> --json
pnpm omnibranch -- status --campaign <campaign-id> --json
pnpm omnibranch -- report --campaign <campaign-id> --json
```

The fixture plans two disjoint tasks, executes them through the mock adapter in isolated worktrees, persists evidence, and emits Markdown/JSON reports.

## Common setup issues

### Node is older than 22

`omnibranch doctor` reports the host as unhealthy. Install Node 22 or newer, reopen the terminal, and verify with `node --version`.

### pnpm is not available

Source development uses the pinned release:

```sh
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm --version
```

### An existing skill destination is refused

OmniBranch will not overwrite an unmanaged directory. Inspect `skill status` first. Use `--replace` only when you intentionally want OmniBranch to adopt and back up that destination.

### A managed skill was edited locally

Update, rollback, and uninstall fail closed. Preserve your changes manually, then use `--force` only if discarding or replacing those edits is intentional.

### A required provider is not detected

Use `skill targets --json` to inspect detection. You can select an explicit target even when its executable is absent; the installer manages skill files, not provider executables.

## Next steps

- [Examples](EXAMPLES.md) for everyday commands.
- [Configuration](CONFIGURATION.md) for WorkspacePlan structure and validation.
- [Development](DEVELOPMENT.md) to work on the monorepo.
- [Testing](TESTING.md) to run focused and complete quality gates.
- [Rollback](ROLLBACK.md) for installation and runtime recovery.
