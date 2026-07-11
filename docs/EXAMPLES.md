# Examples

```sh
pnpm omnibranch -- init --json
pnpm omnibranch -- config validate --json
pnpm omnibranch -- campaign create --name example --json
pnpm omnibranch -- plan --campaign <id> --dry-run --json
pnpm omnibranch -- run --campaign <id> --json
pnpm omnibranch -- validate --campaign <id> --json
pnpm omnibranch -- report --campaign <id> --format both --json
```

Use `.omnibranch/profiles/reference-repository.yaml` and `.omnibranch/policies/conservative.yaml` for disposable-branch dogfood. Promotion and GitHub writes require separately created approval evidence.
