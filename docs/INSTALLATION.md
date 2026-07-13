# Installation

## Requirements

- Node.js 22 or newer
- Git with worktree support for orchestration commands

After an authorized npm release, install the persistent CLI and skill:

```sh
npm install --global omnibranch@0.2.0
omnibranch skill install --target auto --scope user
```

Or install only the skills without retaining a global CLI:

```sh
npx omnibranch@0.2.0 skill install --target auto --scope user
```

`auto` installs to detected Codex, Claude Code, OpenCode, Antigravity, or generic Agent Skills locations. If nothing is detected, it installs only `~/.agents/skills/omnibranch` and emits a warning. Use `skill targets`, `skill plan --dry-run`, `skill status`, and `skill doctor` to inspect the operation.

Project scope requires `--project <path>` or successful Git discovery. Codex project scope is intentionally unsupported; use `--target agents --scope project`.

## Source development

```sh
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm verify:release
```

Implementation workflows only assemble and test the package. They do not publish it.
