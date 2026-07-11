import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AssignmentEnvelope, Lease } from '@omnibranch/contracts';
import { FakeClock, ids, SequenceIdGenerator } from '@omnibranch/platform';

import { MockAiAdapter } from './index.js';

function assignment(root: string, mode = 'complete'): AssignmentEnvelope {
  const lease: Lease = {
    leaseId: 'lease-1' as never,
    workItemId: ids.workItem('work-1'),
    workerId: 'worker-1' as never,
    issuedAt: '2026-07-12T00:00:00.000Z',
    expiresAt: '2026-07-12T00:10:00.000Z',
    heartbeatDeadline: '2026-07-12T00:01:00.000Z',
    attempt: 1,
    lockReferences: ['output.txt'],
  };
  return {
    assignmentId: 'assignment-1',
    runId: ids.run('run-1'),
    workItemId: ids.workItem('work-1'),
    objective: 'Write deterministic output.',
    scope: {
      allowedPaths: ['output.txt'],
      forbiddenPaths: ['.git/**'],
      repositoryRoot: root,
      writeAllowed: true,
    },
    constraints: [],
    context: { mode, outputPath: 'output.txt', contents: 'ok\n' },
    validation: ['output.txt matches'],
    escalation: ['return blocked'],
    lease,
  };
}

describe('MockAiAdapter contract', () => {
  it('probes, prepares, runs, collects, resumes, and cancels normalized results', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-mock-'));
    try {
      const adapter = new MockAiAdapter(
        new FakeClock(new Date('2026-07-12T00:00:00.000Z')),
        new SequenceIdGenerator('mock'),
      );
      expect((await adapter.probe()).tier).toBe(1);
      const prepared = await adapter.prepare(assignment(directory));
      const handle = await adapter.launch(prepared);
      expect(await adapter.resume(handle)).toEqual(handle);
      const result = await adapter.collect(handle);
      expect(result.status).toBe('completed');
      expect(result.assignmentEcho.workItemId).toBe(ids.workItem('work-1'));
      expect(result.artifacts).toHaveLength(1);
      expect(await readFile(path.join(directory, 'output.txt'), 'utf8')).toBe('ok\n');
      expect((await adapter.cancel(handle)).status).toBe('cancelled');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['partial', 'partial'],
    ['blocked', 'blocked'],
    ['failed', 'failed'],
  ] as const)('normalizes %s disposition', async (mode, expected) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-mock-'));
    try {
      const adapter = new MockAiAdapter();
      const result = await adapter.collect(
        await adapter.launch(await adapter.prepare(assignment(directory, mode))),
      );
      expect(result.status).toBe(expected);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails clearly on malformed output', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-mock-'));
    try {
      const adapter = new MockAiAdapter();
      const handle = await adapter.launch(
        await adapter.prepare(assignment(directory, 'malformed')),
      );
      await expect(adapter.collect(handle)).rejects.toThrow(/malformed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
