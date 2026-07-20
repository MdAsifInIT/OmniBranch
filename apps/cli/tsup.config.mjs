/* global URL */
import fs from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  env: {
    __APP_VERSION__: pkg.version,
  },
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
