# Release Runbook

1. Start from a clean checkout on Node 22 and pnpm 11.11.0.
2. Run `pnpm install --frozen-lockfile` and `pnpm verify:release`.
3. Review `artifacts/omnibranch-0.1.0.sbom.json` and `artifacts/SHA256SUMS`.
4. Confirm three-OS CI, schema compatibility, dependency review, secret scan, and skill validation.
5. Confirm external engine/GitHub gates are either evidenced or explicitly listed as unverified.
6. Create and sign the tag only with separate authorization.
7. Let the signed-tag workflow verify and upload build artifacts. Publishing npm packages or a GitHub release is a separate approved action.
