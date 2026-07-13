/* global console, process */
import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const tarballs = (await readdir(path.join(root, 'artifacts')))
  .filter((name) => /^omnibranch-0\.2\.0\.tgz$/.test(name))
  .sort();
if (tarballs.length !== 1) throw new Error('Expected exactly one omnibranch 0.2.0 npm tarball.');
const tarball = path.join(root, 'artifacts', tarballs[0]);
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'omnibranch-package-'));
const prefix = path.join(sandbox, 'prefix');
const home = path.join(sandbox, 'home');
try {
  await run('npm', [
    'install',
    '--prefix',
    prefix,
    '--no-package-lock',
    '--prefer-offline',
    tarball,
  ]);
  const binary = path.join(
    prefix,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'omnibranch.cmd' : 'omnibranch',
  );
  await access(binary);
  const environment = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: path.join(home, '.codex'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    npm_config_cache: path.join(os.tmpdir(), 'omnibranch-npm-cache'),
  };
  const version = (await run(binary, ['--version'], environment)).trim();
  if (version !== '0.2.0') throw new Error(`Unexpected package version: ${version}`);
  await json(binary, ['skill', 'targets', '--scope', 'user', '--json'], environment);
  await json(
    binary,
    ['skill', 'install', '--target', 'agents', '--scope', 'user', '--dry-run', '--json'],
    environment,
  );
  await json(
    binary,
    ['skill', 'install', '--target', 'agents', '--scope', 'user', '--json'],
    environment,
  );
  await json(
    binary,
    ['skill', 'doctor', '--target', 'agents', '--scope', 'user', '--json'],
    environment,
  );
  await json(
    binary,
    ['skill', 'uninstall', '--target', 'agents', '--scope', 'user', '--json'],
    environment,
  );
  await json(
    binary,
    ['skill', 'rollback', '--target', 'agents', '--scope', 'user', '--json'],
    environment,
  );
  await json(
    binary,
    ['skill', 'uninstall', '--target', 'agents', '--scope', 'user', '--json'],
    environment,
  );
  console.log(JSON.stringify({ ok: true, tarball: path.basename(tarball), version }));
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

async function json(executable, arguments_, environment) {
  const output = await run(executable, arguments_, environment);
  const envelope = JSON.parse(output);
  if (envelope.ok !== true) throw new Error(`Package command failed: ${output}`);
  return envelope;
}

async function run(executable, arguments_, environment = process.env) {
  let command = executable;
  let resolvedArguments = [...arguments_];
  if (process.platform === 'win32' && executable === 'npm') {
    command = process.execPath;
    resolvedArguments = [
      path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      ...arguments_,
    ];
  } else if (process.platform === 'win32' && executable.endsWith('.cmd')) {
    command = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
    resolvedArguments = ['/d', '/c', 'call', executable, ...arguments_];
  }
  const child = spawn(command, resolvedArguments, {
    env: {
      ...environment,
      npm_config_cache:
        environment.npm_config_cache ?? path.join(os.tmpdir(), 'omnibranch-npm-cache'),
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`${command} exited ${code}: ${stderr || stdout}`);
  return stdout;
}
