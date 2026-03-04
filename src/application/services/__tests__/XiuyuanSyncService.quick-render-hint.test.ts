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

describe('XiuyuanSyncService quick render hint', () => {
  let eventBus: EventBus;
  let xiuyuanRepository: IXiuyuanRepository;
  let siyuanApi: XiuyuanSyncSiyuanPort;
  let service: XiuyuanSyncService;

  beforeEach(() => {
    eventBus = new EventBus();
    xiuyuanRepository = createXiuyuanRepositoryMock();
    siyuanApi = createSiyuanApiMock();

    const detectCardTypeMock = vi.fn(async () => 'topic');
    const batchDetectCardTypesMock = vi.fn(async () => new Map());
    const cardTypeDetectionService = {
      detectCardType: detectCardTypeMock,
      batchDetectCardTypes: batchDetectCardTypesMock,
    } as unknown as CardTypeDetectionService;

    const riffBlacklistService = {
      filterBlacklist: vi.fn(async (cards: XiuyuanSyncRiffBlock[]) => cards),
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

  it('writes forceQuickRender hint for numbered latex cloze item cards during conversion', async () => {
    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-cloze01',
        content: '$$ E = \\\\cloze{c1}{mc^2} $$',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    const meta = xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(meta.forceQuickRender).toBe(true);
    expect(meta.quickDetectReason).toBe('cloze-latex-numbered');
  });

  it('does not write quick render hint for non-numbered latex cloze', async () => {
    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-cloze02',
        content: '$$ E = \\\\cloze{x} $$',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    const meta = xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(meta.forceQuickRender).toBeUndefined();
    expect(meta.quickDetectReason).toBeUndefined();
  });

  it('adds quick render hint when existing Xiuyuan is updated to numbered latex cloze item', async () => {
    const { xiuyuanEntity: existingXiuyuan } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-abcde11',
        content: 'plain content',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    vi.mocked(xiuyuanRepository.findById).mockResolvedValue({
      ok: true,
      value: existingXiuyuan,
    });
    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: '20260301190000-abcde11',
        content: '$$ \\\\cloze{c1}{answer} $$',
        ial: { 'custom-fsrs-card-type': 'item' },
      }),
    ]);

    await service.incrementalSync();

    const meta = existingXiuyuan.getMeta() as Record<string, unknown>;
    expect(meta.forceQuickRender).toBe(true);
    expect(meta.quickDetectReason).toBe('cloze-latex-numbered');
    expect(xiuyuanRepository.save).toHaveBeenCalledTimes(1);
  });

  it('clears quick render hint when existing Xiuyuan no longer matches item + numbered latex cloze', async () => {
    const { xiuyuanEntity: existingXiuyuan } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-abcde12',
        content: '$$ \\\\cloze{c1}{answer} $$',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    expect((existingXiuyuan.getMeta() as Record<string, unknown>).forceQuickRender).toBe(true);

    vi.mocked(xiuyuanRepository.findById).mockResolvedValue({
      ok: true,
      value: existingXiuyuan,
    });
    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: '20260301190000-abcde12',
        content: '$$ \\\\cloze{c1}{answer} $$',
        ial: { 'custom-fsrs-card-type': 'topic' },
      }),
    ]);

    await service.incrementalSync();

    const meta = existingXiuyuan.getMeta() as Record<string, unknown>;
    expect(meta.forceQuickRender).toBeUndefined();
    expect(meta.quickDetectReason).toBeUndefined();
    expect(xiuyuanRepository.save).toHaveBeenCalledTimes(1);
  });

  it('keeps native superblock riff cards on standard renderer metadata', async () => {
    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(
      createRiffBlock({
        id: '20260301190000-super01',
        content: '{{{row 超级块测试1\n3333}}}',
        ial: { 'custom-fsrs-card-type': 'item' },
      })
    );

    const meta = xiuyuanEntity.getMeta() as Record<string, unknown>;
    expect(xiuyuanEntity.getTemplateID().getValue()).toBe('builtin-riff-sync');
    expect(meta.renderProfile).toBeUndefined();
    expect(meta.clozeRenderMode).toBeUndefined();
    expect(meta.forceQuickRender).toBeUndefined();
  });
});
