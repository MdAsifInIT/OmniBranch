import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import pino, { type Logger } from 'pino';

import type {
  ArtifactId,
  EventId,
  PolicyDecisionId,
  RunId,
  WorkItemId,
} from '@omnibranch/contracts';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  public constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export interface IdGenerator {
  next(): string;
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  public constructor(private readonly prefix = 'id') {}

  next(): string {
    this.index += 1;
    return `${this.prefix}-${String(this.index).padStart(4, '0')}`;
  }
}

export const ids = {
  event: (value: string): EventId => value as EventId,
  run: (value: string): RunId => value as RunId,
  workItem: (value: string): WorkItemId => value as WorkItemId,
  artifact: (value: string): ArtifactId => value as ArtifactId,
  policyDecision: (value: string): PolicyDecisionId => value as PolicyDecisionId,
};

export interface ProcessRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly input?: string;
  readonly reject?: boolean;
  readonly signal?: AbortSignal;
}

export interface ProcessResult {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export class ExecaProcessRunner implements ProcessRunner {
  public constructor(private readonly clock: Clock = new SystemClock()) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.executable.trim().length === 0) {
      throw new Error('Executable must not be empty');
    }
    if (request.args.some((argument) => argument.includes('\u0000'))) {
      throw new Error('Process arguments must not contain NUL bytes');
    }
    const started = this.clock.now().getTime();
    const result = await execa(request.executable, [...request.args], {
      cwd: request.cwd,
      reject: request.reject ?? false,
      shell: false,
      windowsHide: true,
      ...(request.env === undefined ? {} : { env: { ...request.env } }),
      ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs }),
      ...(request.input === undefined ? {} : { input: request.input }),
      ...(request.signal === undefined ? {} : { cancelSignal: request.signal }),
    });
    const exitCode = result.exitCode ?? (result.failed ? 1 : 0);
    return {
      executable: request.executable,
      args: request.args,
      cwd: request.cwd,
      exitCode,
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
      durationMs: Math.max(0, this.clock.now().getTime() - started),
      timedOut: result.timedOut,
    };
  }
}

export function normalizeRepositoryPath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`Unsafe repository-relative path: ${value}`);
  }
  return path.posix.normalize(normalized);
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function canonicalPathInside(root: string, candidate: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const resolvedCandidate = path.resolve(canonicalRoot, candidate);
  const existingParent = await nearestExistingParent(resolvedCandidate);
  const canonicalParent = await realpath(existingParent);
  const remainder = path.relative(existingParent, resolvedCandidate);
  const canonicalCandidate = path.resolve(canonicalParent, remainder);
  if (!isPathInside(canonicalRoot, canonicalCandidate)) {
    throw new Error(`Path escapes allowed root: ${candidate}`);
  }
  return canonicalCandidate;
}

async function nearestExistingParent(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      await stat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`No existing parent for ${candidate}`);
      current = parent;
    }
  }
}

export async function atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  const directoryHandle = await open(directory, 'r');
  try {
    await directoryHandle.sync().catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPERM' && error.code !== 'EINVAL') throw error;
    });
  } finally {
    await directoryHandle.close();
  }
}

export class FileMutex {
  private handle: Awaited<ReturnType<typeof open>> | undefined;

  public constructor(
    private readonly lockPath: string,
    private readonly staleAfterMs = 60_000,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async acquire(owner: string): Promise<void> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    try {
      this.handle = await open(this.lockPath, 'wx', 0o600);
    } catch (error) {
      if (await this.isStale()) {
        await unlink(this.lockPath);
        this.handle = await open(this.lockPath, 'wx', 0o600);
      } else {
        throw new Error(`Resource is locked: ${this.lockPath}`, { cause: error });
      }
    }
    await this.handle.writeFile(
      JSON.stringify({ owner, pid: process.pid, createdAt: this.clock.now().toISOString() }),
    );
    await this.handle.sync();
  }

  async release(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
    await unlink(this.lockPath).catch(() => undefined);
  }

  private async isStale(): Promise<boolean> {
    try {
      const information = await stat(this.lockPath);
      return this.clock.now().getTime() - information.mtimeMs > this.staleAfterMs;
    } catch {
      return false;
    }
  }
}

const SECRET_PATTERNS = [
  /\b(?:ghp|github_pat|sk|xox[baprs])_[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /([?&](?:token|key|signature|sig)=)[^&\s]+/gi,
];

export function redact(value: string, explicitSecrets: readonly string[] = []): string {
  let redacted = value;
  for (const secret of explicitSecrets) {
    if (secret.length >= 4) redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, '[REDACTED]');
  return redacted;
}

export function stableHash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createLogger(destination?: string): Logger {
  return pino(
    {
      level: process.env['OMNIBRANCH_LOG_LEVEL'] ?? 'info',
      redact: {
        paths: [
          'token',
          '*.token',
          'authorization',
          '*.authorization',
          'password',
          '*.password',
          'secret',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
    },
    destination === undefined ? undefined : pino.destination(destination),
  );
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function hostFacts(): Readonly<Record<string, string>> {
  return {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    hostname: os.hostname(),
  };
}

export async function safeCreateFile(filePath: string, contents: string): Promise<boolean> {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const handle = await open(filePath, 'wx', 0o600);
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

export async function overwriteFile(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, contents, { encoding: 'utf8', mode: 0o600 });
}
