import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSyncRiffBlock, XiuyuanSyncSiyuanPort } from '@/application/ports/XiuyuanSyncSiyuanPort';
import type { HybridSyncConfig } from '../XiuyuanSyncService.types';
import { XiuyuanSyncService } from '../XiuyuanSyncService';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { RiffBlacklistService } from '../RiffBlacklistService';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { CardState } from '@/types/card';

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
    setBlockAttrs: vi.fn(async () => undefined),
    getBlockAttrs: vi.fn(async () => ({})),
  };
}

function createRiffBlock(params: {
  id: string;
  content: string;
  ial?: Record<string, string>;
}): XiuyuanSyncRiffBlock {
  return {
    id: params.id,
    content: params.content,
    ial: params.ial,
    riffCard: {
      due: '2036-03-01T00:00:00.000Z',
      lastReview: '2036-03-01T00:00:00.000Z',
      reps: 99,
      lapses: 9,
      state: CardState.Review,
      stability: 8,
      difficulty: 5,
      elapsedDays: 12,
      scheduledDays: 30,
    },
  };
}

describe('XiuyuanSyncService formula multi-cloze conversion', () => {
  let service: XiuyuanSyncService;

  beforeEach(() => {
    const eventBus = new EventBus();
    const xiuyuanRepository = createXiuyuanRepositoryMock();
    const siyuanApi = createSiyuanApiMock();

    const cardTypeDetectionService = {
      detectCardType: vi.fn(async () => 'topic'),
      batchDetectCardTypes: vi.fn(async () => new Map()),
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

  it('creates one multi-cloze card when formula has one numbered cloze', async () => {
    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-abcde13',
        content: '$$E=\\\\cloze{c1}{mc^2}$$',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    expect(xiuyuanEntity.getTemplateID().getValue()).toBe('builtin-multi-cloze');
    expect(xiuyuanEntity.getFaces()).toHaveLength(1);
    expect(xiuyuanEntity.getCards()).toHaveLength(1);
  });

  it('keeps ordinary mark cloze cards on default native render metadata', async () => {
    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-abcde15',
        content: 'alpha ==beta== gamma ==delta==',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    const meta = xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(xiuyuanEntity.getTemplateID().getValue()).toBe('builtin-multi-cloze');
    expect(xiuyuanEntity.getFaces()).toHaveLength(1);
    expect(meta.clozeRenderMode).toBeUndefined();
    expect(meta.renderProfile).toBeUndefined();
    expect(meta.forceQuickRender).toBeUndefined();
  });

  it('creates N cards for N numbered latex clozes with inline render meta and new-card schedule', async () => {
    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-abcde14',
        content: '$$P(A|B)=\\\\cloze{c1}{\\frac{P(B|A)P(A)}{P(B)}} + \\\\cloze{c2}{x} + \\\\cloze{c3}{y}$$',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    const meta = xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(xiuyuanEntity.getTemplateID().getValue()).toBe('builtin-multi-cloze');
    expect(xiuyuanEntity.getFaces()).toHaveLength(3);
    expect(xiuyuanEntity.getCards()).toHaveLength(3);
    expect(meta.source).toBe('riff-sync');
    expect(meta.cardType).toBe('item');
    expect(meta.clozeRenderMode).toBe('inline-formula-cloze');

    const schedules = xiuyuanEntity.getCards().map((card) => card.getScheduleInfo());
    expect(schedules.every((schedule) => schedule.state === CardState.New)).toBe(true);
    expect(schedules.every((schedule) => schedule.reps === 0)).toBe(true);
  });
});
