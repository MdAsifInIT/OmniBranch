# Compatibility

This matrix separates implemented contracts from live provider verification.

| Surface              | Supported contract                                | Local/offline evidence                      | External evidence                               |
| -------------------- | ------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Node.js              | `>=22` release target                             | Build, package, and smoke tests             | Windows/macOS/Linux Node 22 CI definition       |
| Git                  | Argument-array backend with worktrees             | Temporary-repository integration tests      | Host Git required                               |
| Codex                | CLI adapter and user skill target                 | Fixture contracts and local skill lifecycle | Live contract depends on installed version      |
| Claude Code          | CLI adapter, user/project skill, Claude plugin    | Fixture and layout contracts                | Live engine absent on this host                 |
| OpenCode             | Compatibility adapter and user/project skill      | Fixture and layout contracts                | Live engine absent on this host                 |
| Antigravity          | CLI probe, guided IDE handoff, user/project skill | Fixture and layout contracts                | Live engine absent; IDE remains guided          |
| Generic Agent Skills | User/project skill target                         | Full installer lifecycle                    | No provider executable required                 |
| GitHub               | Octokit SCM adapter                               | Fake/contract coverage                      | Sandbox writes require credentials and approval |

## Compatibility rules

- Unknown engine versions or missing cancellation/policy controls downgrade to guided mode.
- Unsupported autonomy is never inferred from a provider name.
- Required validation statuses other than `pass` do not satisfy the gate by default.
- WorkspacePlan uses `omnibranch.dev/v1alpha1` and rejects incompatible versions.
- Installer evidence uses `omnibranch.dev/skill-install/v1`.
- Breaking CLI, event, evidence, adapter, report, schema, or skill changes require migration or explicit rejection.

## Operating systems

The CI matrix defines Node 22 jobs for `ubuntu-latest`, `macos-latest`, and `windows-latest`. Local Windows verification does not substitute for completed CI results on other operating systems.

## Package contents

The public package bundles the CLI, internal workspace code, JavaScript dependencies, and canonical skill payload. `better-sqlite3@12.11.1` is the only external runtime dependency.
