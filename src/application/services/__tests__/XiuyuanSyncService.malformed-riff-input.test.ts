import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { XiuyuanSyncRiffBlock, XiuyuanSyncSiyuanPort } from '@/application/ports/XiuyuanSyncSiyuanPort';
import type { HybridSyncConfig, SyncResult } from '../XiuyuanSyncService.types';
import { XiuyuanSyncService } from '../XiuyuanSyncService';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { RiffBlacklistService } from '../RiffBlacklistService';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';

type ServiceHarness = {
  service: XiuyuanSyncService;
  xiuyuanRepository: IXiuyuanRepository;
  siyuanApi: XiuyuanSyncSiyuanPort;
  riffBlacklistService: RiffBlacklistService;
};

function createConfig(options?: {
  incrementalEnabled?: boolean;
  cleanupBlacklist?: boolean;
}): HybridSyncConfig {
  return {
    deckId: 'deck-1',
    storage: null,
    incrementalSync: {
      enabled: options?.incrementalEnabled ?? false,
      triggers: ['plugin-start'],
      useBlacklist: false,
      autoDetectCardType: false,
    },
    fullSync: {
      enabled: false,
      interval: 0,
      cleanupBlacklist: options?.cleanupBlacklist ?? false,
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

function createBaseRiffCard() {
  return {
    due: '2026-03-01T00:00:00.000Z',
    lastReview: '2026-03-01T00:00:00.000Z',
    reps: 0,
    lapses: 0,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
  };
}

function createRiffBlock(params: {
  id?: string;
  blockID?: string;
  blockId?: string;
  content?: string;
  ial?: Record<string, string>;
}): XiuyuanSyncRiffBlock {
  const block = {
    id: params.id ?? '',
    content: params.content ?? 'question',
    ial: params.ial,
    riffCard: createBaseRiffCard(),
  } as XiuyuanSyncRiffBlock & {
    blockID?: string;
    blockId?: string;
    path?: string;
    riffCardID?: string;
  };

  if (params.blockID !== undefined) {
    block.blockID = params.blockID;
  }
  if (params.blockId !== undefined) {
    block.blockId = params.blockId;
  }

  block.path = '/docs/test.sy';
  block.riffCardID = '20260301000000-xyz1234';

  return block;
}

function createHarness(options?: {
  incrementalEnabled?: boolean;
  cleanupBlacklist?: boolean;
}): ServiceHarness {
  const eventBus = new EventBus();
  const xiuyuanRepository = createXiuyuanRepositoryMock();
  const siyuanApi = createSiyuanApiMock();
  const riffBlacklistService = {
    filterBlacklist: vi.fn(async (cards: XiuyuanSyncRiffBlock[]) => cards),
    cleanupBlacklist: vi.fn(async () => 0),
  } as unknown as RiffBlacklistService;
  const cardTypeDetectionService = {
    detectCardType: vi.fn(async () => 'topic'),
    batchDetectCardTypes: vi.fn(async () => new Map()),
  } as unknown as CardTypeDetectionService;
  const deletionTracker = {
    isRecentlyDeleted: vi.fn(() => false),
  } as unknown as IDeletionTracker;

  const service = new XiuyuanSyncService(
    createConfig(options),
    eventBus,
    xiuyuanRepository,
    riffBlacklistService,
    cardTypeDetectionService,
    deletionTracker,
    siyuanApi
  );

  return {
    service,
    xiuyuanRepository,
    siyuanApi,
    riffBlacklistService,
  };
}

function expectSyncSuccess(result: SyncResult): void {
  expect(result.success).toBe(true);
}

describe('XiuyuanSyncService malformed riff input handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes blockID-only riff records before incremental sync creates Xiuyuans', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();
    const normalizedBlockId = '20260301190000-abc1234';

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: '',
        blockID: normalizedBlockId,
        content: 'normalized by blockID',
      }),
    ]);

    const result = await service.incrementalSync();

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(1);
    expect(vi.mocked(siyuanApi.getBlockAttrs)).toHaveBeenCalledWith(normalizedBlockId);
    expect(vi.mocked(xiuyuanRepository.findById).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(xiuyuanRepository.save)).toHaveBeenCalledTimes(1);

    const savedXiuyuan = vi.mocked(xiuyuanRepository.save).mock.calls[0]?.[0];
    expect(savedXiuyuan?.getBlockIDs()[0]?.getValue()).toBe(normalizedBlockId);
  });

  it('skips unrecoverable riff records during incremental sync without touching storage', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: '',
        content: 'missing every usable block id',
      }),
    ]);

    const result = await service.incrementalSync();

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(siyuanApi.getBlockAttrs)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.findById)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.save)).not.toHaveBeenCalled();
  });

  it('skips blank-content riff records during incremental sync without touching storage', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();
    const validBlockId = '20260301195500-abc1234';

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: validBlockId,
        content: '  \u200B  ',
      }),
    ]);

    const result = await service.incrementalSync();

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(siyuanApi.getBlockAttrs)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.findById)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.save)).not.toHaveBeenCalled();
  });

  it('skips malformed legacy migration cards during startup and still completes start()', async () => {
    const { service, siyuanApi } = createHarness({ incrementalEnabled: true });

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock({
        id: '',
        content: 'legacy attr card',
        ial: { 'custom-card-type': 'topic' },
      }),
    ]);
    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([]);

    await expect(service.start()).resolves.toBeUndefined();

    expect(vi.mocked(siyuanApi.setBlockAttrs)).not.toHaveBeenCalled();
    expect(vi.mocked(siyuanApi.getRiffNewCards)).toHaveBeenCalledTimes(1);
  });

  it('keeps startup alive when incremental sync sees blank-content riff records', async () => {
    const { service, siyuanApi } = createHarness({ incrementalEnabled: true });
    const validBlockId = '20260301200000-abc1234';

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([]);
    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: validBlockId,
        content: ' \u200B ',
      }),
    ]);

    await expect(service.start()).resolves.toBeUndefined();

    expect(vi.mocked(siyuanApi.getRiffNewCards)).toHaveBeenCalledTimes(1);
  });

  it('skips malformed full-sync records but still processes valid cards and avoids destructive cleanup', async () => {
    const { service, xiuyuanRepository, siyuanApi, riffBlacklistService } = createHarness({ cleanupBlacklist: true });
    const validBlockId = '20260302190000-abc1234';

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock({
        id: '',
        content: 'bad full sync card',
      }),
      createRiffBlock({
        id: '',
        blockId: validBlockId,
        content: 'good full sync card',
      }),
    ]);

    const result = await service.fullSync();

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(xiuyuanRepository.save)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(xiuyuanRepository.delete)).not.toHaveBeenCalled();
    expect(vi.mocked((riffBlacklistService as unknown as { cleanupBlacklist: ReturnType<typeof vi.fn> }).cleanupBlacklist)).not.toHaveBeenCalled();
  });

  it('skips blank-content full-sync records but still processes valid cards and avoids destructive cleanup', async () => {
    const { service, xiuyuanRepository, siyuanApi, riffBlacklistService } = createHarness({ cleanupBlacklist: true });
    const validBlockId = '20260302200000-abc1234';

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock({
        id: '20260302200000-abc1235',
        content: ' \u200B ',
      }),
      createRiffBlock({
        id: validBlockId,
        content: 'good full sync card',
      }),
    ]);

    const result = await service.fullSync();

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(xiuyuanRepository.save)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(xiuyuanRepository.delete)).not.toHaveBeenCalled();
    expect(vi.mocked((riffBlacklistService as unknown as { cleanupBlacklist: ReturnType<typeof vi.fn> }).cleanupBlacklist)).not.toHaveBeenCalled();
  });

  it('rejects direct single-face conversion for blank-content riff cards instead of synthesizing placeholder text', async () => {
    const { service } = createHarness();

    await expect(
      (service as any).convertRiffCardToFSRSCard(
        createRiffBlock({
          id: '20260302201500-abc1234',
          content: '\u200B \n\t',
        })
      )
    ).rejects.toThrow('Malformed Riff block 20260302201500-abc1234: Question cannot be empty');
  });
});
