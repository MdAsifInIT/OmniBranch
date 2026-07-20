import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CampaignId,
  EventEnvelope,
  TaskHistoryConfig,
  TaskHistoryEntry,
  TaskHistorySearchResult,
  TaskHistoryWorkItem,
  WorkItemProjection,
} from '@omnibranch/contracts';
import { atomicWrite, type Clock, SystemClock } from '@omnibranch/platform';

const DEFAULT_CONFIG: TaskHistoryConfig = {
  outputPath: '.omnibranch/task_history.md',
  maxEntries: 100,
  autoAppend: true,
};

export class TaskHistoryService {
  constructor(
    private readonly repositoryRoot: string,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /**
   * Append a campaign entry to task_history.md.
   * Reads existing entries, appends the new one, enforces maxEntries FIFO.
   */
  async append(entry: TaskHistoryEntry, config?: Partial<TaskHistoryConfig>): Promise<string> {
    const maxEntries = config?.maxEntries ?? DEFAULT_CONFIG.maxEntries;
    const outputPath = path.resolve(
      this.repositoryRoot,
      config?.outputPath ?? DEFAULT_CONFIG.outputPath,
    );

    const existingEntries = await this.show(config);
    let updatedEntries = [...existingEntries, entry];
    updatedEntries = this.enforceRotation(updatedEntries, maxEntries);

    let content = `# OmniBranch Task History\n\n`;
    for (const e of updatedEntries) {
      content += this.formatEntry(e);
    }

    await atomicWrite(outputPath, content);
    return outputPath;
  }

  /**
   * Build a TaskHistoryEntry from campaign events and projections.
   * This is the bridge between the event store and the history format.
   */
  buildEntry(
    campaignId: CampaignId,
    name: string,
    workItems: readonly WorkItemProjection[],
    events: readonly EventEnvelope[],
    branchesTouched: readonly string[],
  ): TaskHistoryEntry {
    const durationMs = 0;
    const historyWorkItems = workItems.map((wi): TaskHistoryWorkItem => ({
      workItemId: wi.item.workItemId,
      kind: wi.item.kind,
      summary: wi.item.summary,
      status: wi.status,
      attempts: wi.attempt,
    }));

    return {
      campaignId,
      name,
      objective: `Campaign ${name}`,
      timestamp: this.clock.now().toISOString(),
      workItems: historyWorkItems,
      branchesTouched,
      filesChanged: this.extractFilesChanged(events),
      outcome: this.determineOutcome(workItems),
      durationMs,
    };
  }

  /**
   * Read and parse all entries from task_history.md.
   * Each entry is delimited by `---` and has YAML frontmatter.
   */
  async show(config?: Partial<TaskHistoryConfig>): Promise<readonly TaskHistoryEntry[]> {
    const outputPath = path.resolve(
      this.repositoryRoot,
      config?.outputPath ?? DEFAULT_CONFIG.outputPath,
    );
    try {
      const content = await readFile(outputPath, 'utf8');
      const blocks = content
        .split('\n---\n')
        .filter((b) => b.trim().length > 0 && b.includes('campaignId:'));
      return blocks.map((b) => this.parseEntry(b)).filter((e): e is TaskHistoryEntry => e !== null);
    } catch {
      return [];
    }
  }

  /**
   * Search entries by substring match across name, objective, files, branches.
   */
  async search(
    query: string,
    config?: Partial<TaskHistoryConfig>,
  ): Promise<TaskHistorySearchResult> {
    const entries = await this.show(config);
    const q = query.toLowerCase();
    const matches = entries.filter((e) => {
      return (
        e.name.toLowerCase().includes(q) ||
        e.objective.toLowerCase().includes(q) ||
        e.filesChanged.some((f) => f.toLowerCase().includes(q)) ||
        e.branchesTouched.some((b) => b.toLowerCase().includes(q))
      );
    });
    return {
      query,
      matches,
      totalEntries: entries.length,
    };
  }

  // ─── Private helpers ───

  /** Format a single entry as Markdown with YAML frontmatter */
  private formatEntry(entry: TaskHistoryEntry): string {
    let out = `---\ncampaignId: ${entry.campaignId}\nname: ${entry.name}\ntimestamp: ${entry.timestamp}\noutcome: ${entry.outcome}\nduration: ${entry.durationMs}\n---\n\n`;
    out += `## ${entry.name}\n\n`;
    out += `**Objective:** ${entry.objective}\n\n`;
    out += `### Work Items\n| ID | Kind | Summary | Status | Attempts |\n|----|------|---------|--------|----------|\n`;
    for (const wi of entry.workItems) {
      out += `| ${wi.workItemId} | ${wi.kind} | ${wi.summary} | ${wi.status} | ${wi.attempts} |\n`;
    }
    out += `\n### Branches Touched\n`;
    for (const b of entry.branchesTouched) {
      out += `- \`${b}\`\n`;
    }
    out += `\n### Files Changed\n`;
    for (const f of entry.filesChanged) {
      out += `- \`${f}\`\n`;
    }
    if (entry.notes) {
      out += `\n### Notes\n${entry.notes}\n`;
    }
    out += `\n`;
    return out;
  }

  /** Parse a single entry block back into a TaskHistoryEntry */
  private parseEntry(block: string): TaskHistoryEntry | null {
    try {
      const lines = block.split('\n');
      const getMeta = (key: string): string => {
        const line = lines.find((l) => l.startsWith(`${key}:`));
        return line ? (line.split(':')[1]?.trim() ?? '') : '';
      };
      const campaignId = getMeta('campaignId') as CampaignId;
      const name = getMeta('name');
      const timestamp = getMeta('timestamp');
      const outcome = getMeta('outcome') as 'complete' | 'partial' | 'failed' | 'canceled';
      const durationMs = parseInt(getMeta('duration') || '0', 10);

      if (!campaignId || !name) return null;

      // Naive parsing for search purposes
      return {
        campaignId,
        name,
        objective: '',
        timestamp,
        workItems: [],
        branchesTouched: [],
        filesChanged: [],
        outcome,
        durationMs,
      };
    } catch {
      return null;
    }
  }

  /** Enforce maxEntries by removing oldest entries (FIFO) */
  private enforceRotation(entries: TaskHistoryEntry[], max: number): TaskHistoryEntry[] {
    if (entries.length <= max) return entries;
    return entries.slice(entries.length - max);
  }

  /** Determine campaign outcome from work item statuses */
  private determineOutcome(items: readonly WorkItemProjection[]): TaskHistoryEntry['outcome'] {
    if (items.length === 0) return 'complete';
    const allSucceeded = items.every((i) => i.status === 'succeeded');
    if (allSucceeded) return 'complete';
    const anySucceeded = items.some((i) => i.status === 'succeeded');
    const anyFailed = items.some((i) => i.status === 'failed');
    if (anySucceeded && !anyFailed) return 'partial';
    if (items.every((i) => i.status === 'canceled')) return 'canceled';
    return 'failed';
  }

  /** Extract files changed from adapter.completed events */
  private extractFilesChanged(events: readonly EventEnvelope[]): readonly string[] {
    const files = new Set<string>();
    // Simulating file extraction - in reality we would parse 'adapter.completed' payload
    for (const e of events) {
      if (
        e.payload &&
        typeof e.payload === 'object' &&
        'type' in e.payload &&
        (e.payload as { type?: string }).type === 'adapter.completed'
      ) {
        // In a real implementation we'd read files from the result
      }
    }
    return Array.from(files);
  }
}
