import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { withTemporaryDirectory } from '@omnibranch/test-kit';

import { loadWorkspacePlan } from './config.js';

const valid = `apiVersion: omnibranch.dev/v1alpha1
kind: WorkspacePlan
metadata: { name: fixture }
runtime:
  workspaceRoot: .
  tempRoot: \${gitCommonDir}/omnibranch/tmp
  worktreeRoot: \${repoParent}/worktrees/\${metadata.name}
branchTopology:
  trunk: main
  integrationBranches: [{ name: integration, protect: true }]
  laneBranches:
    routine: { prefix: omnibranch/routine/, base: integration, ephemeral: false }
  attemptBranches: { prefix: omnibranch/work/, baseFromLane: true }
lanes:
  routine: { branchClass: routine }
ownership:
  sets:
    source: { globs: [src/**], lanes: [routine] }
commands:
  validate:
    - id: test
      run: { windows: pnpm test, posix: pnpm test }
policies: {}
adapters: {}
state:
  projection: { backend: sqlite, path: "\${gitCommonDir}/omnibranch/state.db" }
  eventStore: { backend: jsonl, path: "\${gitCommonDir}/omnibranch/events.jsonl" }
reporting:
  outputRoot: \${gitCommonDir}/omnibranch/reports
`;

describe('WorkspacePlan configuration', () => {
  it('applies conservative defaults and validates semantics', async () => {
    await withTemporaryDirectory('omnibranch-config-', async (directory) => {
      await mkdir(path.join(directory, '.git'), { recursive: true });
      const filePath = path.join(directory, 'workspace.yaml');
      await writeFile(filePath, valid);
      const result = await loadWorkspacePlan(filePath);
      expect(result.valid).toBe(true);
      expect(result.plan?.runtime.dryRunDefault).toBe(true);
      expect(result.plan?.policies.defaultAction).toBe('require_approval');
    });
  });

  it('rejects unknown top-level keys with actionable diagnostics', async () => {
    await withTemporaryDirectory('omnibranch-config-', async (directory) => {
      const filePath = path.join(directory, 'workspace.yaml');
      await writeFile(filePath, `${valid}\nunknown: true\n`);
      const result = await loadWorkspacePlan(filePath);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((item) => item.rule === 'additionalProperties')).toBe(true);
    });
  });
});
