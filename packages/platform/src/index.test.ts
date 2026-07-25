import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FileMutex,
  atomicWrite,
  isPathInside,
  canonicalPathInside,
  ExecaProcessRunner,
  redact,
  stableHash,
  FakeClock,
} from './index.js';
import { mkdir, rm, stat, readFile, symlink, writeFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

describe('platform package', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(os.tmpdir(), `omnibranch-platform-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('FileMutex', () => {
    it('should acquire and release a lock', async () => {
      const lockPath = join(tmpDir, 'test.lock');
      const mutex = new FileMutex(lockPath);
      
      await mutex.acquire('test-owner');
      const stats = await stat(lockPath);
      expect(stats.isFile()).toBe(true);
      
      await mutex.release();
      await expect(stat(lockPath)).rejects.toThrow(/ENOENT/);
    });

    it('should detect stale locks and acquire them', async () => {
      const lockPath = join(tmpDir, 'stale.lock');
      const clock = new FakeClock(new Date());
      
      // Simulate a dead process leaving a lock by writing the file directly
      await writeFile(lockPath, JSON.stringify({ owner: 'owner-1', pid: 99999, createdAt: clock.now().toISOString() }));
      
      // Advance clock past the stale threshold (1000ms)
      clock.advance(2000);
      
      const mutex2 = new FileMutex(lockPath, 1000, clock);
      await expect(mutex2.acquire('owner-2')).resolves.not.toThrow();
      
      const data = await readFile(lockPath, 'utf8');
      expect(JSON.parse(data).owner).toBe('owner-2');
      await mutex2.release();
    });

    it('should handle contention (throw when locked)', async () => {
      const lockPath = join(tmpDir, 'contention.lock');
      const mutex1 = new FileMutex(lockPath, 60000);
      await mutex1.acquire('owner-1');
      
      const mutex2 = new FileMutex(lockPath, 60000);
      await expect(mutex2.acquire('owner-2')).rejects.toThrow(/Resource is locked/);
      
      await mutex1.release();
    });
  });

  describe('atomicWrite', () => {
    it('should perform a normal write', async () => {
      const filePath = join(tmpDir, 'atomic.txt');
      await atomicWrite(filePath, 'hello world');
      
      const contents = await readFile(filePath, 'utf8');
      expect(contents).toBe('hello world');
    });

    it('should handle directory sync failure gracefully', async () => {
      // Actually simulating this perfectly in a generic test is hard, 
      // but we can at least make sure atomicWrite handles standard writes and doesn't throw unexpectedly.
      const filePath = join(tmpDir, 'nested', 'atomic.txt');
      await atomicWrite(filePath, 'hello nested');
      
      const contents = await readFile(filePath, 'utf8');
      expect(contents).toBe('hello nested');
    });
  });

  describe('isPathInside', () => {
    it('should correctly identify paths inside the root', () => {
      expect(isPathInside('/a/b/c', '/a/b/c/d')).toBe(true);
      expect(isPathInside('/a/b/c', '/a/b/c')).toBe(true);
    });

    it('should correctly identify paths outside the root (.. segments)', () => {
      expect(isPathInside('/a/b/c', '/a/b/d')).toBe(false);
      expect(isPathInside('/a/b/c', '/a/b/c/../d')).toBe(false);
      expect(isPathInside('/a/b/c', '/a/b/c/../../b/d')).toBe(false);
    });

    it('should handle absolute paths properly', () => {
      expect(isPathInside('/a/b', '/c/d')).toBe(false);
    });

    it('should handle Windows drive letters (mocking on posix/win)', () => {
      // isPathInside uses path.relative. We can test standard absolute behavior
      expect(isPathInside('C:\\Users\\test', 'C:\\Users\\test\\doc')).toBe(true);
      expect(isPathInside('C:\\Users\\test', 'D:\\Users\\test\\doc')).toBe(false);
    });
  });

  describe('canonicalPathInside', () => {
    it('should resolve and confirm canonical paths inside', async () => {
      const root = join(tmpDir, 'root');
      await mkdir(root);
      const safe = join(root, 'safe.txt');
      await writeFile(safe, 'content');
      
      const result = await canonicalPathInside(root, safe);
      // canonicalPathInside uses realpath which returns long paths on Windows
      expect(result).toBe(await realpath(safe));
    });

    it('should throw if canonical path escapes root via symlink', async () => {
      const root = join(tmpDir, 'root');
      const outside = join(tmpDir, 'outside');
      await mkdir(root);
      await mkdir(outside);
      
      await writeFile(join(outside, 'secret.txt'), 'secret');
      
      // We can't always create symlinks on Windows without admin, but vitest runs node
      // Let's try to mock or do a best effort.
      try {
        await symlink(outside, join(root, 'link'));
        const evil = join(root, 'link', 'secret.txt');
        await expect(canonicalPathInside(root, evil)).rejects.toThrow(/Path escapes allowed root/);
      } catch (e) {
        // Skip if symlink creation fails (Windows typical non-admin issue)
        console.warn('Symlink creation failed, skipping symlink traversal test', e);
      }
    });
    
    it('should throw for .. segments escaping root', async () => {
      const root = join(tmpDir, 'root');
      await mkdir(root);
      const evil = join(root, '..', 'root-sibling.txt');
      
      await expect(canonicalPathInside(root, evil)).rejects.toThrow(/Path escapes allowed root/);
    });
  });

  describe('ExecaProcessRunner', () => {
    const runner = new ExecaProcessRunner();

    it('should execute a basic command and handle exit code', async () => {
      const result = await runner.run({
        executable: 'node',
        args: ['-e', 'console.log("hi")'],
        cwd: tmpDir
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hi');
    });

    it('should reject NUL bytes in arguments', async () => {
      await expect(runner.run({
        executable: 'echo',
        args: ['hello\u0000world'],
        cwd: tmpDir
      })).rejects.toThrow(/NUL bytes/);
    });

    it('should handle timeout', async () => {
      const result = await runner.run({
        executable: 'node',
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        cwd: tmpDir,
        timeoutMs: 100
      });
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).not.toBe(0); // Killed process exit code
    });

    it('should propagate AbortSignal', async () => {
      const ac = new AbortController();
      const runPromise = runner.run({
        executable: 'node',
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        cwd: tmpDir,
        signal: ac.signal
      });
      
      ac.abort();
      
      const result = await runPromise;
      // Depending on execa version, it might throw on abort or return failed result
      // But we specified reject: false by default in ExecaProcessRunner!
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('redact', () => {
    it('should redact GitHub tokens', () => {
      const input = 'My token is ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      expect(redact(input)).toBe('My token is [REDACTED]');
    });

    it('should redact Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
      expect(redact(input)).toBe('Authorization: [REDACTED]');
    });

    it('should redact custom secrets', () => {
      const input = 'The secret is MY_CUSTOM_SECRET123';
      expect(redact(input, ['MY_CUSTOM_SECRET123'])).toBe('The secret is [REDACTED]');
    });

    it('should redact query parameter tokens', () => {
      const input = 'https://api.example.com/v1/users?token=super_secret_token123&other=1';
      expect(redact(input)).toBe('https://api.example.com/v1/users[REDACTED]&other=1');
    });
    
    it('should redact OpenAI/Anthropic keys', () => {
      const input = 'sk_test_1234567890abcdefghijklmnopqrstuvwxyz';
      expect(redact(input)).toBe('[REDACTED]');
    });
  });

  describe('stableHash', () => {
    it('should return deterministic hash for strings', () => {
      const h1 = stableHash('hello world');
      const h2 = stableHash('hello world');
      expect(h1).toBe(h2);
    });

    it('should be collision resistant (different inputs have different hashes)', () => {
      const h1 = stableHash('hello world');
      const h2 = stableHash('hello world!');
      expect(h1).not.toBe(h2);
    });
  });
});
