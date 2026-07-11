import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdapterCapabilities,
  AdapterId,
  AdapterProbe,
  AdapterResult,
  AdapterStatus,
  AdapterRunHandle,
  AiEngineAdapter,
  ArtifactReference,
  AssignmentEnvelope,
  PreparedAssignment,
  RunId,
} from '@omnibranch/contracts';
import {
  canonicalPathInside,
  ids,
  isPathInside,
  stableHash,
  type Clock,
  type IdGenerator,
  SystemClock,
  UuidGenerator,
} from '@omnibranch/platform';

type MockMode = 'complete' | 'partial' | 'blocked' | 'failed' | 'malformed';

interface MockRun {
  readonly assignment: AssignmentEnvelope;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly mode: MockMode;
  readonly outputPath?: string;
  readonly artifact?: ArtifactReference;
  cancelled: boolean;
}

const CAPABILITIES: AdapterCapabilities = {
  interactive_session: 'adapted',
  noninteractive_run: 'native',
  workspace_read: 'native',
  workspace_write: 'native',
  command_execution: 'unsupported',
  structured_result: 'native',
  artifact_collection: 'native',
  session_resume: 'adapted',
  cancellation: 'native',
  skills: 'adapted',
  policy_controls: 'native',
  version_probe: 'native',
  guided_mode: 'native',
};

export class MockAiAdapter implements AiEngineAdapter {
  private readonly adapterId = 'mock-local' as AdapterId;
  private readonly runs = new Map<string, MockRun>();

  public constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly idGenerator: IdGenerator = new UuidGenerator(),
  ) {}

  async probe(): Promise<AdapterProbe> {
    return {
      adapterId: this.adapterId,
      engineFamily: 'mock',
      engineSurface: 'in-process',
      installed: true,
      version: '1.0.0',
      supported: true,
      tier: 1,
      capabilities: CAPABILITIES,
      warnings: [],
    };
  }

  async prepare(assignment: AssignmentEnvelope): Promise<PreparedAssignment> {
    if (!assignment.scope.writeAllowed) {
      return {
        adapterId: this.adapterId,
        workingDirectory: assignment.scope.repositoryRoot,
        prompt: JSON.stringify(assignment),
        assignment,
        guided: true,
      };
    }
    return {
      adapterId: this.adapterId,
      workingDirectory: assignment.scope.repositoryRoot,
      prompt: JSON.stringify(assignment),
      assignment,
      guided: false,
    };
  }

  async launch(prepared: PreparedAssignment, signal?: AbortSignal): Promise<AdapterRunHandle> {
    const startedAt = this.clock.now();
    const externalRunId = this.idGenerator.next();
    const context = prepared.assignment.context;
    const mode = parseMode(context['mode']);
    let outputPath: string | undefined;
    let artifact: ArtifactReference | undefined;
    if (signal?.aborted !== true && mode === 'complete') {
      const relativeOutput = String(context['outputPath'] ?? '');
      if (relativeOutput.length === 0 || !isAllowed(relativeOutput, prepared.assignment)) {
        throw new Error('Mock output is outside assignment scope.');
      }
      const canonicalRoot = await canonicalPathInside(
        prepared.assignment.scope.repositoryRoot,
        '.',
      );
      outputPath = await canonicalPathInside(canonicalRoot, relativeOutput);
      if (!isPathInside(canonicalRoot, outputPath)) {
        throw new Error('Mock output escapes the assigned repository.');
      }
      const contents = String(context['contents'] ?? '');
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, contents, { encoding: 'utf8', flag: 'w' });
      artifact = {
        artifactId: ids.artifact(this.idGenerator.next()),
        kind: 'mock-output',
        path: relativeOutput,
        checksum: stableHash(contents),
        source: 'adapter',
      };
    }
    const run: MockRun = {
      assignment: prepared.assignment,
      startedAt,
      endedAt: this.clock.now(),
      mode,
      ...(outputPath === undefined ? {} : { outputPath }),
      ...(artifact === undefined ? {} : { artifact }),
      cancelled: signal?.aborted ?? false,
    };
    this.runs.set(externalRunId, run);
    return {
      runId: prepared.assignment.runId,
      adapterId: this.adapterId,
      externalRunId,
      startedAt: startedAt.toISOString(),
      resumeLevel: 'checkpoint',
    };
  }

  async collect(handle: AdapterRunHandle): Promise<AdapterResult> {
    const run = this.requireRun(handle);
    if (run.mode === 'malformed') throw new Error('Mock adapter emitted malformed output.');
    return normalizeMockResult(handle, run);
  }

  async cancel(handle: AdapterRunHandle): Promise<AdapterResult> {
    const run = this.requireRun(handle);
    run.cancelled = true;
    return normalizeMockResult(handle, run);
  }

  async resume(handle: AdapterRunHandle): Promise<AdapterRunHandle> {
    this.requireRun(handle);
    return handle;
  }

  private requireRun(handle: AdapterRunHandle): MockRun {
    const run = this.runs.get(handle.externalRunId);
    if (run === undefined || handle.adapterId !== this.adapterId) {
      throw new Error('Unknown or stale mock run handle.');
    }
    return run;
  }
}

function parseMode(value: unknown): MockMode {
  return ['complete', 'partial', 'blocked', 'failed', 'malformed'].includes(String(value))
    ? (String(value) as MockMode)
    : 'complete';
}

function isAllowed(relativePath: string, assignment: AssignmentEnvelope): boolean {
  const normalized = relativePath.replaceAll('\\', '/');
  return (
    !normalized.includes('..') &&
    assignment.scope.allowedPaths.includes(normalized) &&
    !assignment.scope.forbiddenPaths.includes(normalized)
  );
}

function normalizeMockResult(handle: AdapterRunHandle, run: MockRun): AdapterResult {
  const status: AdapterStatus = run.cancelled
    ? 'cancelled'
    : run.mode === 'complete'
      ? 'completed'
      : run.mode === 'malformed'
        ? 'failed'
        : run.mode;
  return {
    runId: handle.runId as RunId,
    adapterId: handle.adapterId,
    engineFamily: 'mock',
    engineSurface: 'in-process',
    engineVersion: '1.0.0',
    status,
    summary: run.cancelled ? 'Mock run cancelled.' : `Mock run ${status}.`,
    assignmentEcho: {
      assignmentId: run.assignment.assignmentId,
      workItemId: run.assignment.workItemId,
    },
    artifacts: run.artifact === undefined ? [] : [run.artifact],
    changeClaims:
      run.outputPath === undefined
        ? []
        : [
            {
              path: run.artifact?.path ?? run.outputPath,
              source: 'adapter_observation',
            },
          ],
    approvalsRequested: [],
    warnings: run.mode === 'partial' ? ['Mock run intentionally returned partial evidence.'] : [],
    timestamps: {
      startedAt: run.startedAt.toISOString(),
      lastActivityAt: run.endedAt.toISOString(),
      endedAt: run.endedAt.toISOString(),
      durationMs: Math.max(0, run.endedAt.getTime() - run.startedAt.getTime()),
    },
  };
}
