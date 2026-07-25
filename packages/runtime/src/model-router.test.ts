import { describe, expect, it } from 'vitest';
import type { ModelProfile } from '@omnibranch/contracts';
import { filterAndRankModels, selectModel } from './model-router.js';

describe('model-router', () => {
  const models: readonly ModelProfile[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      cost: 10,
      contextWindow: 128000,
      capabilities: ['code', 'reasoning', 'vision'],
      latency: 500,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      cost: 2,
      contextWindow: 128000,
      capabilities: ['code', 'reasoning'],
      latency: 200,
    },
    {
      id: 'claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      cost: 8,
      contextWindow: 200000,
      capabilities: ['code', 'reasoning', 'vision', 'tool-use'],
      latency: 600,
    },
    {
      id: 'claude-3-haiku',
      name: 'Claude 3 Haiku',
      cost: 1,
      contextWindow: 50000,
      capabilities: ['code'],
      latency: 150,
    },
  ];

  it('selects the cheapest model matching context window and capabilities', () => {
    const selected = selectModel(
      {
        requiredContextWindow: 100000,
        requiredCapabilities: ['code', 'reasoning'],
      },
      models,
    );

    expect(selected?.id).toBe('gpt-4o-mini');
  });

  it('filters out models with context window smaller than required', () => {
    const selected = selectModel(
      {
        requiredContextWindow: 150000,
        requiredCapabilities: ['code'],
      },
      models,
    );

    expect(selected?.id).toBe('claude-3-5-sonnet');
  });

  it('filters out models missing required capabilities', () => {
    const selected = selectModel(
      {
        requiredContextWindow: 40000,
        requiredCapabilities: ['tool-use'],
      },
      models,
    );

    expect(selected?.id).toBe('claude-3-5-sonnet');
  });

  it('filters by max cost and max latency when specified', () => {
    const selected = selectModel(
      {
        requiredContextWindow: 100000,
        requiredCapabilities: ['code'],
        maxCost: 5,
      },
      models,
    );

    expect(selected?.id).toBe('gpt-4o-mini');
  });

  it('returns undefined when no model satisfies requirements', () => {
    const selected = selectModel(
      {
        requiredContextWindow: 300000,
      },
      models,
    );

    expect(selected).toBeUndefined();
  });

  it('ranks models deterministically by cost, then latency, then id', () => {
    const duplicateCostModels: readonly ModelProfile[] = [
      {
        id: 'model-b',
        cost: 5,
        contextWindow: 100000,
        capabilities: ['code'],
        latency: 300,
      },
      {
        id: 'model-a',
        cost: 5,
        contextWindow: 100000,
        capabilities: ['code'],
        latency: 200,
      },
    ];

    const ranked = filterAndRankModels({ requiredCapabilities: ['code'] }, duplicateCostModels);
    expect(ranked.map((m) => m.id)).toEqual(['model-a', 'model-b']);
  });
});
