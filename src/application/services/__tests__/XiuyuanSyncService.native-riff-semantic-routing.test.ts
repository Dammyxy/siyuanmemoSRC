import { describe, expect, it, vi } from 'vitest';
import { XiuyuanSyncService } from '../XiuyuanSyncService';

function createHarness() {
  const config = {
    deckId: '20200812220555-lj3enxa',
    storage: {},
    incrementalSync: {
      enabled: false,
      triggers: [],
      useBlacklist: true,
      autoDetectCardType: true,
    },
    fullSync: {
      enabled: false,
      interval: 0,
      cleanupBlacklist: true,
    },
    deleteSync: {
      enabled: false,
      useBlacklistFallback: true,
    },
    retry: {
      maxRetries: 0,
      retryDelay: 0,
      backoffMultiplier: 1,
    },
  } as const;

  const eventBus = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const repository = {
    findById: vi.fn(),
  };

  const blacklistService = {
    addToBlacklist: vi.fn().mockResolvedValue(undefined),
    removeFromBlacklist: vi.fn().mockResolvedValue(undefined),
    filterBlacklist: vi.fn().mockImplementation(async (items: unknown[]) => items),
    cleanupBlacklist: vi.fn().mockResolvedValue(0),
    getBlacklist: vi.fn().mockResolvedValue(new Set()),
  };
  const detectionService = {
    detectCardType: vi.fn().mockResolvedValue('topic'),
  };
  const deletionTracker = {};
  const siyuanApi = {
    BUILTIN_DECK_ID: '20200812220555-lj3enxa',
    ATTR_CARD_TYPE: 'custom-fsrs-card-type',
    getRiffCards: vi.fn(),
    getRiffNewCards: vi.fn(),
    removeRiffCards: vi.fn(),
    setBlockAttrs: vi.fn(),
    getBlockAttrs: vi.fn(),
  };

  const service = new XiuyuanSyncService(
    config as never,
    eventBus as never,
    repository as never,
    blacklistService as never,
    detectionService as never,
    deletionTracker as never,
    siyuanApi as never
  );

  return {
    service,
    config,
    eventBus,
    repository,
    blacklistService,
    detectionService,
    deletionTracker,
    siyuanApi,
  };
}

function createService(): XiuyuanSyncService {
  return createHarness().service;
}

const confirmedNativeHardDelete = {
  deleteIntent: 'native-hard-delete',
  confirmDangerousNativeDelete: true,
  requestedBy: 'test',
} as const;

describe('XiuyuanSyncService native riff semantic routing', () => {
  it('routes concept-definition symbols to concept-definition template', () => {
    const service = createService();
    const plan = (service as any).planPostCreation(
      {
        id: '20260101010101-abcdefg',
        content: '((20260101010101-abc1234)) :: 定义',
      },
      'topic'
    );

    expect(plan.templateId).toBe('builtin-concept-definition');
    expect(plan.cardType).toBe('descriptor');
  });

  it('routes descriptor symbols to descriptor template', () => {
    const service = createService();
    const plan = (service as any).planPostCreation(
      {
        id: '20260101010101-abcdefg',
        content: '属性 ;; 描述',
      },
      'topic'
    );

    expect(plan.templateId).toBe('builtin-concept-descriptor');
    expect(plan.cardType).toBe('descriptor');
  });

  it('rejects delete sync without explicit native hard-delete authorization', async () => {
    const { service, siyuanApi } = createHarness();
    (service as any).config.deleteSync.enabled = true;

    await expect(service.deleteSync('20260101010101-abc1234')).resolves.toBe(false);
    await expect(service.deleteSync('20260101010101-abc1234', {
      deleteIntent: 'native-hard-delete',
    })).resolves.toBe(false);

    expect(siyuanApi.removeRiffCards).not.toHaveBeenCalled();
  });

  it('routes confirmed native hard-delete sync by blockId to removeRiffCards', async () => {
    const { service, siyuanApi } = createHarness();
    (service as any).config.deleteSync.enabled = true;

    const result = await service.deleteSync(
      '20260101010101-abc1234',
      confirmedNativeHardDelete,
    );

    expect(result).toBe(true);
    expect(siyuanApi.removeRiffCards).toHaveBeenCalledWith(
      '20200812220555-lj3enxa',
      ['20260101010101-abc1234']
    );
  });

  it('persists blacklist fallback when delete sync fails', async () => {
    const { service, siyuanApi, blacklistService } = createHarness();
    (service as any).config.deleteSync.enabled = true;
    siyuanApi.removeRiffCards.mockRejectedValue(new Error('network down'));

    const result = await service.deleteSync(
      '20260101010101-def5678',
      confirmedNativeHardDelete,
    );

    expect(result).toBe(false);
    expect(blacklistService.addToBlacklist).toHaveBeenCalledWith('20260101010101-def5678');
  });

  it('batch delete sync counts confirmed native hard-delete block removals', async () => {
    const { service, siyuanApi } = createHarness();
    (service as any).config.deleteSync.enabled = true;
    siyuanApi.removeRiffCards
      .mockResolvedValueOnce({ name: 'deck', size: 1 })
      .mockResolvedValueOnce({ name: 'deck', size: 1 });

    const successCount = await service.deleteSyncBatch(
      [
        '20260101010101-ghi9012',
        '20260101010101-jkl3456',
      ],
      confirmedNativeHardDelete,
    );

    expect(successCount).toBe(2);
    expect(siyuanApi.removeRiffCards).toHaveBeenNthCalledWith(
      1,
      '20200812220555-lj3enxa',
      ['20260101010101-ghi9012']
    );
    expect(siyuanApi.removeRiffCards).toHaveBeenNthCalledWith(
      2,
      '20200812220555-lj3enxa',
      ['20260101010101-jkl3456']
    );
  });
});
