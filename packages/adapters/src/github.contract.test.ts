import { describe, expect, it } from 'vitest';

import type { Approval, ApprovalId } from '@omnibranch/contracts';

import { GitHubAdapterError, GitHubScmAdapter, type GitHubApi } from './github.js';

class FakeGitHubApi implements GitHubApi {
  readonly calls: { route: string; parameters: Readonly<Record<string, unknown>> }[] = [];
  readonly responses = new Map<string, unknown>();

  async request(
    route: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown }> {
    this.calls.push({ route, parameters });
    const response = this.responses.get(route);
    if (response instanceof Error) throw response;
    if (response === undefined)
      throw Object.assign(new Error(`Missing fake for ${route}`), { status: 404 });
    return { data: response };
  }
}

const approval = (targetId = 'campaign-1:pr'): Approval => ({
  approvalId: 'approval-1' as ApprovalId,
  targetId,
  action: 'scm_mutation',
  requester: 'worker-1',
  approverClass: 'human',
  createdAt: '2026-07-12T00:00:00.000Z',
  expiresAt: '2026-07-13T00:00:00.000Z',
  decision: 'granted',
  decidedBy: 'operator-1',
});

function pull(body: string) {
  return {
    number: 7,
    state: 'open',
    draft: true,
    mergeable: null,
    head: { ref: 'omnibranch/item-1' },
    base: { ref: 'main' },
    html_url: 'https://github.test/acme/repo/pull/7',
    body,
  };
}

describe('GitHubScmAdapter', () => {
  it('probes identity and repository permissions', async () => {
    const api = new FakeGitHubApi();
    api.responses.set('GET /user', { login: 'octo' });
    api.responses.set('GET /repos/{owner}/{repo}', {
      default_branch: 'trunk',
      permissions: { pull: true, push: false },
    });
    const adapter = new GitHubScmAdapter({ owner: 'acme', repository: 'repo', api });
    await expect(adapter.probe()).resolves.toEqual({
      authenticated: true,
      repository: 'acme/repo',
    });
    await expect(adapter.repositorySnapshot()).resolves.toMatchObject({
      authenticatedAs: 'octo',
      defaultBranch: 'trunk',
      permissions: { pull: true, push: false },
    });
  });

  it('plans a mutation without making a request', async () => {
    const api = new FakeGitHubApi();
    const adapter = new GitHubScmAdapter({ owner: 'acme', repository: 'repo', api });
    await expect(adapter.plan('draft_pr', { correlationId: 'campaign-1:pr' })).resolves.toEqual({
      changed: false,
      dryRun: true,
      operations: [{ executable: 'github-api', args: ['draft_pr', 'acme/repo', 'campaign-1:pr'] }],
    });
    expect(api.calls).toHaveLength(0);
  });

  it('returns an existing correlated draft PR without creating a duplicate', async () => {
    const api = new FakeGitHubApi();
    api.responses.set('GET /repos/{owner}/{repo}/pulls', [
      pull('<!-- omnibranch-correlation:campaign-1:pr -->'),
    ]);
    const adapter = new GitHubScmAdapter({
      owner: 'acme',
      repository: 'repo',
      api,
      now: () => new Date('2026-07-12T12:00:00Z'),
    });
    const result = await adapter.execute(
      'draft_pr',
      { correlationId: 'campaign-1:pr', title: 'Change', head: 'omnibranch/item-1', base: 'main' },
      approval(),
    );
    expect(result).toMatchObject({ created: false, duplicate: true });
    expect(api.calls.map((call) => call.route)).toEqual(['GET /repos/{owner}/{repo}/pulls']);
  });

  it('creates a draft PR with immutable correlation metadata', async () => {
    const api = new FakeGitHubApi();
    api.responses.set('GET /repos/{owner}/{repo}/pulls', []);
    api.responses.set('POST /repos/{owner}/{repo}/pulls', pull('created'));
    const adapter = new GitHubScmAdapter({
      owner: 'acme',
      repository: 'repo',
      api,
      now: () => new Date('2026-07-12T12:00:00Z'),
    });
    await expect(
      adapter.execute(
        'draft_pr',
        {
          correlationId: 'campaign-1:pr',
          title: 'Change',
          head: 'omnibranch/item-1',
          base: 'main',
          body: 'Evidence',
        },
        approval(),
      ),
    ).resolves.toMatchObject({ created: true, duplicate: false });
    expect(api.calls[1]?.parameters['draft']).toBe(true);
    expect(api.calls[1]?.parameters['body']).toContain('omnibranch-correlation:campaign-1:pr');
  });

  it('rejects expired, mismatched, and self approvals before network access', async () => {
    const api = new FakeGitHubApi();
    const adapter = new GitHubScmAdapter({
      owner: 'acme',
      repository: 'repo',
      api,
      now: () => new Date('2026-07-14T00:00:00Z'),
    });
    const input = { correlationId: 'campaign-1:pr', title: 'Change', head: 'topic', base: 'main' };
    await expect(adapter.execute('draft_pr', input, approval())).rejects.toMatchObject({
      code: 'approval_expired',
    });
    await expect(
      adapter.execute('draft_pr', input, {
        ...approval('wrong'),
        expiresAt: '2026-07-15T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'approval_scope_mismatch' });
    await expect(
      adapter.execute('draft_pr', input, {
        ...approval(),
        expiresAt: '2026-07-15T00:00:00.000Z',
        decidedBy: 'worker-1',
      }),
    ).rejects.toMatchObject({ code: 'self_approval' });
    expect(api.calls).toHaveLength(0);
  });

  it('normalizes and redacts provider failures', async () => {
    const api = new FakeGitHubApi();
    api.responses.set(
      'GET /user',
      Object.assign(new Error('Bearer github_pat_secret123456 denied'), { status: 401 }),
    );
    api.responses.set('GET /repos/{owner}/{repo}', { default_branch: 'main', permissions: {} });
    const adapter = new GitHubScmAdapter({ owner: 'acme', repository: 'repo', api });
    await expect(adapter.probe()).resolves.toEqual({
      authenticated: false,
      repository: 'acme/repo',
    });
    try {
      await adapter.repositorySnapshot();
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubAdapterError);
      expect(String(error)).not.toContain('github_pat_secret123456');
    }
  });
});
