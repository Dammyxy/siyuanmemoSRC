import { describe, expect, it } from 'vitest';
import type { StorageInventoryMetric } from '../../../packages/contracts/src/backend-rpc';
import {
  DEFAULT_WORKER_STORAGE_BUDGET_POLICIES,
  classifyWorkerStoragePressure,
} from '../WorkerStoragePressureClassifier';

function metric(
  family: string,
  overrides: Partial<StorageInventoryMetric> = {},
): StorageInventoryMetric {
  return {
    family,
    deviceId: 'device-a',
    identityEpoch: 'epoch-1',
    files: 0,
    bytes: 0,
    oldestAgeMs: null,
    generationCount: 0,
    currentGenerationId: null,
    previousGenerationId: null,
    uncoveredMutationCount: 0,
    compactionStatus: 'idle',
    ...overrides,
  };
}

describe('WorkerStoragePressureClassifier', () => {
  it('classifies accepted default delta, truth, projection, and generation budgets', () => {
    const result = classifyWorkerStoragePressure([
      metric('sqlite-delta', { files: 48, bytes: 3 * 1024 * 1024 }),
      metric('review-events', { files: 48, bytes: 48 * 1024 * 1024, generationCount: 1 }),
      metric('card-memory-facts', { files: 20, bytes: 40 * 1024 * 1024, generationCount: 3 }),
      metric('temporary-sqlite-projection', { files: 1, bytes: 64 * 1024 * 1024 }),
    ], 10_000, DEFAULT_WORKER_STORAGE_BUDGET_POLICIES);

    expect(result.level).toBe('high');
    expect(result.blockingMutationGrowth).toBe(false);
    expect(result.code).toBeNull();
    expect(result.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'sqlite-delta',
        level: 'high',
        targetFiles: 16,
        softFiles: 32,
        highFiles: 48,
        hardFiles: 64,
      }),
      expect.objectContaining({
        family: 'review-events',
        level: 'soft',
        targetFiles: 16,
        softFiles: 48,
        highFiles: 72,
        hardFiles: 96,
      }),
      expect.objectContaining({
        family: 'card-memory-facts',
        level: 'soft',
        targetGenerations: 2,
        softGenerations: 3,
        highGenerations: 4,
        hardGenerations: 5,
      }),
      expect.objectContaining({
        family: 'temporary-sqlite-projection',
        level: 'soft',
        targetBytes: 32 * 1024 * 1024,
        softBytes: 64 * 1024 * 1024,
        highBytes: 96 * 1024 * 1024,
        hardBytes: 128 * 1024 * 1024,
      }),
    ]));
  });

  it('supports custom count, byte, age, and generation thresholds', () => {
    const result = classifyWorkerStoragePressure([
      metric('custom-family', {
        files: 3,
        bytes: 400,
        oldestAgeMs: 900,
        generationCount: 2,
      }),
    ], 20_000, [{
      family: 'custom-family',
      files: { target: 1, soft: 2, high: 3, hard: 4 },
      bytes: { target: 100, soft: 200, high: 300, hard: 400 },
      oldestAgeMs: { target: 100, soft: 300, high: 600, hard: 900 },
      generations: { target: 1, soft: 2, high: 3, hard: 4 },
    }]);

    expect(result).toMatchObject({
      level: 'hard',
      blockingMutationGrowth: false,
      code: null,
      reason: expect.stringContaining('custom-family'),
      metrics: [{
        family: 'custom-family',
        level: 'hard',
        targetBytes: 100,
        softBytes: 200,
        highBytes: 300,
        hardBytes: 400,
        targetOldestAgeMs: 100,
        softOldestAgeMs: 300,
        highOldestAgeMs: 600,
        hardOldestAgeMs: 900,
        targetGenerations: 1,
        softGenerations: 2,
        highGenerations: 3,
        hardGenerations: 4,
        reason: expect.stringContaining('bytes'),
      }],
    });
  });
});
