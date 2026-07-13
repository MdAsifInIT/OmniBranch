import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  outExtension: () => ({ js: '.cjs' }),
  dts: false,
  external: ['better-sqlite3'],
  noExternal: [
    /^@omnibranch\//,
    '@octokit/rest',
    'ajv',
    'ajv-formats',
    'commander',
    'execa',
    'picomatch',
    'pino',
    'yaml',
  ],
});
