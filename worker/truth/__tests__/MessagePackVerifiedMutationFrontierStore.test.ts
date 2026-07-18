import { describe, expect, it, vi } from 'vitest';
import { MessagePackVerifiedMutationFrontierStore } from '../MessagePackVerifiedMutationFrontierStore';
import { WorkerVerifiedMutationFrontier } from '../WorkerVerifiedMutationFrontier';

describe('MessagePackVerifiedMutationFrontierStore', () => {
  it('preserves an unsupported frontier version without overwriting it', async () => {
    const frontierPath = 'truth/promotion/device-device-A/frontier.v1.json';
    const unsupported = {
      version: 2,
      deviceId: 'device-A',
      activeIdentityEpoch: 'epoch-A',
    };
    const writeJSON = vi.fn();
    const store = new MessagePackVerifiedMutationFrontierStore({
      deviceId: 'device-A',
      fileStore: {
        readJSON: async <T>(path: string) => (
          path === frontierPath ? structuredClone(unsupported) as T : null
        ),
        writeJSON,
        listFiles: async () => [frontierPath],
      },
    });
    const frontier = new WorkerVerifiedMutationFrontier({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      store,
      readJournalEvidence: async () => ({ nextJournalSequence: 1, entries: [] }),
      listLegacyPromotionStates: () => store.listLegacyPromotionStates(),
    });

    await expect(frontier.initialize()).resolves.toMatchObject({
      ready: false,
      diagnostics: {
        blockingCode: 'FRONTIER_STATE_UNSUPPORTED',
      },
    });
    expect(writeJSON).not.toHaveBeenCalled();
  });
});
