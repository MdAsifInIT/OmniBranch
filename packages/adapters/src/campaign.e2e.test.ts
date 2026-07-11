import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ExecaProcessRunner, FakeClock, SequenceIdGenerator } from '@omnibranch/platform';
import { LocalCampaignService } from '@omnibranch/runtime';

import { MockAiAdapter } from './index.js';

async function initializeRepository(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const runner = new ExecaProcessRunner();
  for (const args of [
    ['init', '--initial-branch', 'main'],
    ['config', 'user.email', 'fixture@omnibranch.invalid'],
    ['config', 'user.name', 'OmniBranch Fixture'],
    ['commit', '--allow-empty', '-m', 'root'],
  ]) {
    const result = await runner.run({ executable: 'git', args, cwd: directory });
    if (result.exitCode !== 0) throw new Error(result.stderr);
  }
}

describe('offline campaign vertical slice', () => {
  it('runs two isolated workers, validates evidence, reports, and resumes idempotently', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-campaign-'));
    const repository = path.join(root, 'repository');
    try {
      await initializeRepository(repository);
      const runner = new ExecaProcessRunner();
      const clock = new FakeClock(new Date('2026-07-12T00:00:00.000Z'));
      const service = new LocalCampaignService(
        repository,
        runner,
        clock,
        new SequenceIdGenerator('event'),
      );
      const campaign = await service.create('fixture');
      expect(await service.planFixture(campaign.campaignId)).toHaveLength(2);
      expect(await service.planFixture(campaign.campaignId)).toHaveLength(2);
      const results = await service.runFixture(
        campaign.campaignId,
        new MockAiAdapter(clock, new SequenceIdGenerator('mock')),
      );
      expect(results).toHaveLength(2);
      expect(results.every((result) => result.status === 'completed')).toBe(true);
      const status = await service.status(campaign.campaignId);
      expect(status.workItems).toHaveLength(2);
      expect(status.workItems.every((item) => item.status === 'succeeded')).toBe(true);
      const reports = await service.report(campaign.campaignId);
      expect(reports.json).toMatch(/report\.json$/);
      expect(reports.markdown).toMatch(/report\.md$/);
      expect(
        await service.runFixture(
          campaign.campaignId,
          new MockAiAdapter(clock, new SequenceIdGenerator('resume')),
        ),
      ).toEqual([]);
      expect((await service.reconcile())['applied']).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
