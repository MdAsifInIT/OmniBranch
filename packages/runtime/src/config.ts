import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import picomatch from 'picomatch';
import { LineCounter, parseDocument } from 'yaml';

import type { Diagnostic, WorkspacePlan } from '@omnibranch/contracts';
import { isPathInside, redact } from '@omnibranch/platform';
import workspacePlanSchema from '../../../schemas/v1alpha1/workspace-plan.schema.json' with { type: 'json' };

type MutableObject = Record<string, unknown>;

export interface ConfigResult {
  readonly valid: boolean;
  readonly plan?: WorkspacePlan;
  readonly diagnostics: readonly Diagnostic[];
  readonly redactedSnapshot?: Readonly<Record<string, unknown>>;
}

export async function loadWorkspacePlan(filePath: string): Promise<ConfigResult> {
  const source = await readFile(filePath, 'utf8');
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  const parseDiagnostics: Diagnostic[] = document.errors.map((error) => ({
    path: filePath,
    rule: 'yaml',
    message: error.message,
    remediation: 'Correct the YAML syntax and duplicate keys.',
    severity: 'error',
  }));
  if (parseDiagnostics.length > 0) return { valid: false, diagnostics: parseDiagnostics };

  const parsed = document.toJS({ mapAsMap: false }) as unknown;
  if (!isObject(parsed)) {
    return {
      valid: false,
      diagnostics: [
        {
          path: '$',
          rule: 'root-object',
          message: 'WorkspacePlan must be a YAML object.',
          remediation: 'Define apiVersion, kind, and the required top-level sections.',
          severity: 'error',
        },
      ],
    };
  }

  applyDefaults(parsed);
  const ajv = new Ajv2020.default({
    allErrors: true,
    strict: true,
    strictRequired: false,
    useDefaults: true,
  });
  addFormats.default(ajv);
  const validate = ajv.compile(workspacePlanSchema);
  const structurallyValid = validate(parsed);
  const diagnostics = structurallyValid
    ? []
    : (validate.errors ?? []).map((validationError: ErrorObject) =>
        structuralDiagnostic(validationError),
      );
  if (diagnostics.length > 0) return { valid: false, diagnostics };

  const plan = parsed as unknown as WorkspacePlan;
  const semanticDiagnostics = validateSemantics(plan, path.dirname(path.resolve(filePath)));
  if (semanticDiagnostics.length > 0) {
    return { valid: false, diagnostics: semanticDiagnostics };
  }
  return {
    valid: true,
    plan,
    diagnostics: [],
    redactedSnapshot: redactConfig(plan),
  };
}

function structuralDiagnostic(error: ErrorObject): Diagnostic {
  return {
    path: error.instancePath.length === 0 ? '$' : `$${error.instancePath.replaceAll('/', '.')}`,
    rule: error.keyword,
    message: error.message ?? 'Configuration violates the schema.',
    remediation:
      error.keyword === 'additionalProperties'
        ? 'Remove the unknown property or upgrade to a schema version that supports it.'
        : 'Use the WorkspacePlan configuration reference to correct this value.',
    severity: 'error',
  };
}

function applyDefaults(root: MutableObject): void {
  const runtime = ensureObject(root, 'runtime');
  runtime['nodeVersion'] ??= '22';
  runtime['dryRunDefault'] ??= true;
  runtime['globalConcurrency'] ??= 1;
  runtime['reconciliationInterval'] ??= '30s';
  const shell = ensureObject(runtime, 'shell');
  shell['windows'] ??= 'powershell';
  shell['posix'] ??= 'bash';
  const lease = ensureObject(runtime, 'lease');
  lease['ttl'] ??= '15m';
  lease['heartbeatInterval'] ??= '30s';
  lease['gracePeriod'] ??= '90s';

  const topology = ensureObject(root, 'branchTopology');
  topology['integrationBranches'] ??= [];
  const attempts = ensureObject(topology, 'attemptBranches');
  attempts['baseFromLane'] ??= true;

  const ownership = ensureObject(root, 'ownership');
  ownership['defaultMode'] ??= 'exclusive';
  const policies = ensureObject(root, 'policies');
  policies['defaultAction'] ??= 'require_approval';
  policies['packs'] ??= [];
  policies['rules'] ??= [];

  const state = ensureObject(root, 'state');
  const snapshots = ensureObject(state, 'snapshots');
  snapshots['enabled'] ??= true;
  snapshots['interval'] ??= 250;

  const reporting = ensureObject(root, 'reporting');
  reporting['formats'] ??= ['markdown'];
  reporting['includeTelemetry'] ??= false;
  const reportingRedact = ensureObject(reporting, 'redact');
  reportingRedact['secrets'] ??= true;
  reportingRedact['envValues'] ??= true;
  reportingRedact['userPaths'] ??= false;
}

function ensureObject(parent: MutableObject, key: string): MutableObject {
  const current = parent[key];
  if (isObject(current)) return current;
  const created: MutableObject = {};
  parent[key] = created;
  return created;
}

function isObject(value: unknown): value is MutableObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSemantics(plan: WorkspacePlan, repositoryRoot: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const laneNames = new Set(Object.keys(plan.lanes));
  const branchClasses = new Set(Object.keys(plan.branchTopology.laneBranches));
  const integration = new Set(plan.branchTopology.integrationBranches.map((item) => item.name));
  const prefixes = new Map<string, string>();

  for (const [name, lane] of Object.entries(plan.lanes)) {
    if (!branchClasses.has(lane.branchClass)) {
      diagnostics.push(
        error(
          `$.lanes.${name}.branchClass`,
          'unknown-branch-class',
          `Unknown branch class ${lane.branchClass}.`,
          'Declare the class under branchTopology.laneBranches.',
        ),
      );
    }
  }

  for (const [name, branch] of Object.entries(plan.branchTopology.laneBranches)) {
    if (branch.base !== plan.branchTopology.trunk && !integration.has(branch.base)) {
      diagnostics.push(
        error(
          `$.branchTopology.laneBranches.${name}.base`,
          'unknown-base',
          `Unknown branch base ${branch.base}.`,
          'Use trunk or a declared integration branch.',
        ),
      );
    }
    detectPrefixOverlap(prefixes, branch.prefix, `laneBranches.${name}`, diagnostics);
  }
  detectPrefixOverlap(
    prefixes,
    plan.branchTopology.attemptBranches.prefix,
    'attemptBranches',
    diagnostics,
  );

  const ownershipMatchers: { readonly name: string; readonly glob: string }[] = [];
  for (const [name, set] of Object.entries(plan.ownership.sets)) {
    for (const lane of set.lanes) {
      if (!laneNames.has(lane)) {
        diagnostics.push(
          error(
            `$.ownership.sets.${name}.lanes`,
            'unknown-lane',
            `Unknown lane ${lane}.`,
            'Reference a declared lane.',
          ),
        );
      }
    }
    for (const glob of set.globs) {
      if (glob.startsWith('/') || glob.includes('..') || /^[A-Za-z]:/.test(glob)) {
        diagnostics.push(
          error(
            `$.ownership.sets.${name}.globs`,
            'unsafe-glob',
            `Unsafe ownership glob ${glob}.`,
            'Use a repository-relative glob without traversal.',
          ),
        );
      }
      for (const existing of ownershipMatchers) {
        if (
          picomatch.isMatch(existing.glob.replace(/[*?].*$/, 'probe'), glob) ||
          picomatch.isMatch(glob.replace(/[*?].*$/, 'probe'), existing.glob)
        ) {
          diagnostics.push(
            error(
              `$.ownership.sets.${name}.globs`,
              'ambiguous-ownership',
              `${name} may overlap ${existing.name}.`,
              'Make exclusive ownership globs disjoint.',
            ),
          );
        }
      }
      ownershipMatchers.push({ name, glob });
    }
  }

  for (const [group, commands] of Object.entries(plan.commands)) {
    const identifiers = new Set<string>();
    for (const command of commands) {
      if (identifiers.has(command.id)) {
        diagnostics.push(
          error(
            `$.commands.${group}`,
            'duplicate-command-id',
            `Duplicate command id ${command.id}.`,
            'Use unique command ids within each group.',
          ),
        );
      }
      identifiers.add(command.id);
      const platformCommand =
        process.platform === 'win32' ? command.run.windows : command.run.posix;
      if (platformCommand === undefined) {
        diagnostics.push(
          error(
            `$.commands.${group}.${command.id}.run`,
            'missing-platform-command',
            'No command is configured for the active platform.',
            'Provide both windows and posix commands.',
          ),
        );
      }
    }
  }

  const expanded = resolveTemplateTokens(plan, {
    repositoryRoot,
    gitCommonDir: path.join(repositoryRoot, '.git'),
    repoParent: path.dirname(repositoryRoot),
    metadataName: plan.metadata.name,
  });
  if (!isPathInside(repositoryRoot, expanded.runtime.workspaceRoot)) {
    diagnostics.push(
      error(
        '$.runtime.workspaceRoot',
        'workspace-outside-repository',
        'workspaceRoot resolves outside the repository.',
        'Keep workspaceRoot inside the repository.',
      ),
    );
  }
  if (
    isPathInside(expanded.runtime.worktreeRoot, expanded.state.eventStore.path) ||
    isPathInside(expanded.runtime.worktreeRoot, expanded.state.projection.path)
  ) {
    diagnostics.push(
      error(
        '$.state',
        'state-worktree-collision',
        'Persistent state overlaps the managed worktree root.',
        'Place state under gitCommonDir and worktrees outside the primary tree.',
      ),
    );
  }

  return diagnostics;
}

function detectPrefixOverlap(
  prefixes: Map<string, string>,
  prefix: string,
  owner: string,
  diagnostics: Diagnostic[],
): void {
  for (const [existing, existingOwner] of prefixes) {
    if (prefix.startsWith(existing) || existing.startsWith(prefix)) {
      diagnostics.push(
        error(
          '$.branchTopology',
          'overlapping-prefix',
          `${owner} overlaps ${existingOwner}.`,
          'Use distinct non-prefix branch namespaces.',
        ),
      );
    }
  }
  prefixes.set(prefix, owner);
}

function error(pathValue: string, rule: string, message: string, remediation: string): Diagnostic {
  return { path: pathValue, rule, message, remediation, severity: 'error' };
}

export interface TemplateContext {
  readonly repositoryRoot: string;
  readonly gitCommonDir: string;
  readonly repoParent: string;
  readonly metadataName: string;
}

export function expandTemplate(value: string, context: TemplateContext): string {
  const known: Readonly<Record<string, string>> = {
    gitCommonDir: context.gitCommonDir,
    repoParent: context.repoParent,
    'metadata.name': context.metadataName,
  };
  return value.replace(/\$\{([^}]+)\}/g, (_match, token: string) => {
    const replacement = known[token];
    if (replacement === undefined) throw new Error(`Unknown template token: ${token}`);
    return replacement;
  });
}

export function resolveTemplateTokens(
  plan: WorkspacePlan,
  context: TemplateContext,
): WorkspacePlan {
  const clone = structuredClone(plan);
  const runtime = clone.runtime as unknown as {
    workspaceRoot: string;
    tempRoot: string;
    worktreeRoot: string;
  };
  const resolveValue = (value: string): string => {
    const expanded = expandTemplate(value, context);
    return path.isAbsolute(expanded)
      ? path.normalize(expanded)
      : path.resolve(context.repositoryRoot, expanded);
  };
  runtime.workspaceRoot = resolveValue(runtime.workspaceRoot);
  runtime.tempRoot = resolveValue(runtime.tempRoot);
  runtime.worktreeRoot = resolveValue(runtime.worktreeRoot);
  const eventStore = clone.state.eventStore as { path: string };
  const projection = clone.state.projection as { path: string };
  const reporting = clone.reporting as { outputRoot: string };
  eventStore.path = resolveValue(eventStore.path);
  projection.path = resolveValue(projection.path);
  reporting.outputRoot = resolveValue(reporting.outputRoot);
  return clone;
}

export function redactConfig(plan: WorkspacePlan): Readonly<Record<string, unknown>> {
  const walk = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') {
      if (/token|secret|password|authorization/i.test(key)) return '[REDACTED_REFERENCE]';
      return redact(value);
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [childKey, walk(child, childKey)]),
      );
    }
    return value;
  };
  return walk(plan) as Readonly<Record<string, unknown>>;
}
