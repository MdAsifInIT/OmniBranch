# Compatibility Matrix

| Surface              | 0.2 support                | User skill destination                                          | Project skill destination     | Verification                                   |
| -------------------- | -------------------------- | --------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| Node.js              | `>=22`                     | —                                                               | —                             | Package and three-OS CI contract               |
| Codex                | Certified                  | `$CODEX_HOME/skills/omnibranch` or `~/.codex/skills/omnibranch` | Use generic target            | Fixture + local contract                       |
| Claude Code          | Certified                  | `~/.claude/skills/omnibranch`                                   | `.claude/skills/omnibranch`   | Fixture; live engine unavailable               |
| OpenCode             | Certified                  | `~/.config/opencode/skills/omnibranch`                          | `.opencode/skills/omnibranch` | Fixture; live engine unavailable               |
| Antigravity          | Certified skill/guided IDE | `~/.gemini/config/skills/omnibranch`                            | `.agents/skills/omnibranch`   | Fixture; live engine unavailable               |
| Generic Agent Skills | Certified                  | `~/.agents/skills/omnibranch`                                   | `.agents/skills/omnibranch`   | Full local lifecycle                           |
| GitHub               | Adapter                    | —                                                               | —                             | Fake/contract tests; sandbox writes unverified |

Unknown versions or missing cancellation/policy controls downgrade to guided mode. Shared project destinations are deduplicated.
