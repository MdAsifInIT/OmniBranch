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

## The Cognitive Layer Needs an Infrastructure Layer

Autonomous AI coding agents are incredibly powerful. They reason, plan, execute, and verify. But underneath all that cognition, they almost entirely share a fatal flaw: **they edit your live files directly.**

If an agent gets stuck in a loop, hallucinates a refactor, or simply hits a context limit and crashes midway through, it leaves your working directory in a broken, dirty state. It forces you to manually untangle the mess. Furthermore, if you want two agents to work on two different tasks simultaneously, they will inevitably collide and overwrite each other's work.

**OmniBranch is the missing execution layer.**

OmniBranch does not replace your AI's brain or workflow manager; it provides the **factory floor** for them to work on safely. It enforces strict physical isolation, deterministic execution, and evidence-backed validation without touching your main working directory.

## Why OmniBranch?

- **The Brain vs. The Sandbox:** Your AI is the brain. OmniBranch is the sandbox. The AI decides _what_ to write; OmniBranch controls _where_ it is allowed to be written.
- **Physical Isolation:** Every single task receives its own disposable Git worktree. Commits are isolated. Changes never step on each other. Reverting a disastrous AI hallucination is as simple as deleting a folder.
- **Parallelization via DAGs:** Because every task lives in a separate worktree, you can spawn five autonomous agents simultaneously to build five independent features without fear of collisions.
- **Absolute Resumability:** State isn't just held in ephemeral API contexts; it is written to disk via JSON envelopes and Git commits. If an agent crashes, you don't lose the work. You run `omnibranch resume` and it picks up right where it left off.
- **Evidence-Backed Validation:** A branch isn't "done" because the AI says so. It's done when CI passes, tests are green, and explicit, scriptable evidence proves it.

## Quality of Life for Autonomous Agents

OmniBranch provides native utilities specifically designed to make agentic workflows smoother and more transparent:

- **Task Histories:** Append-only ledgers automatically record the intent and outcome of every AI campaign, leaving a clear audit trail for future agents.
- **Merge Guides:** Automatically generated `.omnibranch/merge-guides` with concrete step-by-step instructions to safely integrate the isolated branches back into the main line, analyzing conflict risks before you even run `git merge`.
- **Project Context:** Scaffolding to continuously map the codebase architecture, giving AI agents exactly the context they need on initialization.

## Install

```sh
npm install --global omnibranch@0.2.1
omnibranch skill install --target auto --scope user
```

To install the skill without keeping the CLI globally:

```sh
npx omnibranch@0.2.1 skill install --target auto --scope user
```

See the [installation guide](docs/INSTALLATION.md) for source builds, project scope, provider paths, upgrades, and uninstall behavior.

## Five-minute skill setup

The OmniBranch skill is installed directly into your AI coding assistant. It teaches your AI how to orchestrate complex, parallel work in your repository securely. It enforces a strict safety contract so the AI knows to always use isolated worktrees, prevent overlapping edits, and request your approval before mutating files or pushing code.

Once installed, you can simply ask your AI to _"use OmniBranch to run a campaign for X"_, and the AI will handle the orchestration securely and deterministically.

## Supported skill targets

OmniBranch supports injecting skills into nearly any major agent:

- Codex
- Claude Code
- OpenCode
- Antigravity
- Generic Agent Skills

## Safety model

OmniBranch treats repository content, provider output, paths, environment variables, and remote responses as untrusted data. It does not allow arbitrary shell execution, force pushes, or destructive actions without explicit configurations.

## Documentation Hub

| Goal                                | Guide                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Install and run the first command   | [Getting started](docs/GETTING-STARTED.md)                                  |
| Understand components and data flow | [Architecture](docs/ARCHITECTURE.md)                                        |
| Configure a WorkspacePlan           | [Configuration](docs/CONFIGURATION.md)                                      |
| Explore practical commands          | [Examples](docs/EXAMPLES.md)                                                |
| Set up a contributor environment    | [Development](docs/DEVELOPMENT.md)                                          |
| Run or extend the test suite        | [Testing](docs/TESTING.md)                                                  |
| Upgrade or recover an installation  | [Upgrade](docs/UPGRADE.md) · [Rollback](docs/ROLLBACK.md)                   |
| Check provider and runtime support  | [Compatibility](docs/COMPATIBILITY.md) · [Limitations](docs/LIMITATIONS.md) |

## Contributing

Bug fixes, documentation, tests, adapters, security hardening, and focused design discussions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), then run:

```sh
pnpm verify
pnpm verify:release
```

## Security

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/MdAsifInIT/OmniBranch/security/advisories). Do not put credentials, production repository contents, or exploit details in public issues.

## License

OmniBranch is available under the [Apache License 2.0](LICENSE). Contributions are accepted under the same license.
