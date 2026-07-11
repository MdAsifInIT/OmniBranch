# Compatibility Matrix

| Surface              | Implementation                | Offline verification       | Live verification                                 |
| -------------------- | ----------------------------- | -------------------------- | ------------------------------------------------- |
| Node.js 22           | Release target                | Type/build contract        | CI required on Windows/macOS/Linux                |
| Windows host Node 26 | Development host              | Full offline gate          | Passed locally, not release target                |
| Git                  | Native argument-array backend | Temporary repository tests | Passed locally                                    |
| GitHub               | Octokit adapter               | Fake/contract tests        | Sandbox writes unverified                         |
| Codex CLI            | Capability adapter            | Fixture contracts          | Probe attempted; Windows denied executable access |
| Claude Code          | Capability adapter            | Fixture contracts          | Not installed                                     |
| OpenCode             | Capability adapter            | Fixture contracts          | Not installed                                     |
| Antigravity CLI/IDE  | CLI and guided adapters       | Fixture contracts          | Not installed / guided only                       |

Unknown versions or safety capabilities always downgrade to guided mode.
