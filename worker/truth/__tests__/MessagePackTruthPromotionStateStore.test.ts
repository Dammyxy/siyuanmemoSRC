import { describe, expect, it } from 'vitest';
import type { MessagePackTruthSegmentFileStore } from '../MessagePackTruthSegmentStore';
import {
  MessagePackTruthPromotionStateStore,
} from '../MessagePackTruthPromotionStateStore';
import {
  WORKER_TRUTH_PROMOTION_STATE_VERSION,
  type WorkerTruthPromotionState,
} from '../WorkerTruthPromotionModule';

class MemoryFileStore implements MessagePackTruthSegmentFileStore {
  readonly json = new Map<string, unknown>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return structuredClone(this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, structuredClone(data));
  }

  async readBinary(): Promise<Uint8Array | null> {
    return null;
  }

  async writeBinary(): Promise<void> {}
}

function state(coveredJournalSequence: number): WorkerTruthPromotionState {
  return {
    version: WORKER_TRUTH_PROMOTION_STATE_VERSION,
    deviceId: 'device-A',
    identityEpoch: 'epoch-A',
    coverage: {
      version: 1,
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      coveredJournalSequence,
      coveredMutationId: `mutation-${coveredJournalSequence}`,
      truthGenerationId: 'review-events-v1',
      updatedAt: coveredJournalSequence * 1_000,
    },
    retry: null,
    lastSuccessfulPromotionAt: coveredJournalSequence * 1_000,
    updatedAt: coveredJournalSequence * 1_000,
  };
}

describe('MessagePackTruthPromotionStateStore', () => {
  it('keeps one verified state file while coverage advances', async () => {
    const fileStore = new MemoryFileStore();
    const store = new MessagePackTruthPromotionStateStore({
      fileStore,
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
    });

    await store.write(state(1));
    await store.write(state(2));

    expect(Array.from(fileStore.json.keys())).toEqual([
      'truth/promotion/device-device-A/epoch-epoch-A/state.v1.json',
    ]);
    await expect(store.read()).resolves.toMatchObject({
      coverage: {
        coveredJournalSequence: 2,
        coveredMutationId: 'mutation-2',
      },
    });
  });
});
