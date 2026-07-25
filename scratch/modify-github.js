const fs = require('fs');
const path = 'packages/adapters/src/github.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace normalizeGitHubError
content = content.replace(
  /status === 422\n\s*\?\s*'validation'\n\s*:\s*'provider_error'/g,
  "status === 422 ? 'validation' : status === 429 ? 'rate_limited' : 'provider_error'"
);

content = content.replace(
  /function normalizeGitHubError\(error: unknown\): GitHubAdapterError \{[\s\S]+?return new GitHubAdapterError\([\s\S]+?\);\n\}/,
  \`function normalizeGitHubError(error: unknown): GitHubAdapterError {
  if (error instanceof GitHubAdapterError) return error;
  const candidate = error as { status?: unknown; message?: unknown; response?: { headers?: Record<string, string> } };
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
              : status === 429
                ? 'rate_limited'
                : 'provider_error';
  
  const adapterError = new GitHubAdapterError(
    code,
    typeof candidate.message === 'string' ? candidate.message : 'GitHub request failed',
    status,
  );
  if (candidate.response?.headers && candidate.response.headers['retry-after']) {
    (adapterError as any).retryAfter = candidate.response.headers['retry-after'];
  }
  return adapterError;
}\`
);

const withRetryMethod = \`
  private async request<T = unknown>(
    route: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<{ data: T }> {
    return this.withRetry(route, async () => {
      const response = await this.options.api.request(route, parameters);
      return { data: response.data as T };
    });
  }

  private async withRetry<T>(
    context: string,
    operation: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        const error = normalizeGitHubError(err);
        if (attempt < maxAttempts) {
          if (error.code === 'rate_limited') {
            const retryAfter = (error as any).retryAfter;
            const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          if (error.code === 'provider_error' && error.status && error.status >= 500) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * Math.pow(2, attempt)));
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }
\`;

content = content.replace(
  /async repositorySnapshot\(\): Promise<GitHubRepositorySnapshot> \{/,
  withRetryMethod + '\n\n  async repositorySnapshot(): Promise<GitHubRepositorySnapshot> {'
);

// Replace this.options.api.request with this.request
content = content.replace(/this\.options\.api\.request/g, 'this.request');

// Restore the one inside our request method
content = content.replace(/await this\.request\(route, parameters\);/, 'await this.options.api.request(route, parameters);');

fs.writeFileSync(path, content);
console.log('done');
