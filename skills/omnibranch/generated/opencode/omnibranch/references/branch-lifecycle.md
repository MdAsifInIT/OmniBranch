# OmniBranch Branch Lifecycle Guide

OmniBranch manages work through ephemeral Git worktrees, keeping your main repository clone entirely clean and focused. This guide details how branches and worktrees are orchestrated during a campaign.

## The Campaign Sandbox

When a campaign starts, OmniBranch creates a dedicated sandbox for each parallel work item.

- **Path structure**: `.omnibranch/work/<campaign-id>/<work-item-id>`
- **Branch naming**: `omnibranch/work/<campaign-id>/<work-item-id>`

This isolation ensures that concurrent AI tasks do not overwrite each other or pollute the main working directory.

## Lifecycle Phases

1. **Provisioning (Lease Acquisition)**:
   The orchestrator acquires an exclusive lease for a work item. A new Git worktree is created, linked to a new branch branching off the target integration branch.
2. **Execution**:
   The AI agent executes the assigned task strictly within this isolated worktree.
3. **Commit & Validation**:
   Upon completion, the worktree state is committed. Automated validation hooks (tests, linting) are executed within the worktree context.
4. **Release (Lease Return)**:
   The lease is released, marking the work item as `succeeded` (or `failed` if validation didn't pass). The branch remains available for the final merge step.
5. **Cleanup**:
   Once the campaign is merged or abandoned, `omnibranch cleanup --campaign <id> --confirm` removes the worktree directories and deletes the branches, reclaiming disk space.

## Stale Worktrees

If an execution crashes or a lease expires unexpectedly, the worktree might be left behind. Use `omnibranch cleanup --stale --confirm` to safely garbage collect abandoned worktrees.
