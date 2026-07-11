import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
          exclude: [
            '**/node_modules/**',
            '**/*.integration.test.ts',
            '**/*.contract.test.ts',
            '**/*.security.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'packages/*/src/**/*.integration.test.ts',
            'apps/*/src/**/*.integration.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'contracts',
          include: ['packages/*/src/**/*.contract.test.ts', 'apps/*/src/**/*.contract.test.ts'],
        },
      },
      {
        test: {
          name: 'security',
          include: ['packages/*/src/**/*.security.test.ts', 'apps/*/src/**/*.security.test.ts'],
        },
      },
    ],
  },
});
