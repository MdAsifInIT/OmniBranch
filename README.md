<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/omnibranch-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/brand/omnibranch-logo-light.svg">
    <img src="docs/assets/brand/omnibranch-logo-light.svg" alt="OmniBranch — orchestrate with evidence" width="680">
  </picture>
</p>

<p align="center">
  <strong>Deterministic, local-first orchestration for bounded AI development across Git branches and worktrees.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img alt="Node.js 22+" src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white"></a>
  <a href="LICENSE"><img alt="Apache-2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-6366F1"></a>
  <a href=".github/workflows/ci.yml"><img alt="Windows, macOS, and Linux CI" src="https://img.shields.io/badge/CI-Windows%20%7C%20macOS%20%7C%20Linux-0891B2"></a>
</p>

---

## Why OmniBranch?

Autonomous AI coding agents are great at reasoning and writing code, but they share a key flaw: **they edit your live working directory directly.**

When an agent hits a context limit, hallucinates a refactor, or crashes mid-task, it leaves your repository in a dirty, broken state. If you try running multiple agents simultaneously, they overwrite each other's changes.

**OmniBranch gives your AI agents a safe execution layer.**

It doesn't replace your AI agent or workflow manager—it provides an isolated sandbox for them to work in so your main workspace stays clean and protected.

- **Physical Isolation:** Every task gets a dedicated, disposable Git worktree. Disastrous AI hallucinations can be undone simply by deleting a folder.
- **Parallel Workflows:** Run multiple autonomous agents concurrently across separate worktrees without merge collisions.
- **Full Resumability:** Session state is saved directly to disk via JSON envelopes and Git commits. If an agent crashes, run `omnibranch resume` to pick up right where it left off.
- **Evidence-Backed Validation:** Tasks are marked complete only when CI passes, unit tests are green, and scriptable evidence checks out.

### Built for Agentic Workflows

OmniBranch includes native utilities to make agent orchestration transparent and reliable:

- **Task Histories:** Append-only ledgers record task intent and execution outputs, leaving a clear audit trail.
- **Merge Guides:** Step-by-step guides generated under `.omnibranch/merge-guides` analyze conflict risks before you run `git merge`.
- **Project Context:** Automatic codebase mapping gives agents clear architectural context as soon as they initialize.

---

## Install

Install the CLI globally and configure the skill for your assistant:

```sh
npm install --global omnibranch@0.2.1
omnibranch skill install --target auto --scope user
```

To install the skill without keeping the CLI globally:

```sh
npx omnibranch@0.2.1 skill install --target auto --scope user
```

See the [installation guide](docs/INSTALLATION.md) for source builds, project scope, provider paths, upgrades, and uninstall behavior.

---

## Five-minute skill setup

Installing the OmniBranch skill teaches your AI assistant how to orchestrate complex, parallel work in your repository securely. It establishes a strict safety contract so the agent stays inside isolated worktrees, prevents overlapping edits, and asks for approval before mutating files or pushing code.

Once installed, simply ask your AI to _"use OmniBranch to run a campaign for X"_, and the AI handles the orchestration securely and deterministically.

---

## Supported skill targets

OmniBranch injects native skills into nearly any major AI agent:

- Codex
- Claude Code
- OpenCode
- Antigravity
- Generic Agent Skills

---

## Safety model

OmniBranch treats repository content, provider outputs, environment variables, system paths, and remote responses as untrusted data. It blocks arbitrary shell execution, force pushes, and destructive actions without explicit configurations and approval.

---

## Documentation

| Goal                                | Guide                                                                       |
| :---------------------------------- | :-------------------------------------------------------------------------- |
| Install and run the first command   | [Getting started](docs/GETTING-STARTED.md)                                  |
| Understand components and data flow | [Architecture](docs/ARCHITECTURE.md)                                        |
| Configure a WorkspacePlan           | [Configuration](docs/CONFIGURATION.md)                                      |
| Explore practical commands          | [Examples](docs/EXAMPLES.md)                                                |
| Set up a contributor environment    | [Development](docs/DEVELOPMENT.md)                                          |
| Run or extend the test suite        | [Testing](docs/TESTING.md)                                                  |
| Upgrade or recover an installation  | [Upgrade](docs/UPGRADE.md) · [Rollback](docs/ROLLBACK.md)                   |
| Check provider and runtime support  | [Compatibility](docs/COMPATIBILITY.md) · [Limitations](docs/LIMITATIONS.md) |

---

## Contributing

Bug fixes, documentation, tests, adapters, security hardening, and focused design discussions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), then run:

```sh
pnpm verify
pnpm verify:release
```

---

## Security

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/MdAsifInIT/OmniBranch/security/advisories). Do not put credentials, production repository contents, or exploit details in public issues.

---

## License

OmniBranch is available under the [Apache License 2.0](LICENSE). Contributions are accepted under the same terms.
