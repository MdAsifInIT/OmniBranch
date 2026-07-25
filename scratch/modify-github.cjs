const fs = require('fs');
const path = 'packages/adapters/src/github.ts';
let content = fs.readFileSync(path, 'utf8');

const withRetryMethod = `
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
`;

content = content.replace(
  /async repositorySnapshot\(\): Promise<GitHubRepositorySnapshot> \{/,
  withRetryMethod + '\n\n  async repositorySnapshot(): Promise<GitHubRepositorySnapshot> {'
);

content = content.replaceAll('this.options.api.request', 'this.request');

// Restore the one inside our request method
content = content.replace(/await this\.request\(route, parameters\);/, 'await this.options.api.request(route, parameters);');

fs.writeFileSync(path, content);
console.log('done');
