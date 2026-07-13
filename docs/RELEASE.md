# Release Runbook

1. Start from a clean checkout on Node 22 and pnpm 11.11.0.
2. Run `pnpm install --frozen-lockfile` and `pnpm verify:release`.
3. Inspect `npm pack --dry-run` output, the empty-prefix smoke result, `artifacts/omnibranch-0.2.0.tgz`, both skill/plugin archives, the CycloneDX SBOM, and `SHA256SUMS`.
4. Confirm Windows/macOS/Linux CI, schema compatibility, dependency audit, secret scan, and canonical skill validation.
5. Keep unavailable live engines and GitHub sandbox writes explicitly unverified.
6. Create/sign a tag or GitHub release only with separate authorization. Ordinary tags build artifacts only.
7. npm publication additionally requires manual workflow dispatch with `publish_npm=true`, approval of the protected `npm-production` environment, and trusted publishing provenance.

No implementation or verification command publishes packages, tags, releases, PRs, or marketplace content.
