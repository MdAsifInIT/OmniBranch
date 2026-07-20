# OmniBranch Task History Guide

The Task History feature maintains an append-only ledger of all campaigns executed within the repository, stored in `.omnibranch/task_history.md`. This provides a continuous audit trail of AI-driven changes, helping future agents understand the context and rationale behind past modifications.

## Commands

- `omnibranch history show`: Display a list of all recorded campaigns.
- `omnibranch history append --campaign <id>`: Manually write a campaign's outcome into the history log.
- `omnibranch history search <query>`: Search past campaigns by keyword, objective, or affected files.

## Ledger Format

The ledger is formatted as Markdown with YAML frontmatter for each entry, allowing both human readability and machine parsability:

```markdown
---
campaignId: 01H7GXY9ABCDEF
name: 'Refactor Authentication Module'
timestamp: '2026-07-20T10:00:00Z'
outcome: 'complete'
duration: 145000
---

## Refactor Authentication Module

**Objective:** Campaign Refactor Authentication Module

### Work Items

| ID      | Kind    | Summary           | Status    | Attempts |
| ------- | ------- | ----------------- | --------- | -------- |
| work-01 | fs.edit | Extract JWT logic | succeeded | 1        |

### Branches Touched

- `omnibranch/work/01H7GXY9ABCDEF/01`

### Files Changed

- `src/auth/jwt.ts`
```

## Usage Constraints

The ledger automatically rotates entries (FIFO) based on a configured `maxEntries` limit (default: 100) to prevent the file from growing indefinitely.
