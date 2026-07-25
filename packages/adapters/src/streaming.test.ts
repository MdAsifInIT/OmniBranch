import { describe, expect, it } from 'vitest';
import type {
  AssignmentEnvelope,
  LeaseId,
  RunId,
  WorkItemId,
  WorkerId,
} from '@omnibranch/contracts';
import type { ProcessRequest, ProcessResult, ProcessRunner } from '@omnibranch/platform';
import { FakeClock, SequenceIdGenerator } from '@omnibranch/platform';
import { CliEngineAdapter } from './engines.js';

class StreamingMockRunner implements ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.calls.push(request);
    if (request.args.includes('--version')) {
      return {
        executable: request.executable,
        args: request.args,
        cwd: request.cwd,
        exitCode: 0,
        stdout: 'codex v1.0.0\n',
        stderr: '',
        durationMs: 1,
        timedOut: false,
      };
    }
    request.onStdout?.('mock stdout chunk\n');
    request.onStderr?.('mock stderr chunk\n');
    return {
      executable: request.executable,
      args: request.args,
      cwd: request.cwd,
      exitCode: 0,
      stdout: JSON.stringify({ status: 'completed', summary: 'streaming test passed' }),
      stderr: '',
      durationMs: 5,
      timedOut: false,
    };
  }
}

const sampleAssignment = (): AssignmentEnvelope => ({
  assignmentId: 'assign-stream-1',
  runId: 'run-stream-1' as RunId,
  workItemId: 'item-stream-1' as WorkItemId,
  objective: 'Test streaming output integration',
  scope: {
    allowedPaths: ['file.txt'],
    forbiddenPaths: [],
    repositoryRoot: 'repo',
    writeAllowed: true,
  },
  constraints: [],
  context: {},
  validation: ['test'],
  escalation: [],
  lease: {
    leaseId: 'lease-stream-1' as LeaseId,
    workItemId: 'item-stream-1' as WorkItemId,
    workerId: 'worker-stream-1' as WorkerId,
    issuedAt: '2026-07-25T00:00:00Z',
    expiresAt: '2026-07-26T00:00:00Z',
    heartbeatDeadline: '2026-07-25T01:00:00Z',
    attempt: 1,
    lockReferences: ['file.txt'],
  },
});

describe('CliEngineAdapter streaming options', () => {
  it('launches process with buffer: false and connects stdout/stderr callbacks', async () => {
    const runner = new StreamingMockRunner();
    const stdoutReceived: string[] = [];
    const stderrReceived: string[] = [];

    const adapter = new CliEngineAdapter(
      {
        adapterId: 'codex-cli',
        family: 'Codex',
        surface: 'CLI',
        executable: 'codex',
        versionArguments: ['--version'],
        verifiedVersion: /codex/i,
        tier: 2,
        resumeLevel: 'checkpoint',
        capabilities: {
          interactive_session: 'adapted',
          noninteractive_run: 'adapted',
          workspace_read: 'adapted',
          workspace_write: 'adapted',
          command_execution: 'adapted',
          structured_result: 'adapted',
          artifact_collection: 'adapted',
          session_resume: 'adapted',
          cancellation: 'adapted',
          skills: 'adapted',
          policy_controls: 'adapted',
          version_probe: 'native',
          guided_mode: 'native',
        },
        launchArguments: () => ['exec'],
      },
      runner,
      {
        clock: new FakeClock(new Date('2026-07-25T00:00:00Z')),
        idsGenerator: new SequenceIdGenerator('stream'),
        onStdout: (chunk) => stdoutReceived.push(chunk),
        onStderr: (chunk) => stderrReceived.push(chunk),
      },
    );

    const prepared = await adapter.prepare(sampleAssignment());
    expect(prepared.guided).toBe(false);

    const handle = await adapter.launch(prepared);
    const result = await adapter.collect(handle);

    expect(result.status).toBe('completed');
    expect(runner.calls.length).toBeGreaterThan(0);
    const launchCall = runner.calls[runner.calls.length - 1];
    expect(launchCall?.buffer).toBe(false);
    expect(launchCall?.maxBufferBytes).toBe(10 * 1024 * 1024);
    expect(stdoutReceived).toEqual(['mock stdout chunk\n']);
    expect(stderrReceived).toEqual(['mock stderr chunk\n']);
  });
});
