# OmniBranch Merge Guide

When a campaign completes and its branches are ready for integration, OmniBranch generates a precise, context-aware `merge_guide.md` in `.omnibranch/merge-guides/<campaign-id>.md`.

## Commands

- `omnibranch merge-guide generate --campaign <id>`: Produce the markdown guide for a specific campaign.
- `omnibranch merge-guide validate --campaign <id>`: Check if the campaign's branches exist and are ready for merging (all work items succeeded).

## Guide Contents

The generated guide contains:
1. **Branch Topology Overview**: The source branches and the target integration branch.
2. **Predicted Conflict Risk**: Analysis of potential merge conflicts based on file ownership overlaps.
3. **Pre-Merge Checklist**: Prerequisites (e.g., passing CI, successful validation).
4. **Step-by-Step Execution**: Copy-pasteable Git commands to perform the merge (fast-forward, squash, or merge commit depending on the detected strategy).
5. **Post-Merge Verification**: Steps to ensure the integration succeeded without regressions.
6. **Rollback Instructions**: Commands to abort or revert the merge if issues arise.

## Human Handoff

Since OmniBranch primarily operates via isolated worktrees and leaves the final merge decision to humans, this guide acts as the definitive handover artifact from the AI to the developer.
