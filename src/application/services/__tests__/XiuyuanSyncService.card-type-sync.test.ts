import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSyncRiffBlock, XiuyuanSyncSiyuanPort } from '@/application/ports/XiuyuanSyncSiyuanPort';
import type { HybridSyncConfig } from '../XiuyuanSyncService.types';
import { XiuyuanSyncService } from '../XiuyuanSyncService';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { RiffBlacklistService } from '../RiffBlacklistService';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';

function createConfig(): HybridSyncConfig {
  return {
    deckId: 'deck-1',
    storage: null,
    incrementalSync: {
      enabled: false,
      triggers: ['plugin-start'],
      useBlacklist: false,
      autoDetectCardType: false,
    },
    fullSync: {
      enabled: false,
      interval: 0,
      cleanupBlacklist: false,
    },
    deleteSync: {
      enabled: false,
      useBlacklistFallback: false,
    },
  };
}

function createXiuyuanRepositoryMock(): IXiuyuanRepository {
  return {
    save: vi.fn(async () => ({ ok: true, value: undefined })),
    findById: vi.fn(async () => ({ ok: true, value: null })),
    findByBlockId: vi.fn(async () => ({ ok: true, value: [] })),
    findAll: vi.fn(async () => ({ ok: true, value: [] })),
    delete: vi.fn(async () => ({ ok: true, value: undefined })),
    saveMany: vi.fn(async () => ({ ok: true, value: undefined })),
    deleteMany: vi.fn(async () => ({ ok: true, value: undefined })),
    applySyncChangeSet: vi.fn(async (changeSet) => ({
      ok: true,
      value: {
        createdCount: changeSet.creates.length,
        updatedCount: changeSet.metadataUpdates.length,
        deletedCount: changeSet.deletes.length,
        blacklistCleanedCount: changeSet.blacklistCleanup.length,
        checkpointApplied: Boolean(changeSet.checkpointAdvance),
      },
    })),
    getXiuyuanIdByCardId: vi.fn(() => undefined),
  };
}

function createSiyuanApiMock(): XiuyuanSyncSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'deck-1',
    ATTR_CARD_TYPE: 'custom-fsrs-card-type',
    getRiffCards: vi.fn(async () => []),
    getRiffNewCards: vi.fn(async () => []),
    removeRiffCards: vi.fn(async () => undefined),
    setBlockAttrs: vi.fn(async () => undefined),
    getBlockAttrs: vi.fn(async () => ({})),
  };
}

function createRiffBlock(blockId: string, ial?: Record<string, string>): XiuyuanSyncRiffBlock {
  return {
    id: blockId,
    content: `content-${blockId}`,
    ial,
    riffCard: {
      due: '2026-03-01T00:00:00.000Z',
      lastReview: '2026-03-01T00:00:00.000Z',
      reps: 0,
      lapses: 0,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
    },
  };
}

describe('XiuyuanSyncService card type sync', () => {
  let eventBus: EventBus;
  let xiuyuanRepository: IXiuyuanRepository;
  let siyuanApi: XiuyuanSyncSiyuanPort;
  let cardTypeDetectionService: CardTypeDetectionService;
  let detectCardTypeMock: ReturnType<typeof vi.fn>;
  let batchDetectCardTypesMock: ReturnType<typeof vi.fn>;
  let service: XiuyuanSyncService;

  beforeEach(() => {
    eventBus = new EventBus();
    xiuyuanRepository = createXiuyuanRepositoryMock();
    siyuanApi = createSiyuanApiMock();
    detectCardTypeMock = vi.fn(async () => 'topic');
    batchDetectCardTypesMock = vi.fn(async () => new Map());
    cardTypeDetectionService = {
      detectCardType: detectCardTypeMock,
      batchDetectCardTypes: batchDetectCardTypesMock,
    } as unknown as CardTypeDetectionService;

    const riffBlacklistService = {
      filterBlacklist: vi.fn(async (cards: XiuyuanSyncRiffBlock[]) => cards),
      getBlacklist: vi.fn(async () => new Set<string>()),
    } as unknown as RiffBlacklistService;

    const deletionTracker = {
      isRecentlyDeleted: vi.fn(() => false),
    } as unknown as IDeletionTracker;

    service = new XiuyuanSyncService(
      createConfig(),
      eventBus,
      xiuyuanRepository,
      riffBlacklistService,
      cardTypeDetectionService,
      deletionTracker,
      siyuanApi
    );
  });

  it('uses custom-fsrs-card-type directly and skips detection', async () => {
    const result = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock('20260301211700-abcde01', {
        'custom-fsrs-card-type': 'item',
        'custom-card-type': 'topic',
      })
    );

    const meta = result.xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(meta.cardType).toBe('item');
    expect(detectCardTypeMock).not.toHaveBeenCalled();
  });

  it('ignores legacy custom-card-type and falls back to detection', async () => {
    detectCardTypeMock.mockResolvedValue('topic');

    const result = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock('20260301211700-abcde02', {
        'custom-card-type': 'item',
      })
    );

    const meta = result.xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(meta.cardType).toBe('topic');
    expect(detectCardTypeMock).toHaveBeenCalledWith('20260301211700-abcde02');
  });

  it('migrates legacy custom-card-type on start and runs only once per instance', async () => {
    (siyuanApi.getRiffCards as ReturnType<typeof vi.fn>).mockResolvedValue([
      createRiffBlock('20260301211700-abcde11', { 'custom-card-type': 'item' }),
      createRiffBlock('20260301211700-abcde12', { 'custom-card-type': 'concept' }),
      createRiffBlock('20260301211700-abcde13', {
        'custom-card-type': 'item',
        'custom-fsrs-card-type': 'topic',
      }),
    ]);

    await service.start();
    await service.start();

    expect(siyuanApi.getRiffCards).toHaveBeenCalledTimes(1);
    expect(siyuanApi.setBlockAttrs).toHaveBeenCalledTimes(2);
    expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith('20260301211700-abcde11', {
      'custom-fsrs-card-type': 'item',
      'custom-card-type': '',
    });
    expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith('20260301211700-abcde12', {
      'custom-fsrs-card-type': 'concept',
      'custom-card-type': '',
    });
  });

  it('does not throw when part of legacy migration fails', async () => {
    (siyuanApi.getRiffCards as ReturnType<typeof vi.fn>).mockResolvedValue([
      createRiffBlock('20260301211700-abcde14', { 'custom-card-type': 'item' }),
      createRiffBlock('20260301211700-abcde15', { 'custom-card-type': 'topic' }),
    ]);
    (siyuanApi.setBlockAttrs as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    await expect(service.start()).resolves.toBeUndefined();
    expect(siyuanApi.setBlockAttrs).toHaveBeenCalledTimes(2);
  });

  it('does not redetect cards that already have current explicit card type attrs', async () => {
    (siyuanApi.getBlockAttrs as ReturnType<typeof vi.fn>).mockImplementation(async (blockId: string) => {
      if (blockId === 'block-explicit') {
        return { 'custom-fsrs-card-type': 'topic' };
      }
      return {};
    });
    batchDetectCardTypesMock.mockResolvedValue(new Map([
      ['block-detect', 'item'],
    ]));

    const updated = await (service as any).detectCardTypesForNewCards([
      createRiffBlock('block-explicit'),
      createRiffBlock('block-detect'),
    ]);

    expect(updated).toBe(1);
    expect(batchDetectCardTypesMock).toHaveBeenCalledWith(['block-detect']);
  });
});
