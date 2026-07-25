import { describe, expect, it } from 'vitest';
import { BoundedRingBuffer, ExecaProcessRunner } from './index.js';

describe('BoundedRingBuffer', () => {
  it('retains data within maxBytes capacity', () => {
    const buffer = new BoundedRingBuffer(100);
    buffer.append('hello ');
    buffer.append('world');
    expect(buffer.byteLength).toBe(11);
    expect(buffer.toString()).toBe('hello world');
  });

  it('evicts oldest data when capacity is exceeded', () => {
    const buffer = new BoundedRingBuffer(10);
    buffer.append('123456'); // 6 bytes
    buffer.append('7890AB'); // 6 bytes -> total 12 -> evicts first 2 bytes ('12')
    expect(buffer.byteLength).toBe(10);
    expect(buffer.toString()).toBe('34567890AB');
  });

  it('handles chunks larger than maxBytes', () => {
    const buffer = new BoundedRingBuffer(5);
    buffer.append('abcdefghij'); // 10 bytes -> retains last 5 bytes
    expect(buffer.byteLength).toBe(5);
    expect(buffer.toString()).toBe('fghij');
  });

  it('ignores empty appends', () => {
    const buffer = new BoundedRingBuffer(10);
    buffer.append('');
    buffer.append(new Uint8Array(0));
    expect(buffer.byteLength).toBe(0);
    expect(buffer.toString()).toBe('');
  });

  it('throws when maxBytes is not positive', () => {
    expect(() => new BoundedRingBuffer(0)).toThrow('maxBytes must be positive');
  });
});

describe('ExecaProcessRunner streaming', () => {
  it('streams stdout and stderr with buffer: false', async () => {
    const runner = new ExecaProcessRunner();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const result = await runner.run({
      executable: process.execPath,
      args: [
        '-e',
        'process.stdout.write("hello stdout\\n"); process.stderr.write("hello stderr\\n");',
      ],
      cwd: process.cwd(),
      buffer: false,
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk),
    });

    expect(result.exitCode).toBe(0);
    expect(stdoutChunks.join('')).toBe('hello stdout\n');
    expect(stderrChunks.join('')).toBe('hello stderr\n');
    expect(result.stdout).toBe('hello stdout\n');
    expect(result.stderr).toBe('hello stderr\n');
  });
});
