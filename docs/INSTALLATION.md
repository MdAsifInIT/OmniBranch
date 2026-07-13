# Installation

OmniBranch `0.2.0` requires Node.js 22 or newer. Git is required for campaign/worktree commands; skill installation alone does not invoke a provider executable.

## Choose an installation path

### Verified local tarball

The npm package has not been published. Install the repository’s verified artifact:

```sh
git clone https://github.com/MdAsifInIT/OmniBranch.git
cd OmniBranch
npm install --global ./artifacts/omnibranch-0.2.0.tgz
omnibranch --version
```

### Source checkout

```sh
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm omnibranch -- doctor --json
```

### Registry commands after publication

Persistent CLI:

```sh
npm install --global omnibranch@0.2.0
omnibranch skill install --target auto --scope user
```

One-time CLI execution:

```sh
npx omnibranch@0.2.0 skill install --target auto --scope user
```

The npx form installs skills but does not retain the CLI globally.

## Preview destinations

```sh
omnibranch skill targets --scope user --json
omnibranch skill plan --target auto --scope user --dry-run --json
```

| Target        | User destination                                                        | Project destination                     |
| ------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `codex`       | `$CODEX_HOME/skills/omnibranch`, otherwise `~/.codex/skills/omnibranch` | Unsupported; use `agents`               |
| `claude`      | `~/.claude/skills/omnibranch`                                           | `<project>/.claude/skills/omnibranch`   |
| `opencode`    | `~/.config/opencode/skills/omnibranch`                                  | `<project>/.opencode/skills/omnibranch` |
| `antigravity` | `~/.gemini/config/skills/omnibranch`                                    | `<project>/.agents/skills/omnibranch`   |
| `agents`      | `~/.agents/skills/omnibranch`                                           | `<project>/.agents/skills/omnibranch`   |

`auto` installs detected providers; with no detection it installs `agents` and warns. `all` selects every supported destination and deduplicates shared project paths.

## User scope

```sh
omnibranch skill install --target auto --scope user --json
omnibranch skill doctor --scope user --json
```

User receipts and backups live under `~/.omnibranch/installer/`.

## Project scope

Supply a path or run inside a discoverable Git repository:

```sh
omnibranch skill install --target agents --scope project --project . --json
omnibranch skill doctor --scope project --project . --json
```

Project receipts and backups live under `<project>/.omnibranch/installer/`.

## Existing destinations

OmniBranch refuses unmanaged destinations. To intentionally adopt one after reviewing the plan:

```sh
omnibranch skill install --target agents --scope user --replace --json
```

Managed files changed after installation are also refused. `--force` is destructive authority for those local edits; preserve them separately before using it.

## What installation guarantees

- Files are copied rather than symlinked.
- Frontmatter, references, containment, and hashes are checked before activation.
- A sibling staging directory and recovery journal protect activation boundaries.
- Previous managed content is retained as a rollback backup.
- Receipts identify every owned file; uninstall does not broadly delete a provider directory.

Continue to [Getting started](GETTING-STARTED.md) or review [Rollback](ROLLBACK.md) before managing an existing installation.
