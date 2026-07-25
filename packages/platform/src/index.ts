import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, stat, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import pino, { type Logger } from 'pino';

export type { Logger };

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

export class BoundedRingBuffer {
  private chunks: Buffer[] = [];
  private currentBytes = 0;

  public constructor(private readonly maxBytes: number = 10 * 1024 * 1024) {
    if (maxBytes <= 0) {
      throw new Error('maxBytes must be positive');
    }
  }

  public append(data: string | Uint8Array): void {
    const buf =
      typeof data === 'string'
        ? Buffer.from(data, 'utf8')
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength);

    if (buf.length === 0) return;

    if (buf.length >= this.maxBytes) {
      this.chunks = [buf.subarray(buf.length - this.maxBytes)];
      this.currentBytes = this.maxBytes;
      return;
    }

    this.chunks.push(buf);
    this.currentBytes += buf.length;

    while (this.currentBytes > this.maxBytes && this.chunks.length > 0) {
      const overflow = this.currentBytes - this.maxBytes;
      const head = this.chunks[0]!;
      if (head.length <= overflow) {
        this.currentBytes -= head.length;
        this.chunks.shift();
      } else {
        this.chunks[0] = head.subarray(overflow);
        this.currentBytes -= overflow;
        break;
      }
    }
  }

  public toString(encoding: BufferEncoding = 'utf8'): string {
    if (this.chunks.length === 0) return '';
    return Buffer.concat(this.chunks, this.currentBytes).toString(encoding);
  }

  public get byteLength(): number {
    return this.currentBytes;
  }
}

export interface ProcessRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly input?: string;
  readonly reject?: boolean;
  readonly signal?: AbortSignal;
  readonly buffer?: boolean;
  readonly maxBufferBytes?: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly logger?: Logger;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly activeProcesses = new Set<any>();

  public constructor(private readonly clock: Clock = new SystemClock()) {
    const shutdown = () => this.cleanup();
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }

  private cleanup() {
    for (const p of this.activeProcesses) {
      p.kill('SIGTERM');
      setTimeout(() => p.kill('SIGKILL'), 5000).unref();
    }
  }

  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.executable.trim().length === 0) {
      throw new Error('Executable must not be empty');
    }
    if (request.args.some((argument) => argument.includes('\u0000'))) {
      throw new Error('Process arguments must not contain NUL bytes');
    }
    const started = this.clock.now().getTime();
    const useBuffer = request.buffer ?? true;
    const maxBytes = request.maxBufferBytes ?? 10 * 1024 * 1024;
    const stdoutBuffer = new BoundedRingBuffer(maxBytes);
    const stderrBuffer = new BoundedRingBuffer(maxBytes);

    const subprocess = execa(request.executable, [...request.args], {
      cwd: request.cwd,
      reject: request.reject ?? false,
      shell: false,
      windowsHide: true,
      buffer: useBuffer,
      ...(request.env === undefined ? {} : { env: { ...request.env } }),
      ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs }),
      ...(request.input === undefined ? {} : { input: request.input }),
      ...(request.signal === undefined ? {} : { cancelSignal: request.signal }),
    });

    this.activeProcesses.add(subprocess);

    if (subprocess.stdout) {
      subprocess.stdout.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        stdoutBuffer.append(text);
        request.onStdout?.(text);
        request.logger?.debug({ stream: 'stdout', data: text }, text);
      });
    }

    if (subprocess.stderr) {
      subprocess.stderr.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        stderrBuffer.append(text);
        request.onStderr?.(text);
        request.logger?.debug({ stream: 'stderr', data: text }, text);
      });
    }

    let result: Record<string, unknown>;
    try {
      result = (await subprocess) as unknown as Record<string, unknown>;
    } catch (error: unknown) {
      result = error as Record<string, unknown>;
    } finally {
      this.activeProcesses.delete(subprocess);
    }

    const exitCode =
      (typeof result.exitCode === 'number' ? result.exitCode : undefined) ??
      (result.failed ? 1 : 0);
    const stdoutStr = stdoutBuffer.toString();
    const stderrStr = stderrBuffer.toString();
    const stdout =
      useBuffer && typeof result.stdout === 'string' && result.stdout.length > 0
        ? result.stdout
        : stdoutStr;
    const stderr =
      useBuffer && typeof result.stderr === 'string' && result.stderr.length > 0
        ? result.stderr
        : stderrStr;

    return {
      executable: request.executable,
      args: request.args,
      cwd: request.cwd,
      exitCode,
      stdout,
      stderr,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
      timedOut: Boolean(result.timedOut),
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
  private nonce: string | undefined;

  public constructor(
    private readonly lockPath: string,
    private readonly staleAfterMs = 60_000,
    private readonly clock: Clock = new SystemClock(),
    private readonly acquireTimeoutMs = staleAfterMs * 2,
  ) {}

  async acquire(owner: string): Promise<void> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    this.nonce = randomUUID();
    const payload = JSON.stringify({
      owner,
      pid: process.pid,
      createdAt: this.clock.now().toISOString(),
      nonce: this.nonce,
    });
    const started = Date.now();

    while (true) {
      try {
        this.handle = await open(this.lockPath, 'wx', 0o600);
        await this.handle.writeFile(payload);
        await this.handle.sync();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw new Error(`Resource is locked: ${this.lockPath}`, { cause: error });
        }

        if (await this.isStale()) {
          const stealLock = `${this.lockPath}.steal`;
          try {
            // Attempt to acquire the exclusive right to reclaim this stale lock
            const stealHandle = await open(stealLock, 'wx', 0o600);
            await stealHandle.close();

            // We hold the steal lock. Double check the main lock is STILL stale.
            if (await this.isStale()) {
              await rm(this.lockPath, { force: true });
            }
            await rm(stealLock, { force: true });
          } catch {
            // Either someone else is stealing it, or the steal lock itself is stale.
            // If the steal lock is stuck, we can clear it if it's too old.
            try {
              const stealStat = await stat(stealLock);
              if (Date.now() - stealStat.mtimeMs > 5000) {
                await rm(stealLock, { force: true });
              }
            } catch {
              // Ignore
            }
          }
          continue; // Go back to the top and try to acquire normally
        }

        if (Date.now() - started > this.acquireTimeoutMs) {
          throw new Error(`Resource is locked and not stale: ${this.lockPath}`, { cause: error });
        }
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 100));
      }
    }
  }

  async release(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
    if (this.nonce) {
      try {
        const current = await readFile(this.lockPath, 'utf8');
        if (current.includes(`"nonce":"${this.nonce}"`)) {
          await rm(this.lockPath, { force: true, maxRetries: 5, retryDelay: 50 });
        }
      } catch {
        // Ignore read/unlink errors
      }
      this.nonce = undefined;
    }
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
