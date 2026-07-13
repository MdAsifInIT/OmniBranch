/* global console, process */
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const arguments_ = ['pack', '--json'];
if (dryRun) arguments_.push('--dry-run');
else {
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  arguments_.push('--pack-destination', path.join(root, 'artifacts'));
}
const npmCli = await npmExecutableArguments(arguments_);
const child = spawn(npmCli.executable, npmCli.arguments, {
  cwd: path.join(root, 'apps', 'cli'),
  env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'omnibranch-npm-cache') },
  stdio: 'inherit',
  shell: false,
});
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
if (code !== 0) throw new Error(`npm pack failed with exit code ${code}`);
console.log(JSON.stringify({ ok: true, dryRun }));

async function npmExecutableArguments(arguments_) {
  if (process.platform !== 'win32') return { executable: 'npm', arguments: arguments_ };
  const npmCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  await access(npmCli);
  return { executable: process.execPath, arguments: [npmCli, ...arguments_] };
}
