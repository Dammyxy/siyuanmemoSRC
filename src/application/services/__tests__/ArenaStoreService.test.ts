import { describe, expect, it, vi } from 'vitest';
import { ArenaStoreService } from '@/application/services/ArenaStoreService';
import type { SqlArenaRepository } from '@/infrastructure/persistence/sqlite';
import type {
  ArenaCardAttributionRecord,
  ArenaMatchRecord,
  ArenaScoreSnapshot,
  ArenaStoreData,
} from '@/types/arena';

class MemoryArenaFileService {
  store: ArenaStoreData | null = null;
  writeCount = 0;

  async readJSON<T>(): Promise<T | null> {
    return this.store as T | null;
  }

  async writeJSON(_fileName: string, data: unknown): Promise<void> {
    this.writeCount += 1;
    this.store = data as ArenaStoreData;
  }
}

function createMatch(id = 'match-1'): ArenaMatchRecord {
  return {
    id,
    domain: 'ai',
    poolKey: 'pool-a',
    createdAt: 1_700_000_000_000,
    surface: 'standalone-dialog',
    scenarioId: 'candidate-card-generation',
    targetKind: 'note',
    ai: {
      exposureId: 'exposure-1',
      sessionId: null,
      packId: 'pack-a',
      challengerPackIds: [],
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
      eventType: 'create',
      scoreDelta: 2,
    },
  };
}

function createSnapshot(id = 'score-1'): ArenaScoreSnapshot {
  return {
    id,
    domain: 'ai',
    poolKey: 'pool-a',
    createdAt: 1_700_000_000_001,
    entries: [{
      contestantId: 'pack-a',
      title: 'Pack A',
      weight: 1,
      score: 2,
      sampleCount: 1,
      winCount: 1,
      lossCount: 0,
      lastEventAt: 1_700_000_000_000,
    }],
  };
}

function createAttribution(cardId = 'card-1'): ArenaCardAttributionRecord {
  return {
    cardId,
    poolKey: 'pool-a',
    surface: 'standalone-dialog',
    scenarioId: 'candidate-card-generation',
    targetKind: 'note',
    sourcePackId: 'pack-a',
    sourcePackTitle: 'Pack A',
    exposureId: 'exposure-1',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    reviewCount: 0,
    lastReviewAt: null,
    lastOutcome: null,
  };
}

describe('ArenaStoreService commitBatch', () => {
  it('persists one SQL batch for multiple Arena mutations', async () => {
    const sqlRepository = {
      recordBatch: vi.fn(),
      persist: vi.fn(async () => {}),
    } as unknown as SqlArenaRepository;
    const service = new ArenaStoreService(new MemoryArenaFileService(), sqlRepository);

    await service.commitBatch({
      matches: [createMatch()],
      scoreSnapshots: [createSnapshot()],
      attributions: [createAttribution('card-1'), createAttribution('card-2')],
    });

    expect(sqlRepository.recordBatch).toHaveBeenCalledTimes(1);
    expect(sqlRepository.persist).toHaveBeenCalledTimes(1);
  });

  it('writes one legacy JSON store update for a batch', async () => {
    const fileService = new MemoryArenaFileService();
    const service = new ArenaStoreService(fileService);

    await service.commitBatch({
      matches: [createMatch()],
      scoreSnapshots: [createSnapshot()],
      attributions: [createAttribution('card-1'), createAttribution('card-2')],
    });

    expect(fileService.writeCount).toBe(1);
    expect(fileService.store?.matches).toHaveLength(1);
    expect(fileService.store?.scores).toHaveLength(1);
    expect(fileService.store?.attributions).toHaveLength(2);
  });
});
