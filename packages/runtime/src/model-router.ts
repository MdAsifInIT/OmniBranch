import type { ModelProfile } from '@omnibranch/contracts';

export type { ModelProfile };

export interface TaskModelRequirements {
  readonly requiredContextWindow?: number;
  readonly contextWindow?: number;
  readonly estimatedTokens?: number;
  readonly requiredCapabilities?: readonly string[];
  readonly requestedCapabilities?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly maxCost?: number;
  readonly maxLatency?: number;
}

export function filterAndRankModels(
  task: TaskModelRequirements,
  models: readonly ModelProfile[],
): ModelProfile[] {
  const minContext =
    task.requiredContextWindow ?? task.contextWindow ?? task.estimatedTokens ?? 0;
  const reqCapabilities =
    task.requiredCapabilities ?? task.requestedCapabilities ?? task.capabilities ?? [];

  const filtered = models.filter((model) => {
    if (minContext > 0 && model.contextWindow < minContext) {
      return false;
    }

    for (const reqCap of reqCapabilities) {
      const hasCap = model.capabilities.some(
        (cap) => cap.toLowerCase() === reqCap.toLowerCase(),
      );
      if (!hasCap) {
        return false;
      }
    }

    if (task.maxCost !== undefined && model.cost > task.maxCost) {
      return false;
    }

    if (
      task.maxLatency !== undefined &&
      model.latency !== undefined &&
      model.latency > task.maxLatency
    ) {
      return false;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    const costDiff = left.cost - right.cost;
    if (costDiff !== 0) return costDiff;

    const leftLatency = left.latency ?? Number.POSITIVE_INFINITY;
    const rightLatency = right.latency ?? Number.POSITIVE_INFINITY;
    const latencyDiff = leftLatency - rightLatency;
    if (latencyDiff !== 0) return latencyDiff;

    return left.id.localeCompare(right.id);
  });
}

export function selectModel(
  task: TaskModelRequirements,
  models: readonly ModelProfile[],
): ModelProfile | undefined {
  const ranked = filterAndRankModels(task, models);
  return ranked[0];
}
