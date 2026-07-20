# OmniBranch Project Documentation Guide

The Project Documentation feature maintains an up-to-date, AI-readable `project_context.md` file in the `.omnibranch` directory. This file serves as the definitive source of truth about the repository's structure, tech stack, conventions, and architectural decisions, helping AI developers reason about the codebase accurately.

## Commands

- `omnibranch docs generate`: Scans the repository and generates `.omnibranch/project_context.md` from scratch.
- `omnibranch docs update --campaign <id>`: Incrementally appends the outcome of a completed campaign to the bottom of the existing documentation file.

## Expected Content

A fully populated `project_context.md` contains the following sections:

1. **Repository Metadata**: Remote URLs, default branch, and basic statistics.
2. **Directory Structure**: High-level mapping of folders and their responsibilities.
3. **Tech Stack**: Detected languages and frameworks.
4. **Architecture Notes**: Extracted summaries from `README.md` or `ARCHITECTURE.md`.
5. **Branch Topology**: Current branch layout and active managed worktrees.
6. **Campaign History**: Pointers to the full `task_history.md`.
7. **Conventions**: Style guidelines extracted from configuration files (e.g., `.editorconfig`).

## Usage during Campaigns

AI agents should read `project_context.md` during the `preflight` or `discovery` phases of a new campaign to align their plans with existing repository conventions.
