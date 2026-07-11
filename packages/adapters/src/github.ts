import { Octokit } from '@octokit/rest';

import type { Approval, MutationResult, ScmAdapter } from '@omnibranch/contracts';
import { redact } from '@omnibranch/platform';

import type { GitPushExecutor } from './github-push.js';

export interface GitHubApi {
  request(route: string, parameters: Readonly<Record<string, unknown>>): Promise<{ data: unknown }>;
}

export class OctokitGitHubApi implements GitHubApi {
  private readonly octokit: Octokit;

  public constructor(token: string, baseUrl?: string) {
    this.octokit = new Octokit({ auth: token, ...(baseUrl === undefined ? {} : { baseUrl }) });
  }

  async request(
    route: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown }> {
    const response = await this.octokit.request(route, { ...parameters });
    return { data: response.data };
  }
}

export interface GitHubAdapterOptions {
  readonly owner: string;
  readonly repository: string;
  readonly api: GitHubApi;
  readonly pusher?: GitPushExecutor;
  readonly now?: () => Date;
}

export interface GitHubRepositorySnapshot {
  readonly repository: string;
  readonly authenticatedAs: string;
  readonly permissions: Readonly<Record<string, boolean>>;
  readonly defaultBranch: string;
}

export interface GitHubRefSnapshot {
  readonly ref: string;
  readonly oid: string;
}

export interface GitHubPullRequestSnapshot {
  readonly number: number;
  readonly state: string;
  readonly draft: boolean;
  readonly mergeable: boolean | null;
  readonly head: string;
  readonly base: string;
  readonly url: string;
}

export interface GitHubCheckSnapshot {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
}

export class GitHubAdapterError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(redact(message));
    this.name = 'GitHubAdapterError';
  }
}

const MUTATIONS = new Set(['push', 'draft_pr', 'label', 'comment', 'review', 'promote']);
const CORRELATION_PREFIX = '<!-- omnibranch-correlation:';

export class GitHubScmAdapter implements ScmAdapter {
  private readonly now: () => Date;

  public constructor(private readonly options: GitHubAdapterOptions) {
    this.now = options.now ?? (() => new Date());
    if (!options.owner || !options.repository)
      throw new Error('GitHub owner and repository are required');
  }

  async probe(): Promise<{ authenticated: boolean; repository: string }> {
    try {
      await this.repositorySnapshot();
      return { authenticated: true, repository: this.slug };
    } catch (error) {
      if (error instanceof GitHubAdapterError && error.code === 'authentication') {
        return { authenticated: false, repository: this.slug };
      }
      throw error;
    }
  }

  async repositorySnapshot(): Promise<GitHubRepositorySnapshot> {
    try {
      const [userResponse, repositoryResponse] = await Promise.all([
        this.options.api.request('GET /user', {}),
        this.options.api.request('GET /repos/{owner}/{repo}', this.repoParameters()),
      ]);
      const user = record(userResponse.data);
      const repository = record(repositoryResponse.data);
      return {
        repository: this.slug,
        authenticatedAs: stringValue(user, 'login'),
        permissions: booleanRecord(repository['permissions']),
        defaultBranch: stringValue(repository, 'default_branch'),
      };
    } catch (error) {
      throw normalizeGitHubError(error);
    }
  }

  async ref(reference: string): Promise<GitHubRefSnapshot> {
    try {
      const response = await this.options.api.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        ...this.repoParameters(),
        ref: normalizeRef(reference),
      });
      const data = record(response.data);
      return { ref: stringValue(data, 'ref'), oid: stringValue(record(data['object']), 'sha') };
    } catch (error) {
      throw normalizeGitHubError(error);
    }
  }

  async pullRequest(number: number): Promise<GitHubPullRequestSnapshot> {
    try {
      const response = await this.options.api.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}',
        {
          ...this.repoParameters(),
          pull_number: number,
        },
      );
      return normalizePullRequest(response.data);
    } catch (error) {
      throw normalizeGitHubError(error);
    }
  }

  async checks(reference: string): Promise<readonly GitHubCheckSnapshot[]> {
    try {
      const response = await this.options.api.request(
        'GET /repos/{owner}/{repo}/commits/{ref}/check-runs',
        { ...this.repoParameters(), ref: reference },
      );
      const data = record(response.data);
      return arrayValue(data, 'check_runs').map((item) => {
        const check = record(item);
        return {
          name: stringValue(check, 'name'),
          status: stringValue(check, 'status'),
          conclusion: nullableString(check['conclusion']),
        };
      });
    } catch (error) {
      throw normalizeGitHubError(error);
    }
  }

  async branchProtection(branch: string): Promise<Readonly<Record<string, unknown>> | null> {
    try {
      const response = await this.options.api.request(
        'GET /repos/{owner}/{repo}/branches/{branch}/protection',
        { ...this.repoParameters(), branch },
      );
      return record(response.data);
    } catch (error) {
      const normalized = normalizeGitHubError(error);
      if (normalized.status === 404) return null;
      throw normalized;
    }
  }

  async plan(action: string, input: Readonly<Record<string, unknown>>): Promise<MutationResult> {
    validateMutation(action, input);
    return {
      changed: false,
      dryRun: true,
      operations: [
        {
          executable: 'github-api',
          args: [action, this.slug, correlation(input)],
        },
      ],
    };
  }

  async execute(
    action: string,
    input: Readonly<Record<string, unknown>>,
    approval: Approval,
  ): Promise<Readonly<Record<string, unknown>>> {
    validateMutation(action, input);
    this.assertApproval(input, approval);
    try {
      switch (action) {
        case 'push':
          return await this.push(input);
        case 'draft_pr':
          return await this.createDraftPullRequest(input);
        case 'label':
          return await this.addLabels(input);
        case 'comment':
          return await this.comment(input);
        case 'review':
          return await this.review(input);
        case 'promote':
          return await this.promote(input);
        default:
          throw new GitHubAdapterError(
            'unsupported_action',
            `Unsupported GitHub action: ${action}`,
          );
      }
    } catch (error) {
      throw normalizeGitHubError(error);
    }
  }

  private async push(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (this.options.pusher === undefined) {
      throw new GitHubAdapterError('push_unavailable', 'No safe Git push executor is configured');
    }
    return await this.options.pusher.push({
      repositoryRoot: requiredString(input, 'repositoryRoot'),
      remote: requiredString(input, 'remote'),
      sourceRef: requiredString(input, 'sourceRef'),
      destinationRef: requiredString(input, 'destinationRef'),
      expectedRemoteOid: requiredString(input, 'expectedRemoteOid'),
    });
  }

  private async createDraftPullRequest(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const marker = correlationMarker(correlation(input));
    const head = requiredString(input, 'head');
    const existingResponse = await this.options.api.request('GET /repos/{owner}/{repo}/pulls', {
      ...this.repoParameters(),
      state: 'open',
      head: `${this.options.owner}:${head}`,
      base: requiredString(input, 'base'),
    });
    const existing = asArray(existingResponse.data)
      .map(record)
      .find((pull) => nullableString(pull['body'])?.includes(marker) === true);
    if (existing !== undefined) {
      return { created: false, duplicate: true, pullRequest: normalizePullRequest(existing) };
    }
    const response = await this.options.api.request('POST /repos/{owner}/{repo}/pulls', {
      ...this.repoParameters(),
      title: requiredString(input, 'title'),
      head,
      base: requiredString(input, 'base'),
      body: `${optionalString(input, 'body') ?? ''}\n\n${marker}`.trim(),
      draft: true,
    });
    return { created: true, duplicate: false, pullRequest: normalizePullRequest(response.data) };
  }

  private async addLabels(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const labels = input['labels'];
    if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) {
      throw new GitHubAdapterError('invalid_input', 'labels must be an array of strings');
    }
    const response = await this.options.api.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      { ...this.repoParameters(), issue_number: requiredNumber(input, 'number'), labels },
    );
    return { labels: response.data };
  }

  private async comment(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const response = await this.options.api.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        ...this.repoParameters(),
        issue_number: requiredNumber(input, 'number'),
        body: `${requiredString(input, 'body')}\n\n${correlationMarker(correlation(input))}`,
      },
    );
    return { comment: response.data };
  }

  private async review(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const event = requiredString(input, 'event');
    if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
      throw new GitHubAdapterError('invalid_input', `Unsupported review event: ${event}`);
    }
    const response = await this.options.api.request(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      {
        ...this.repoParameters(),
        pull_number: requiredNumber(input, 'number'),
        event,
        body: `${optionalString(input, 'body') ?? ''}\n\n${correlationMarker(correlation(input))}`.trim(),
      },
    );
    return { review: response.data };
  }

  private async promote(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const response = await this.options.api.request(
      'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
      {
        ...this.repoParameters(),
        pull_number: requiredNumber(input, 'number'),
        sha: requiredString(input, 'expectedHeadOid'),
        merge_method: optionalString(input, 'mergeMethod') ?? 'squash',
      },
    );
    return { promotion: response.data };
  }

  private assertApproval(input: Readonly<Record<string, unknown>>, approval: Approval): void {
    if (approval.action !== 'scm_mutation' || approval.decision !== 'granted') {
      throw new GitHubAdapterError(
        'approval_required',
        'A granted SCM mutation approval is required',
      );
    }
    if (approval.targetId !== correlation(input)) {
      throw new GitHubAdapterError(
        'approval_scope_mismatch',
        'Approval does not match mutation correlation',
      );
    }
    if (
      approval.expiresAt !== undefined &&
      Date.parse(approval.expiresAt) <= this.now().getTime()
    ) {
      throw new GitHubAdapterError('approval_expired', 'Approval has expired');
    }
    if (approval.requester === approval.decidedBy) {
      throw new GitHubAdapterError(
        'self_approval',
        'Mutation requester cannot approve their own action',
      );
    }
  }

  private repoParameters(): Readonly<Record<string, string>> {
    return { owner: this.options.owner, repo: this.options.repository };
  }

  private get slug(): string {
    return `${this.options.owner}/${this.options.repository}`;
  }
}

function validateMutation(action: string, input: Readonly<Record<string, unknown>>): void {
  if (!MUTATIONS.has(action))
    throw new GitHubAdapterError('unsupported_action', `Unsupported GitHub action: ${action}`);
  correlation(input);
}

function correlation(input: Readonly<Record<string, unknown>>): string {
  const value = requiredString(input, 'correlationId');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) {
    throw new GitHubAdapterError('invalid_correlation', 'Invalid correlation identifier');
  }
  return value;
}

function correlationMarker(value: string): string {
  return `${CORRELATION_PREFIX}${value} -->`;
}

function normalizeRef(value: string): string {
  const normalized = value.replace(/^refs\//, '');
  if (!/^(heads|tags)\/[A-Za-z0-9._/-]+$/.test(normalized) || normalized.includes('..')) {
    throw new GitHubAdapterError('invalid_ref', `Invalid GitHub ref: ${value}`);
  }
  return normalized;
}

function normalizePullRequest(value: unknown): GitHubPullRequestSnapshot {
  const pull = record(value);
  return {
    number: numberValue(pull, 'number'),
    state: stringValue(pull, 'state'),
    draft: pull['draft'] === true,
    mergeable: pull['mergeable'] === null ? null : pull['mergeable'] === true,
    head: stringValue(record(pull['head']), 'ref'),
    base: stringValue(record(pull['base']), 'ref'),
    url: stringValue(pull, 'html_url'),
  };
}

function normalizeGitHubError(error: unknown): GitHubAdapterError {
  if (error instanceof GitHubAdapterError) return error;
  const candidate = error as { status?: unknown; message?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  const code =
    status === 401
      ? 'authentication'
      : status === 403
        ? 'permission'
        : status === 404
          ? 'not_found'
          : status === 409
            ? 'conflict'
            : status === 422
              ? 'validation'
              : 'provider_error';
  return new GitHubAdapterError(
    code,
    typeof candidate.message === 'string' ? candidate.message : 'GitHub request failed',
    status,
  );
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GitHubAdapterError('malformed_response', 'GitHub returned a malformed object');
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value))
    throw new GitHubAdapterError('malformed_response', 'GitHub returned a malformed list');
  return value;
}

function stringValue(value: Readonly<Record<string, unknown>>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string')
    throw new GitHubAdapterError('malformed_response', `GitHub response is missing ${key}`);
  return result;
}

function numberValue(value: Readonly<Record<string, unknown>>, key: string): number {
  const result = value[key];
  if (typeof result !== 'number')
    throw new GitHubAdapterError('malformed_response', `GitHub response is missing ${key}`);
  return result;
}

function arrayValue(value: Readonly<Record<string, unknown>>, key: string): readonly unknown[] {
  return asArray(value[key]);
}

function booleanRecord(value: unknown): Readonly<Record<string, boolean>> {
  const source = record(value);
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function requiredString(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new GitHubAdapterError('invalid_input', `${key} must be a non-empty string`);
  return value;
}

function optionalString(input: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    throw new GitHubAdapterError('invalid_input', `${key} must be a string`);
  return value;
}

function requiredNumber(input: Readonly<Record<string, unknown>>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    throw new GitHubAdapterError('invalid_input', `${key} must be a positive integer`);
  return value;
}
