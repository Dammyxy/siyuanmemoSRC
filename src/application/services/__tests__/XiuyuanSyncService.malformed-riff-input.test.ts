import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { XiuyuanSyncRiffBlock, XiuyuanSyncSiyuanPort } from '@/application/ports/XiuyuanSyncSiyuanPort';
import type { HybridSyncConfig, SyncResult } from '../XiuyuanSyncService.types';
import { XiuyuanSyncService } from '../XiuyuanSyncService';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { RiffBlacklistService } from '../RiffBlacklistService';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';

type ServiceHarness = {
  service: XiuyuanSyncService;
  xiuyuanRepository: IXiuyuanRepository;
  siyuanApi: XiuyuanSyncSiyuanPort;
  riffBlacklistService: RiffBlacklistService;
};

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createConfig(options?: {
  incrementalEnabled?: boolean;
  cleanupBlacklist?: boolean;
  storage?: unknown;
}): HybridSyncConfig {
  return {
    deckId: 'deck-1',
    storage: options?.storage ?? null,
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

function createLocalOwnedXiuyuan(blockId: string): Xiuyuan {
  return must(Xiuyuan.create({
    blockIDs: [must(BlockId.create(blockId))],
    templateID: must(TemplateId.create('basic')),
    faces: [
      must(CardFace.create({
        question: `local-${blockId}`,
        answer: 'local answer',
        questionBlockId: blockId,
        answerBlockId: blockId,
      })),
    ],
    meta: {
      ownership: 'local-owned',
    },
  }));
}

function createHarness(options?: {
  incrementalEnabled?: boolean;
  cleanupBlacklist?: boolean;
  storage?: unknown;
}): ServiceHarness {
  const eventBus = new EventBus();
  const xiuyuanRepository = createXiuyuanRepositoryMock();
  const siyuanApi = createSiyuanApiMock();
  const riffBlacklistService = {
    filterBlacklist: vi.fn(async (cards: XiuyuanSyncRiffBlock[]) => cards),
    getBlacklist: vi.fn(async () => new Set<string>()),
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

  afterEach(() => {
    vi.useRealTimers();
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
    expect(vi.mocked(xiuyuanRepository.save)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);

    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(1);
    const savedXiuyuan = changeSet?.creates[0]?.xiuyuanEntity;
    expect(savedXiuyuan?.getBlockIDs()[0]?.getValue()).toBe(normalizedBlockId);
  });

  it('skips unrecoverable riff records during incremental sync without creating Xiuyuans', async () => {
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
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0].creates).toHaveLength(0);
  });

  it('skips blank-content riff records during incremental sync without creating Xiuyuans', async () => {
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
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0].creates).toHaveLength(0);
  });

  it('skips incoming riff cards when the same block already has a local-owned Xiuyuan', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();
    const blockId = '20260301200500-abc1234';
    const localXiuyuan = createLocalOwnedXiuyuan(blockId);

    vi.mocked(xiuyuanRepository.findByBlockId).mockResolvedValue({
      ok: true,
      value: [localXiuyuan],
    });
    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: blockId,
        content: 'riff content should not create duplicate local card',
      }),
    ]);

    const result = await service.incrementalSync();

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(xiuyuanRepository.save)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(0);
    expect(changeSet?.metadataUpdates).toHaveLength(0);
    expect(changeSet?.checkpointAdvance?.lastSuccessfulIncrementalAt).toBeTypeOf('number');
  });

  it('skips persistence for native-riff idle incremental syncs but remembers the checkpoint in memory', async () => {
    vi.useFakeTimers();
    const firstSyncStartedAt = new Date('2026-03-02T10:00:00.000Z').getTime();
    vi.setSystemTime(firstSyncStartedAt);

    const storage = {
      getRiffSyncState: vi.fn(() => ({})),
      updateRiffSyncState: vi.fn(async () => ({ ok: true as const })),
    };
    const { service, xiuyuanRepository, siyuanApi } = createHarness({ storage });

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([]);

    const firstResult = await service.incrementalSync(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });

    expectSyncSuccess(firstResult);
    expect(firstResult.addedCount).toBe(0);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).not.toHaveBeenCalled();
    expect(vi.mocked(siyuanApi.getRiffNewCards).mock.calls[0]?.[1]).toBeUndefined();

    vi.setSystemTime(new Date('2026-03-02T10:00:10.000Z'));
    await service.incrementalSync(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });

    expect(vi.mocked(siyuanApi.getRiffNewCards).mock.calls[1]?.[1]).toBe(firstSyncStartedAt - 5_000);
    expect(storage.updateRiffSyncState).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('still persists idle incremental checkpoints for default incremental sync calls', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([]);

    const result = await service.incrementalSync();

    expectSyncSuccess(result);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(0);
    expect(changeSet?.checkpointAdvance?.lastSuccessfulIncrementalAt).toBeTypeOf('number');
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
    expect(vi.mocked(xiuyuanRepository.save)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(1);
    expect(changeSet?.deletes).toHaveLength(0);
    expect(changeSet?.blacklistCleanup).toHaveLength(0);
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
    expect(vi.mocked(xiuyuanRepository.save)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(1);
    expect(changeSet?.deletes).toHaveLength(0);
    expect(changeSet?.blacklistCleanup).toHaveLength(0);
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
