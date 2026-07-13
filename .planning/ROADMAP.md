# Roadmap: OmniBranch 0.2.0 Universal Installer

## Overview

Turn the completed local-first 0.1 implementation into one distributable Node 22 package containing the bundled CLI, canonical Agent Skill, safe provider-aware installer, Claude marketplace layout, and reproducible release artifacts without publishing.

## Phases

- [x] **Phase 8: Installer Contracts and Core** - Versioned public contracts, target resolution, integrity, receipts, atomic lifecycle, recovery, and security.
- [x] **Phase 9: CLI Package and Provider Distribution** - Installer CLI commands, canonical provider layouts, public npm package assembly, and Claude plugin marketplace.
- [x] **Phase 10: Package Verification and Release Readiness** - Tarball installation, cross-platform CI, archives, SBOM/checksums, documentation, and final audit.

## Phase Details

### Phase 8: Installer Contracts and Core

**Goal**: Implement deterministic, safe, provider-aware skill installation independently of CLI presentation.
**Depends on**: OmniBranch 0.1.0
**Requirements**: [INST-01, INST-02, INST-03, INST-04, INST-05]
**Success Criteria**:

1. Provider targets resolve deterministically for user and project scopes and reject unsupported combinations.
2. Install, update, rollback, and uninstall are atomic, receipt-backed, integrity-checked, and recoverable.
3. Unmanaged, modified, escaping, or concurrently mutated destinations fail closed.

Plans:

- [x] 08-01: Implement installer contracts, schemas, service, filesystem transaction journal, receipts, backups, and tests.

### Phase 9: CLI Package and Provider Distribution

**Goal**: Expose the installer through stable CLI commands and produce one public package plus native provider layouts.
**Depends on**: Phase 8
**Requirements**: [CLI-02, PKG-01, PKG-02, PKG-03]
**Success Criteria**:

1. Every `omnibranch skill` command supports stable JSON and mutation dry-runs.
2. Generated layouts contain the complete canonical `omnibranch/SKILL.md` tree with no divergent instruction copies.
3. The public package is `omnibranch@0.2.0`, bundles internal code, and externalizes only `better-sqlite3`.
4. The Claude plugin and `omnibranch-tools` marketplace validate locally.

Plans:

- [x] 09-01: Implement CLI integration, skill generation, package bundling, Codex metadata, and Claude distribution.

### Phase 10: Package Verification and Release Readiness

**Goal**: Prove the distributable tarball and release artifacts across isolated installation scenarios without publishing.
**Depends on**: Phase 9
**Requirements**: [PKG-04, QUAL-03, REL-02]
**Success Criteria**:

1. `npm pack` contains only the allowlisted CLI, native dependency manifest, licenses, and canonical skill payload.
2. The tarball installs into an empty prefix and passes version, target, plan, install, doctor, rollback, and uninstall smoke tests.
3. Node 22 CI defines Windows/macOS/Linux isolated user/project installer coverage.
4. Skill/plugin archives, SBOM, checksums, provenance configuration, docs, and milestone audit are complete without publication.

Plans:

- [x] 10-01: Implement package smoke tests, release assets/workflows, documentation, security audit, and final verification.

## Progress

| Phase                                          | Plans Complete | Status   | Completed  |
| ---------------------------------------------- | -------------- | -------- | ---------- |
| 8. Installer Contracts and Core                | 1/1            | Complete | 2026-07-13 |
| 9. CLI Package and Provider Distribution       | 1/1            | Complete | 2026-07-13 |
| 10. Package Verification and Release Readiness | 1/1            | Complete | 2026-07-13 |
