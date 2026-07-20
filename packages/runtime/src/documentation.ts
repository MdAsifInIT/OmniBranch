import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectDocSection,
  ProjectDocumentConfig,
  ProjectDocumentResult,
  RepositoryFacts,
} from '@omnibranch/contracts';
import { atomicWrite, redact, type Clock, SystemClock } from '@omnibranch/platform';
import { RepositoryDiscovery } from './repository.js';
import { ExecaProcessRunner } from '@omnibranch/platform';

const DEFAULT_SECTIONS: readonly ProjectDocSection[] = [
  'repository_metadata',
  'directory_structure',
  'tech_stack',
  'architecture_notes',
  'branch_topology',
  'campaign_history',
  'conventions',
];

export class ProjectDocumentationService {
  constructor(
    private readonly repositoryRoot: string,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /** Generate project_context.md from scratch */
  async generate(config?: Partial<ProjectDocumentConfig>): Promise<ProjectDocumentResult> {
    const runner = new ExecaProcessRunner(this.clock);
    const facts = await new RepositoryDiscovery(runner).discover(this.repositoryRoot);
    const sections = config?.sections ?? DEFAULT_SECTIONS;
    const outputPath = path.resolve(this.repositoryRoot, config?.outputPath ?? '.omnibranch/project_context.md');
    
    let content = `# Project Context\n\n> Generated at: ${this.clock.now().toISOString()}\n\n`;

    for (const section of sections) {
      content += `<!-- omnibranch:section:${section} -->\n`;
      switch (section) {
        case 'repository_metadata':
          content += await this.repositoryMetadata(facts);
          break;
        case 'directory_structure':
          content += await this.directoryStructure();
          break;
        case 'tech_stack':
          content += await this.techStack();
          break;
        case 'architecture_notes':
          content += await this.architectureNotes();
          break;
        case 'branch_topology':
          content += await this.branchTopology(facts);
          break;
        case 'campaign_history':
          content += await this.campaignHistoryPointer();
          break;
        case 'conventions':
          content += await this.conventions();
          break;
      }
      content += `\n<!-- omnibranch:section:${section}:end -->\n\n`;
    }

    if (config?.redactUserPaths) {
        content = redact(content);
    }
    
    await atomicWrite(outputPath, content);
    const techStackArray = await this.detectTechStack();

    return {
      outputPath: config?.outputPath ?? '.omnibranch/project_context.md',
      sections,
      generatedAt: this.clock.now().toISOString(),
      repositoryName: path.basename(this.repositoryRoot),
      techStack: techStackArray,
      lineCount: content.split('\n').length,
    };
  }

  /** Incrementally update after a campaign completes */
  async update(campaignId: string, campaignSummary: string, config?: Partial<ProjectDocumentConfig>): Promise<ProjectDocumentResult> {
    const outputPath = path.resolve(this.repositoryRoot, config?.outputPath ?? '.omnibranch/project_context.md');
    let existingContent = '';
    try {
      existingContent = await readFile(outputPath, 'utf8');
    } catch (e) {
      // If file doesn't exist, just generate it first
      await this.generate(config);
      existingContent = await readFile(outputPath, 'utf8');
    }

    // Append campaign outcome to the bottom
    const newSection = `\n## Recent Campaign: ${campaignId}\n\n${campaignSummary}\n`;
    const newContent = await this.mergeIncrementally(existingContent, newSection);

    await atomicWrite(outputPath, newContent);

    return {
      outputPath: config?.outputPath ?? '.omnibranch/project_context.md',
      sections: config?.sections ?? DEFAULT_SECTIONS,
      generatedAt: this.clock.now().toISOString(),
      repositoryName: path.basename(this.repositoryRoot),
      techStack: await this.detectTechStack(),
      lineCount: newContent.split('\n').length,
    };
  }

  // ─── Section generators (private) ───

  private async repositoryMetadata(facts: RepositoryFacts): Promise<string> {
    let out = `## Repository Metadata\n\n`;
    out += `- **Root:** ${path.basename(facts.root)}\n`;
    out += `- **Default Branch:** ${facts.defaultBranch ?? 'unknown'}\n`;
    if (facts.remotes.length > 0) {
      out += `- **Remotes:**\n`;
      for (const r of facts.remotes) {
        out += `  - ${r.name}: ${r.url}\n`;
      }
    }
    return out;
  }

  private async directoryStructure(): Promise<string> {
    return `## Directory Structure\n\n- \`apps/\` - Applications\n- \`packages/\` - Shared libraries\n- \`skills/\` - OmniBranch skill definitions\n- \`docs/\` - Documentation\n- \`.omnibranch/\` - OmniBranch persistent state\n`;
  }

  private async techStack(): Promise<string> {
    const stack = await this.detectTechStack();
    return `## Tech Stack\n\n- ${stack.join('\n- ')}\n`;
  }

  private async architectureNotes(): Promise<string> {
    const readme = await this.readHead(path.resolve(this.repositoryRoot, 'README.md'), 20);
    const arch = await this.readHead(path.resolve(this.repositoryRoot, 'docs/01_ARCHITECTURE.md'), 20) || await this.readHead(path.resolve(this.repositoryRoot, 'ARCHITECTURE.md'), 20);
    let out = `## Architecture Notes\n\n`;
    if (arch) {
      out += `### ARCHITECTURE.md (Excerpt)\n\n${arch}\n\n`;
    }
    if (readme) {
      out += `### README.md (Excerpt)\n\n${readme}\n\n`;
    }
    if (!arch && !readme) {
        out += `*No architecture or readme documentation found.*\n`;
    }
    return out;
  }

  private async branchTopology(facts: RepositoryFacts): Promise<string> {
    let out = `## Branch Topology\n\n`;
    out += `- **Current Branch:** ${facts.currentBranch ?? 'detached'}\n`;
    out += `- **Active Worktrees:** ${facts.worktrees.length}\n`;
    return out;
  }

  private async campaignHistoryPointer(): Promise<string> {
    return `## Campaign History\n\nSee \`.omnibranch/task_history.md\` for a complete history of campaigns run in this repository.\n`;
  }

  private async conventions(): Promise<string> {
    let out = `## Conventions\n\n`;
    const editorConfig = await this.readHead(path.resolve(this.repositoryRoot, '.editorconfig'), 15);
    if (editorConfig) {
      out += `### .editorconfig (Excerpt)\n\n\`\`\`ini\n${editorConfig}\n\`\`\`\n\n`;
    } else {
        out += `*No conventions discovered.*\n`;
    }
    return out;
  }

  // ─── Helpers ───

  private async detectTechStack(): Promise<readonly string[]> {
    const stack: string[] = [];
    try {
      await stat(path.resolve(this.repositoryRoot, 'package.json'));
      stack.push('Node.js (package.json)');
    } catch {}
    try {
      await stat(path.resolve(this.repositoryRoot, 'tsconfig.json'));
      stack.push('TypeScript (tsconfig.json)');
    } catch {}
    try {
      await stat(path.resolve(this.repositoryRoot, 'Cargo.toml'));
      stack.push('Rust (Cargo.toml)');
    } catch {}
    try {
      await stat(path.resolve(this.repositoryRoot, 'go.mod'));
      stack.push('Go (go.mod)');
    } catch {}
    try {
      await stat(path.resolve(this.repositoryRoot, 'pyproject.toml'));
      stack.push('Python (pyproject.toml)');
    } catch {}
    return stack;
  }

  private async readHead(filePath: string, lines: number): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf8');
      const split = content.split('\n');
      if (split.length > lines) {
        return split.slice(0, lines).join('\n') + '\n... (truncated)';
      }
      return content;
    } catch {
      return null;
    }
  }

  private async mergeIncrementally(existing: string, newContent: string): Promise<string> {
    return `${existing}\n${newContent}`;
  }
}
