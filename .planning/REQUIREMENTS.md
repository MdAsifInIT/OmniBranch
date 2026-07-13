# Requirements: OmniBranch 0.2.0

**Defined:** 2026-07-13
**Core Value:** Install the same verified OmniBranch workflow safely across supported agent hosts without divergent skill content.

## Installer Core

- [x] **INST-01**: Resolve Codex, Claude, OpenCode, Antigravity, and generic Agent Skills destinations for supported scopes.
- [x] **INST-02**: Produce deterministic installation plans and deduplicate shared destinations.
- [x] **INST-03**: Install and update atomically with canonical file hashes, receipts, backups, and recovery journals.
- [x] **INST-04**: Roll back and uninstall only managed files, refusing modified content unless explicitly forced.
- [x] **INST-05**: Reject unsupported scopes, traversal, junction/symlink escape, corrupt payloads, concurrent installers, and incomplete recovery.

## Interfaces and Packaging

- [ ] **CLI-02**: Expose `skill targets|plan|install|status|update|doctor|rollback|uninstall` through the stable CLI envelope.
- [ ] **PKG-01**: Build one public `omnibranch@0.2.0` Node 22 package with the CLI binary and explicit file allowlist.
- [ ] **PKG-02**: Embed one canonical Agent Skill tree and generate provider layouts with real `SKILL.md` entrypoints.
- [ ] **PKG-03**: Provide valid Codex UI metadata and a versioned Claude plugin/marketplace layout.
- [ ] **PKG-04**: Install and exercise the packed npm tarball from an empty temporary prefix.

## Quality and Release

- [ ] **QUAL-03**: Unit, integration, security, contract, package, and isolated-home installer suites pass offline.
- [ ] **REL-02**: Generate deterministic skill/plugin archives, SBOM, checksums, provenance configuration, and 0.2 documentation without publishing.

## Out of Scope

| Feature                                  | Reason                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Native standalone executables            | Node 22 remains the 0.2 runtime contract                             |
| Automatic npm or marketplace publication | External mutation requires separate authorization                    |
| Provider executable installation         | Installer manages OmniBranch, not third-party engines                |
| Project-scoped Codex target              | Not a verified Codex discovery surface; use generic `.agents/skills` |
| Cursor, Copilot, Cline certification     | Generic target may work, but official certification is deferred      |

## Traceability

| Requirement                   | Phase    |
| ----------------------------- | -------- |
| INST-01 through INST-05       | Phase 8  |
| CLI-02, PKG-01 through PKG-03 | Phase 9  |
| PKG-04, QUAL-03, REL-02       | Phase 10 |
