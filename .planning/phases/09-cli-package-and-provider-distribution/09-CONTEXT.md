# Phase 9 Context

OmniBranch 0.2 ships one public Node 22 package named `omnibranch`. The package must bundle all internal TypeScript packages and JavaScript dependencies, keep only `better-sqlite3@12.11.1` external, expose the existing CLI plus the installer lifecycle, and embed the canonical skill tree.

Provider layouts are generated copies of the complete canonical `omnibranch` directory with `SKILL.md` as the entrypoint. Codex metadata uses `display_name`, `short_description`, and `default_prompt`. Claude also receives a repository-subdirectory plugin and root marketplace catalog.

No package, tag, release, or marketplace mutation is authorized.
