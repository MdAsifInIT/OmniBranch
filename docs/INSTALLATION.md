# Installation

## Requirements

- Node.js 22 LTS
- Git with worktree support
- pnpm 11.11.0 through Corepack

## Source installation

```sh
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm build
pnpm omnibranch -- doctor --json
```

OmniBranch 0.1 is source-distributed in this repository; no npm package is published by this workflow. Runtime state stays under `.omnibranch/` and managed worktrees under `.omnibranch-worktrees/`.
