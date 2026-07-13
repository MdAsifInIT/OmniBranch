import {
  access,
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  ConcreteProviderTarget,
  InstalledFileEvidence,
  InstallerRecoveryJournal,
  InstallerRequest,
  InstallOperation,
  InstallPlan,
  InstallReceipt,
  InstallScope,
  ProviderTarget,
} from '@omnibranch/contracts';
import {
  FileMutex,
  SystemClock,
  UuidGenerator,
  atomicWrite,
  canonicalPathInside,
  isPathInside,
  normalizeRepositoryPath,
  stableHash,
  type Clock,
  type IdGenerator,
} from '@omnibranch/platform';

const SCHEMA_VERSION = 'omnibranch.dev/skill-install/v1' as const;
const CONCRETE_TARGETS: readonly ConcreteProviderTarget[] = [
  'codex',
  'claude',
  'opencode',
  'antigravity',
  'agents',
];

interface InstallerState {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly receipts: readonly InstallReceipt[];
}

export interface InstallerEnvironment {
  readonly homeDirectory?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly detectedTargets?: readonly ConcreteProviderTarget[];
}

export interface TargetDescription {
  readonly target: ConcreteProviderTarget;
  readonly scope: InstallScope;
  readonly supported: boolean;
  readonly detected: boolean;
  readonly destination?: string;
  readonly reason?: string;
}

export interface InstallationStatus {
  readonly target: readonly ConcreteProviderTarget[];
  readonly destination: string;
  readonly installed: boolean;
  readonly managed: boolean;
  readonly modified: boolean;
  readonly payloadVersion?: string;
  readonly receiptId?: string;
}

export interface InstallerDoctorResult {
  readonly healthy: boolean;
  readonly payloadValid: boolean;
  readonly recoveryPending: boolean;
  readonly targets: readonly TargetDescription[];
  readonly installations: readonly InstallationStatus[];
  readonly warnings: readonly string[];
}

export class InstallerError extends Error {
  public constructor(
    public readonly code:
      | 'TARGET_SCOPE_UNSUPPORTED'
      | 'PROJECT_ROOT_REQUIRED'
      | 'UNMANAGED_CONFLICT'
      | 'MODIFIED_INSTALLATION'
      | 'INSTALLATION_NOT_FOUND'
      | 'ROLLBACK_NOT_AVAILABLE'
      | 'CONTAINMENT_FAILURE'
      | 'INTEGRITY_FAILURE'
      | 'RECOVERY_INCOMPLETE'
      | 'PARTIAL_INSTALLATION',
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'InstallerError';
  }
}

export class SkillInstaller {
  private readonly homeDirectory: string;
  private readonly environment: Readonly<Record<string, string | undefined>>;

  public constructor(
    private readonly payloadRoot: string,
    environment: InstallerEnvironment = {},
    private readonly clock: Clock = new SystemClock(),
    private readonly idGenerator: IdGenerator = new UuidGenerator(),
  ) {
    this.homeDirectory = path.resolve(environment.homeDirectory ?? os.homedir());
    this.environment = environment.env ?? process.env;
    this.detectedTargetOverride = environment.detectedTargets;
  }

  private readonly detectedTargetOverride: readonly ConcreteProviderTarget[] | undefined;

  async targets(scope: InstallScope, projectRoot?: string): Promise<readonly TargetDescription[]> {
    const detected = await this.detectedTargets();
    const descriptions: TargetDescription[] = [];
    for (const target of CONCRETE_TARGETS) {
      try {
        const resolved = await this.resolveDestination(target, scope, projectRoot);
        descriptions.push({
          target,
          scope,
          supported: true,
          detected: detected.includes(target),
          destination: resolved.destination,
        });
      } catch (error) {
        if (!(error instanceof InstallerError)) throw error;
        descriptions.push({
          target,
          scope,
          supported: false,
          detected: detected.includes(target),
          reason: error.message,
        });
      }
    }
    return descriptions;
  }

  async plan(request: InstallerRequest): Promise<InstallPlan> {
    const payload = await this.validatePayload();
    const resolvedScope = await this.resolveScope(request.scope, request.projectRoot);
    const stateRoot = this.stateRoot(request.scope, resolvedScope.projectRoot);
    const state = await this.readState(stateRoot);
    const { targets, warnings } = await this.expandTargets(
      request.target,
      request.scope,
      resolvedScope.projectRoot,
    );
    const grouped = new Map<string, { targets: ConcreteProviderTarget[]; allowedRoot: string }>();
    for (const target of targets) {
      const resolved = await this.resolveDestination(
        target,
        request.scope,
        resolvedScope.projectRoot,
      );
      const existing = grouped.get(resolved.destination);
      if (existing === undefined) {
        grouped.set(resolved.destination, { targets: [target], allowedRoot: resolved.allowedRoot });
      } else {
        existing.targets.push(target);
      }
    }

    const operations: InstallOperation[] = [];
    for (const [destination, entry] of [...grouped.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      await this.assertDestinationContained(entry.allowedRoot, destination);
      const destinationExists = await pathExists(destination);
      const current = activeReceipt(state, destination);
      const managed = current !== undefined && current.action !== 'uninstall';
      const modified =
        managed && destinationExists ? !(await receiptMatches(current, destination)) : false;
      operations.push(
        this.operationFor(
          request,
          entry.targets,
          destination,
          destinationExists,
          current,
          modified,
          payload.sha256,
        ),
      );
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      action: request.action,
      requestedTarget: request.target,
      scope: request.scope,
      ...(resolvedScope.projectRoot === undefined
        ? {}
        : { projectRoot: resolvedScope.projectRoot }),
      stateRoot,
      payloadVersion: payload.version,
      payloadSha256: payload.sha256,
      operations,
      warnings,
      dryRun: request.dryRun,
    };
  }

  async install(request: Omit<InstallerRequest, 'action'>): Promise<readonly InstallReceipt[]> {
    return this.execute({ ...request, action: 'install' });
  }

  async update(request: Omit<InstallerRequest, 'action'>): Promise<readonly InstallReceipt[]> {
    return this.execute({ ...request, action: 'update' });
  }

  async rollback(request: Omit<InstallerRequest, 'action'>): Promise<readonly InstallReceipt[]> {
    return this.execute({ ...request, action: 'rollback' });
  }

  async uninstall(request: Omit<InstallerRequest, 'action'>): Promise<readonly InstallReceipt[]> {
    return this.execute({ ...request, action: 'uninstall' });
  }

  async status(
    target: ProviderTarget,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<readonly InstallationStatus[]> {
    const resolvedScope = await this.resolveScope(scope, projectRoot);
    const stateRoot = this.stateRoot(scope, resolvedScope.projectRoot);
    const state = await this.readState(stateRoot);
    const expanded = await this.expandTargets(target, scope, resolvedScope.projectRoot);
    const destinations = new Map<string, ConcreteProviderTarget[]>();
    for (const concrete of expanded.targets) {
      const resolved = await this.resolveDestination(concrete, scope, resolvedScope.projectRoot);
      const targets = destinations.get(resolved.destination) ?? [];
      targets.push(concrete);
      destinations.set(resolved.destination, targets);
    }
    const statuses: InstallationStatus[] = [];
    for (const [destination, targets] of destinations) {
      const receipt = activeReceipt(state, destination);
      const installed = await pathExists(destination);
      const managed = receipt !== undefined && receipt.action !== 'uninstall';
      statuses.push({
        target: targets,
        destination,
        installed,
        managed,
        modified: managed && installed ? !(await receiptMatches(receipt, destination)) : false,
        ...(receipt === undefined
          ? {}
          : { payloadVersion: receipt.payloadVersion, receiptId: receipt.receiptId }),
      });
    }
    return statuses.sort((left, right) => left.destination.localeCompare(right.destination));
  }

  async doctor(scope: InstallScope, projectRoot?: string): Promise<InstallerDoctorResult> {
    const warnings: string[] = [];
    let payloadValid = true;
    try {
      await this.validatePayload();
    } catch (error) {
      payloadValid = false;
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    const resolvedScope = await this.resolveScope(scope, projectRoot);
    const stateRoot = this.stateRoot(scope, resolvedScope.projectRoot);
    const recoveryPending = await pathExists(this.journalPath(stateRoot));
    if (recoveryPending) warnings.push('An incomplete installer transaction requires recovery.');
    const targetDescriptions = await this.targets(scope, resolvedScope.projectRoot);
    const installations = await this.status('all', scope, resolvedScope.projectRoot);
    return {
      healthy:
        payloadValid &&
        !recoveryPending &&
        installations.every((installation) => !installation.modified),
      payloadValid,
      recoveryPending,
      targets: targetDescriptions,
      installations,
      warnings,
    };
  }

  async recover(scope: InstallScope, projectRoot?: string): Promise<readonly string[]> {
    const resolvedScope = await this.resolveScope(scope, projectRoot);
    const stateRoot = this.stateRoot(scope, resolvedScope.projectRoot);
    const mutex = new FileMutex(path.join(stateRoot, 'installer.lock'));
    await mutex.acquire(`recovery-${process.pid}`);
    try {
      return await this.recoverLocked(stateRoot);
    } finally {
      await mutex.release();
    }
  }

  private async execute(request: InstallerRequest): Promise<readonly InstallReceipt[]> {
    const initialPlan = await this.plan({ ...request, dryRun: request.dryRun });
    if (request.dryRun) return [];
    const receipts: InstallReceipt[] = [];
    await mkdir(initialPlan.stateRoot, { recursive: true });
    const mutex = new FileMutex(path.join(initialPlan.stateRoot, 'installer.lock'));
    await mutex.acquire(`installer-${process.pid}`);
    try {
      await this.recoverLocked(initialPlan.stateRoot);
      const plan = await this.plan(request);
      for (const operation of plan.operations) {
        if (operation.mode === 'noop') continue;
        const receipt =
          request.action === 'uninstall'
            ? await this.removeOperation(plan, operation, request)
            : request.action === 'rollback'
              ? await this.restoreOperation(plan, operation, request)
              : await this.activateOperation(plan, operation, request);
        receipts.push(receipt);
      }
      return receipts;
    } catch (error) {
      if (initialPlan.operations.length > 1 && receipts.length > 0) {
        throw new InstallerError('PARTIAL_INSTALLATION', 'A multi-target installation failed.', {
          cause: error instanceof Error ? error.message : String(error),
          completedReceiptIds: receipts.map((receipt) => receipt.receiptId),
        });
      }
      throw error;
    } finally {
      await mutex.release();
    }
  }

  private operationFor(
    request: InstallerRequest,
    targets: readonly ConcreteProviderTarget[],
    destination: string,
    exists: boolean,
    current: InstallReceipt | undefined,
    modified: boolean,
    payloadSha256: string,
  ): InstallOperation {
    const managed = current !== undefined && current.action !== 'uninstall';
    if (request.action === 'install') {
      if (exists && !managed && request.replace !== true) {
        throw new InstallerError(
          'UNMANAGED_CONFLICT',
          `Destination is not managed: ${destination}`,
          {
            destination,
          },
        );
      }
      if (modified && request.replace !== true && request.force !== true) {
        throw new InstallerError(
          'MODIFIED_INSTALLATION',
          `Managed files were modified: ${destination}`,
          {
            destination,
          },
        );
      }
      if (managed && !modified && current?.payloadSha256 === payloadSha256) {
        return {
          targets,
          destination,
          mode: 'noop',
          managed: true,
          modified: false,
          reason: 'The managed installation already matches this payload.',
        };
      }
      return {
        targets,
        destination,
        mode: !exists ? 'create' : managed ? 'update' : 'replace',
        managed,
        modified,
        reason: !exists
          ? 'Destination is absent.'
          : managed
            ? 'Managed installation will be refreshed.'
            : 'Explicit replacement of an unmanaged destination.',
      };
    }
    if (request.action === 'update') {
      if (!managed || !exists) {
        throw new InstallerError(
          'INSTALLATION_NOT_FOUND',
          `No managed installation exists: ${destination}`,
        );
      }
      if (modified && request.force !== true) {
        throw new InstallerError(
          'MODIFIED_INSTALLATION',
          `Managed files were modified: ${destination}`,
        );
      }
      if (!modified && current.payloadSha256 === payloadSha256) {
        return {
          targets,
          destination,
          mode: 'noop',
          managed: true,
          modified: false,
          reason: 'The managed installation is already current.',
        };
      }
      return {
        targets,
        destination,
        mode: 'update',
        managed: true,
        modified,
        reason: 'Managed installation will be updated.',
      };
    }
    if (request.action === 'rollback') {
      if (current?.backupPath === undefined || current.previousReceiptId === undefined) {
        throw new InstallerError(
          'ROLLBACK_NOT_AVAILABLE',
          `No managed rollback is available: ${destination}`,
        );
      }
      if (exists && modified && request.force !== true) {
        throw new InstallerError(
          'MODIFIED_INSTALLATION',
          `Managed files were modified: ${destination}`,
        );
      }
      return {
        targets,
        destination,
        mode: 'restore',
        managed,
        modified,
        reason: 'The previous managed version will be restored.',
      };
    }
    if (!managed || !exists) {
      throw new InstallerError(
        'INSTALLATION_NOT_FOUND',
        `No managed installation exists: ${destination}`,
      );
    }
    if (modified && request.force !== true) {
      throw new InstallerError(
        'MODIFIED_INSTALLATION',
        `Managed files were modified: ${destination}`,
      );
    }
    return {
      targets,
      destination,
      mode: 'remove',
      managed: true,
      modified,
      reason: 'Managed files will be removed and retained as a rollback backup.',
    };
  }

  private async activateOperation(
    plan: InstallPlan,
    operation: InstallOperation,
    request: InstallerRequest,
  ): Promise<InstallReceipt> {
    const transactionId = this.idGenerator.next();
    const stagingPath = `${operation.destination}.omnibranch-stage-${transactionId}`;
    const previousPath = `${operation.destination}.omnibranch-previous-${transactionId}`;
    const backupPath = path.join(plan.stateRoot, 'backups', transactionId, 'omnibranch');
    await mkdir(path.dirname(operation.destination), { recursive: true });
    await this.assertTransactionPaths(operation.destination, stagingPath, previousPath, plan);
    await rm(stagingPath, { recursive: true, force: true });
    await cp(this.payloadRoot, stagingPath, { recursive: true, errorOnExist: true });
    await this.validatePayload(stagingPath);
    let journal: InstallerRecoveryJournal = {
      schemaVersion: SCHEMA_VERSION,
      transactionId,
      action: request.action,
      phase: 'prepared',
      destination: operation.destination,
      stagingPath,
      previousPath,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writeJournal(plan.stateRoot, journal);
    const state = await this.readState(plan.stateRoot);
    const previousReceipt = activeReceipt(state, operation.destination);
    if (await pathExists(operation.destination)) {
      await rename(operation.destination, previousPath);
      await mkdir(path.dirname(backupPath), { recursive: true });
      await cp(previousPath, backupPath, { recursive: true, errorOnExist: true });
      journal = {
        ...journal,
        phase: 'backup_created',
        backupPath,
        updatedAt: this.clock.now().toISOString(),
      };
      await this.writeJournal(plan.stateRoot, journal);
    }
    await rename(stagingPath, operation.destination);
    const receipt: InstallReceipt = {
      schemaVersion: SCHEMA_VERSION,
      receiptId: transactionId,
      action: request.action,
      targets: operation.targets,
      scope: plan.scope,
      destination: operation.destination,
      stateRoot: plan.stateRoot,
      payloadVersion: plan.payloadVersion,
      payloadSha256: plan.payloadSha256,
      installedAt: this.clock.now().toISOString(),
      files: await enumerateFiles(operation.destination),
      active: true,
      ...((await pathExists(backupPath)) ? { backupPath } : {}),
      ...(previousReceipt === undefined ? {} : { previousReceiptId: previousReceipt.receiptId }),
    };
    journal = {
      ...journal,
      phase: 'activated',
      receipt,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writeJournal(plan.stateRoot, journal);
    await this.appendReceipt(plan.stateRoot, receipt);
    await this.writeJournal(plan.stateRoot, {
      ...journal,
      phase: 'state_written',
      updatedAt: this.clock.now().toISOString(),
    });
    await rm(previousPath, { recursive: true, force: true });
    await rm(this.journalPath(plan.stateRoot), { force: true });
    return receipt;
  }

  private async removeOperation(
    plan: InstallPlan,
    operation: InstallOperation,
    request: InstallerRequest,
  ): Promise<InstallReceipt> {
    const transactionId = this.idGenerator.next();
    const previousPath = `${operation.destination}.omnibranch-previous-${transactionId}`;
    const stagingPath = `${operation.destination}.omnibranch-stage-${transactionId}`;
    const backupPath = path.join(plan.stateRoot, 'backups', transactionId, 'omnibranch');
    await mkdir(path.dirname(operation.destination), { recursive: true });
    await this.assertTransactionPaths(operation.destination, stagingPath, previousPath, plan);
    const state = await this.readState(plan.stateRoot);
    const previousReceipt = activeReceipt(state, operation.destination);
    if (previousReceipt === undefined)
      throw new InstallerError(
        'INSTALLATION_NOT_FOUND',
        'Managed receipt disappeared during uninstall.',
      );
    let journal: InstallerRecoveryJournal = {
      schemaVersion: SCHEMA_VERSION,
      transactionId,
      action: request.action,
      phase: 'prepared',
      destination: operation.destination,
      stagingPath,
      previousPath,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writeJournal(plan.stateRoot, journal);
    await rename(operation.destination, previousPath);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await cp(previousPath, backupPath, { recursive: true, errorOnExist: true });
    journal = {
      ...journal,
      phase: 'backup_created',
      backupPath,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writeJournal(plan.stateRoot, journal);
    const receipt: InstallReceipt = {
      schemaVersion: SCHEMA_VERSION,
      receiptId: transactionId,
      action: 'uninstall',
      targets: operation.targets,
      scope: plan.scope,
      destination: operation.destination,
      stateRoot: plan.stateRoot,
      payloadVersion: previousReceipt.payloadVersion,
      payloadSha256: previousReceipt.payloadSha256,
      installedAt: this.clock.now().toISOString(),
      files: [],
      active: true,
      backupPath,
      previousReceiptId: previousReceipt.receiptId,
    };
    await this.writeJournal(plan.stateRoot, {
      ...journal,
      phase: 'activated',
      receipt,
      updatedAt: this.clock.now().toISOString(),
    });
    await this.appendReceipt(plan.stateRoot, receipt);
    await this.writeJournal(plan.stateRoot, {
      ...journal,
      phase: 'state_written',
      receipt,
      updatedAt: this.clock.now().toISOString(),
    });
    await rm(previousPath, { recursive: true, force: true });
    await rm(this.journalPath(plan.stateRoot), { force: true });
    return receipt;
  }

  private async restoreOperation(
    plan: InstallPlan,
    operation: InstallOperation,
    request: InstallerRequest,
  ): Promise<InstallReceipt> {
    const state = await this.readState(plan.stateRoot);
    const current = activeReceipt(state, operation.destination);
    if (current?.backupPath === undefined || current.previousReceiptId === undefined) {
      throw new InstallerError(
        'ROLLBACK_NOT_AVAILABLE',
        'Rollback evidence disappeared before execution.',
      );
    }
    const previous = state.receipts.find(
      (receipt) => receipt.receiptId === current.previousReceiptId,
    );
    if (previous === undefined || !(await pathExists(current.backupPath))) {
      throw new InstallerError(
        'ROLLBACK_NOT_AVAILABLE',
        'Previous receipt or backup is unavailable.',
      );
    }
    const transactionId = this.idGenerator.next();
    const stagingPath = `${operation.destination}.omnibranch-stage-${transactionId}`;
    const previousPath = `${operation.destination}.omnibranch-previous-${transactionId}`;
    const forwardBackup = path.join(plan.stateRoot, 'backups', transactionId, 'omnibranch');
    await mkdir(path.dirname(operation.destination), { recursive: true });
    await this.assertTransactionPaths(operation.destination, stagingPath, previousPath, plan);
    await cp(current.backupPath, stagingPath, { recursive: true, errorOnExist: true });
    let journal: InstallerRecoveryJournal = {
      schemaVersion: SCHEMA_VERSION,
      transactionId,
      action: request.action,
      phase: 'prepared',
      destination: operation.destination,
      stagingPath,
      previousPath,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writeJournal(plan.stateRoot, journal);
    if (await pathExists(operation.destination)) {
      await rename(operation.destination, previousPath);
      await mkdir(path.dirname(forwardBackup), { recursive: true });
      await cp(previousPath, forwardBackup, { recursive: true, errorOnExist: true });
      journal = {
        ...journal,
        phase: 'backup_created',
        backupPath: forwardBackup,
        updatedAt: this.clock.now().toISOString(),
      };
      await this.writeJournal(plan.stateRoot, journal);
    }
    await rename(stagingPath, operation.destination);
    const receipt: InstallReceipt = {
      schemaVersion: SCHEMA_VERSION,
      receiptId: transactionId,
      action: 'rollback',
      targets: operation.targets,
      scope: plan.scope,
      destination: operation.destination,
      stateRoot: plan.stateRoot,
      payloadVersion: previous.payloadVersion,
      payloadSha256: previous.payloadSha256,
      installedAt: this.clock.now().toISOString(),
      files: await enumerateFiles(operation.destination),
      active: true,
      ...((await pathExists(forwardBackup)) ? { backupPath: forwardBackup } : {}),
      previousReceiptId: current.receiptId,
    };
    await this.writeJournal(plan.stateRoot, {
      ...journal,
      phase: 'activated',
      receipt,
      updatedAt: this.clock.now().toISOString(),
    });
    await this.appendReceipt(plan.stateRoot, receipt);
    await this.writeJournal(plan.stateRoot, {
      ...journal,
      phase: 'state_written',
      receipt,
      updatedAt: this.clock.now().toISOString(),
    });
    await rm(previousPath, { recursive: true, force: true });
    await rm(this.journalPath(plan.stateRoot), { force: true });
    return receipt;
  }

  private async recoverLocked(stateRoot: string): Promise<readonly string[]> {
    const journalPath = this.journalPath(stateRoot);
    if (!(await pathExists(journalPath))) return [];
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as InstallerRecoveryJournal;
    if (journal.schemaVersion !== SCHEMA_VERSION) {
      throw new InstallerError('RECOVERY_INCOMPLETE', 'Unsupported installer recovery journal.');
    }
    await this.assertRecoveryJournal(stateRoot, journal);
    const actions: string[] = [];
    if (journal.phase === 'activated' && journal.receipt !== undefined) {
      const state = await this.readState(stateRoot);
      if (!state.receipts.some((receipt) => receipt.receiptId === journal.receipt?.receiptId)) {
        await this.appendReceipt(stateRoot, journal.receipt);
        actions.push('finalized_receipt');
      }
    } else if (
      journal.phase === 'backup_created' &&
      journal.previousPath !== undefined &&
      (await pathExists(journal.previousPath)) &&
      !(await pathExists(journal.destination))
    ) {
      await rename(journal.previousPath, journal.destination);
      actions.push('restored_previous_destination');
    }
    if (journal.phase === 'prepared' || journal.phase === 'backup_created') {
      await rm(journal.stagingPath, { recursive: true, force: true });
      actions.push('removed_staging');
    }
    if (
      journal.previousPath !== undefined &&
      (journal.phase === 'activated' || (await pathExists(journal.destination)))
    ) {
      await rm(journal.previousPath, { recursive: true, force: true });
      actions.push('removed_previous_tombstone');
    }
    await rm(journalPath, { force: true });
    actions.push('cleared_journal');
    return actions;
  }

  private async appendReceipt(stateRoot: string, receipt: InstallReceipt): Promise<void> {
    const state = await this.readState(stateRoot);
    const receipts = state.receipts.map((existing) =>
      existing.destination === receipt.destination && existing.active
        ? { ...existing, active: false }
        : existing,
    );
    receipts.push(receipt);
    await atomicWrite(
      this.statePath(stateRoot),
      `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, receipts }, null, 2)}\n`,
    );
  }

  private async readState(stateRoot: string): Promise<InstallerState> {
    const statePath = this.statePath(stateRoot);
    if (!(await pathExists(statePath))) return { schemaVersion: SCHEMA_VERSION, receipts: [] };
    const state = JSON.parse(await readFile(statePath, 'utf8')) as InstallerState;
    if (state.schemaVersion !== SCHEMA_VERSION || !Array.isArray(state.receipts)) {
      throw new InstallerError('INTEGRITY_FAILURE', 'Unsupported or malformed installer state.');
    }
    return state;
  }

  private async validatePayload(
    root = this.payloadRoot,
  ): Promise<{ version: string; sha256: string; files: readonly InstalledFileEvidence[] }> {
    const files = await enumerateFiles(root);
    const skill = files.find((file) => file.path === 'SKILL.md');
    if (skill === undefined)
      throw new InstallerError('INTEGRITY_FAILURE', 'Skill payload is missing SKILL.md.');
    const skillText = await readFile(path.join(root, 'SKILL.md'), 'utf8');
    if (
      !/^---\r?\n[\s\S]*?\bname:\s*omnibranch\s*\r?\n[\s\S]*?\bdescription:\s*.+?\r?\n---/m.test(
        skillText,
      )
    ) {
      throw new InstallerError('INTEGRITY_FAILURE', 'SKILL.md frontmatter is invalid.');
    }
    for (const match of skillText.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (target?.startsWith('references/')) {
        const normalized = normalizeRepositoryPath(target);
        if (!files.some((file) => file.path === normalized)) {
          throw new InstallerError('INTEGRITY_FAILURE', `Skill reference is missing: ${target}`);
        }
      }
    }
    const metadataPath = path.join(root, 'metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
      version?: unknown;
      name?: unknown;
    };
    if (metadata.name !== 'omnibranch' || typeof metadata.version !== 'string') {
      throw new InstallerError('INTEGRITY_FAILURE', 'Skill metadata is invalid.');
    }
    return { version: metadata.version, sha256: stableHash(JSON.stringify(files)), files };
  }

  private async expandTargets(
    requested: ProviderTarget,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<{ targets: readonly ConcreteProviderTarget[]; warnings: readonly string[] }> {
    const warnings: string[] = [];
    let targets: readonly ConcreteProviderTarget[];
    if (requested === 'auto') {
      const detected = await this.detectedTargets();
      targets = detected.length === 0 ? ['agents'] : detected;
      if (detected.length === 0)
        warnings.push(
          'No provider configuration was detected; using the generic Agent Skills target.',
        );
    } else if (requested === 'all') {
      targets = CONCRETE_TARGETS;
    } else {
      targets = [requested];
    }
    if (scope === 'project' && targets.includes('codex')) {
      if (requested === 'codex') {
        throw new InstallerError(
          'TARGET_SCOPE_UNSUPPORTED',
          'Codex project scope is not verified; use --target agents.',
        );
      }
      targets = targets.filter((target) => target !== 'codex');
      warnings.push(
        'Codex project scope was skipped; the generic Agent Skills target covers the project installation.',
      );
    }
    for (const target of targets) await this.resolveDestination(target, scope, projectRoot);
    return { targets: [...new Set(targets)], warnings };
  }

  private async detectedTargets(): Promise<readonly ConcreteProviderTarget[]> {
    if (this.detectedTargetOverride !== undefined) return [...this.detectedTargetOverride];
    const candidates: [ConcreteProviderTarget, string][] = [
      ['codex', this.environment['CODEX_HOME'] ?? path.join(this.homeDirectory, '.codex')],
      ['claude', path.join(this.homeDirectory, '.claude')],
      [
        'opencode',
        path.join(
          this.environment['XDG_CONFIG_HOME'] ?? path.join(this.homeDirectory, '.config'),
          'opencode',
        ),
      ],
      ['antigravity', path.join(this.homeDirectory, '.gemini', 'config', 'skills')],
      ['agents', path.join(this.homeDirectory, '.agents')],
    ];
    const detected: ConcreteProviderTarget[] = [];
    for (const [target, candidate] of candidates)
      if (await pathExists(candidate)) detected.push(target);
    return detected;
  }

  private async resolveScope(
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<{ projectRoot?: string }> {
    if (scope === 'user') return {};
    if (projectRoot === undefined)
      throw new InstallerError('PROJECT_ROOT_REQUIRED', 'Project scope requires a project root.');
    try {
      return { projectRoot: await realpath(path.resolve(projectRoot)) };
    } catch (error) {
      throw new InstallerError('PROJECT_ROOT_REQUIRED', 'Project root does not exist.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async resolveDestination(
    target: ConcreteProviderTarget,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<{ destination: string; allowedRoot: string }> {
    if (scope === 'project') {
      if (projectRoot === undefined)
        throw new InstallerError('PROJECT_ROOT_REQUIRED', 'Project root is required.');
      if (target === 'codex')
        throw new InstallerError(
          'TARGET_SCOPE_UNSUPPORTED',
          'Codex project scope is not verified; use the generic target.',
        );
      const relative =
        target === 'claude'
          ? ['.claude', 'skills']
          : target === 'opencode'
            ? ['.opencode', 'skills']
            : ['.agents', 'skills'];
      return {
        destination: path.join(projectRoot, ...relative, 'omnibranch'),
        allowedRoot: projectRoot,
      };
    }
    switch (target) {
      case 'codex': {
        const root = path.resolve(
          this.environment['CODEX_HOME'] ?? path.join(this.homeDirectory, '.codex'),
        );
        return { destination: path.join(root, 'skills', 'omnibranch'), allowedRoot: root };
      }
      case 'claude': {
        const root = path.join(this.homeDirectory, '.claude');
        return { destination: path.join(root, 'skills', 'omnibranch'), allowedRoot: root };
      }
      case 'opencode': {
        const root = path.join(
          this.environment['XDG_CONFIG_HOME'] ?? path.join(this.homeDirectory, '.config'),
          'opencode',
        );
        return { destination: path.join(root, 'skills', 'omnibranch'), allowedRoot: root };
      }
      case 'antigravity': {
        const root = path.join(this.homeDirectory, '.gemini', 'config', 'skills');
        return {
          destination: path.join(root, 'omnibranch'),
          allowedRoot: path.join(this.homeDirectory, '.gemini'),
        };
      }
      case 'agents': {
        const root = path.join(this.homeDirectory, '.agents');
        return { destination: path.join(root, 'skills', 'omnibranch'), allowedRoot: root };
      }
    }
  }

  private stateRoot(scope: InstallScope, projectRoot?: string): string {
    return scope === 'user'
      ? path.join(this.homeDirectory, '.omnibranch', 'installer')
      : path.join(projectRoot ?? '', '.omnibranch', 'installer');
  }

  private async assertDestinationContained(root: string, destination: string): Promise<void> {
    try {
      if (!isPathInside(root, destination)) throw new Error('Destination is outside its root.');
      if (await pathExists(root)) await canonicalPathInside(root, destination);
    } catch (error) {
      throw new InstallerError(
        'CONTAINMENT_FAILURE',
        `Destination escapes its provider root: ${destination}`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  private async assertTransactionPaths(
    destination: string,
    stagingPath: string,
    previousPath: string,
    plan: InstallPlan,
  ): Promise<void> {
    const parent = path.dirname(destination);
    try {
      await mkdir(parent, { recursive: true });
      await mkdir(plan.stateRoot, { recursive: true });
      await canonicalPathInside(parent, stagingPath);
      await canonicalPathInside(parent, previousPath);
      await canonicalPathInside(plan.stateRoot, path.join(plan.stateRoot, 'backups'));
    } catch (error) {
      throw new InstallerError(
        'CONTAINMENT_FAILURE',
        'Installer transaction path escaped its allowed root.',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  private async assertRecoveryJournal(
    stateRoot: string,
    journal: InstallerRecoveryJournal,
  ): Promise<void> {
    const parent = path.dirname(journal.destination);
    const transactionId = journal.transactionId;
    const expectedStaging = `${journal.destination}.omnibranch-stage-${transactionId}`;
    const expectedPrevious = `${journal.destination}.omnibranch-previous-${transactionId}`;
    try {
      if (journal.stagingPath !== expectedStaging) throw new Error('Unexpected staging path.');
      if (journal.previousPath !== undefined && journal.previousPath !== expectedPrevious)
        throw new Error('Unexpected previous path.');
      if (!isPathInside(parent, journal.stagingPath)) throw new Error('Staging path escaped.');
      if (journal.backupPath !== undefined && !isPathInside(stateRoot, journal.backupPath))
        throw new Error('Backup path escaped.');
      await canonicalPathInside(stateRoot, this.journalPath(stateRoot));
    } catch (error) {
      throw new InstallerError('RECOVERY_INCOMPLETE', 'Recovery journal paths are unsafe.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private statePath(stateRoot: string): string {
    return path.join(stateRoot, 'installations.json');
  }

  private journalPath(stateRoot: string): string {
    return path.join(stateRoot, 'journal.json');
  }

  private async writeJournal(stateRoot: string, journal: InstallerRecoveryJournal): Promise<void> {
    await atomicWrite(this.journalPath(stateRoot), `${JSON.stringify(journal, null, 2)}\n`);
  }
}

async function enumerateFiles(root: string): Promise<readonly InstalledFileEvidence[]> {
  const files: InstalledFileEvidence[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      const information = await lstat(absolute);
      if (information.isSymbolicLink())
        throw new InstallerError(
          'INTEGRITY_FAILURE',
          `Symbolic links are not allowed in skill payloads: ${relative}`,
        );
      if (information.isDirectory()) await visit(absolute);
      else if (information.isFile()) {
        const contents = await readFile(absolute);
        files.push({
          path: normalizeRepositoryPath(relative),
          sha256: stableHash(contents),
          size: contents.byteLength,
          executable: (information.mode & 0o111) !== 0,
        });
      } else
        throw new InstallerError('INTEGRITY_FAILURE', `Unsupported payload entry: ${relative}`);
    }
  }
  await visit(root);
  return files;
}

async function receiptMatches(receipt: InstallReceipt, destination: string): Promise<boolean> {
  try {
    const actual = await enumerateFiles(destination);
    return stableHash(JSON.stringify(actual)) === stableHash(JSON.stringify(receipt.files));
  } catch {
    return false;
  }
}

function activeReceipt(state: InstallerState, destination: string): InstallReceipt | undefined {
  return [...state.receipts]
    .reverse()
    .find((receipt) => receipt.destination === destination && receipt.active);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function ensureExecutable(filePath: string): Promise<void> {
  if (process.platform !== 'win32') {
    const information = await stat(filePath);
    await chmod(filePath, information.mode | 0o755);
  }
}
