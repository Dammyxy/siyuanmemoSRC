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
import { CardState } from '@/types/card';

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
    getRiffCardsByBlockIDs: vi.fn(async () => []),
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
  const xiuyuan = must(Xiuyuan.create({
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
  must(xiuyuan.createCard(0));
  return xiuyuan;
}

function createManagedXiuyuan(blockId: string): Xiuyuan {
  const xiuyuan = must(Xiuyuan.create({
    blockIDs: [must(BlockId.create(blockId))],
    templateID: must(TemplateId.create('builtin-riff-sync')),
    faces: [
      must(CardFace.create({
        question: `managed-${blockId}`,
        answer: '',
        questionBlockId: blockId,
        answerBlockId: blockId,
      })),
    ],
    meta: {
      ownership: 'riff-managed',
      source: 'riff-sync',
      schedulerType: 'fsrs-v6',
    },
  }));
  must(xiuyuan.createCard(0));
  return xiuyuan;
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

  it('fails closed when legacy Xiuyuan binding attrs cannot be loaded', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();
    const normalizedBlockId = '20260301190000-attrsx1';

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: normalizedBlockId,
        content: 'attrs read fails',
      }),
    ]);
    vi.mocked(siyuanApi.getBlockAttrs).mockRejectedValueOnce(new Error('attrs API down'));

    await expect(service.incrementalSync())
      .rejects.toThrow(`XIUYUAN_BINDING_ATTRS_UNAVAILABLE: failed to load legacy Xiuyuan binding attrs for block ${normalizedBlockId}: attrs API down`);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).not.toHaveBeenCalled();
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

  it('persists native-riff checkpoints when the run only skips local-owned cards', async () => {
    vi.useFakeTimers();
    const syncStartedAt = new Date('2026-03-02T11:00:00.000Z').getTime();
    vi.setSystemTime(syncStartedAt);

    const storage = {
      getRiffSyncState: vi.fn(() => ({})),
      updateRiffSyncState: vi.fn(async () => ({ ok: true as const })),
    };
    const { service, xiuyuanRepository, siyuanApi } = createHarness({ storage });
    const blockId = '20260302110000-abc1234';
    const localXiuyuan = createLocalOwnedXiuyuan(blockId);

    vi.mocked(xiuyuanRepository.findByBlockId).mockResolvedValue({
      ok: true,
      value: [localXiuyuan],
    });
    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock({
        id: blockId,
        content: 'local-owned should advance native checkpoint',
      }),
    ]);

    const result = await service.incrementalSync(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });

    expectSyncSuccess(result);
    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0].checkpointAdvance).toMatchObject({
      lastSuccessfulIncrementalAt: syncStartedAt,
      lastSuccessfulIncrementalCursor: `timestamp:${syncStartedAt}`,
    });
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

  it('uses direct Riff block reads for scoped local incremental sync calls', async () => {
    const { service, xiuyuanRepository, siyuanApi } = createHarness();
    const blockId = '20260302183000-abc1234';
    const getRiffCardsByBlockIDs = vi.mocked(siyuanApi.getRiffCardsByBlockIDs!);

    getRiffCardsByBlockIDs.mockResolvedValue([
      createRiffBlock({
        id: blockId,
        content: 'scoped native riff card',
      }),
    ]);

    const result = await service.incrementalSync(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
      blockIds: [' ', blockId, blockId],
    });

    expectSyncSuccess(result);
    expect(getRiffCardsByBlockIDs).toHaveBeenCalledWith([blockId]);
    expect(vi.mocked(siyuanApi.getRiffNewCards)).not.toHaveBeenCalled();
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(1);
    expect(changeSet?.creates[0]?.blockId).toBe(blockId);
  });

  it('routes native riff remove to managed-only local deletions', async () => {
    const { service, xiuyuanRepository } = createHarness();
    const blockId = '20260302190500-abc1234';
    const localXiuyuan = createLocalOwnedXiuyuan(blockId);
    const managedXiuyuan = createManagedXiuyuan(blockId);

    vi.mocked(xiuyuanRepository.findByBlockId).mockResolvedValue({
      ok: true,
      value: [localXiuyuan, managedXiuyuan],
    });

    const result = await service.handleNativeRiffRemove([blockId]);

    expectSyncSuccess(result);
    expect(result.deletedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(xiuyuanRepository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(0);
    expect(changeSet?.metadataUpdates).toHaveLength(0);
    expect(changeSet?.deletes).toHaveLength(1);
    expect(changeSet?.deletes[0]?.blockId).toBe(blockId);
    expect(changeSet?.deletes[0]?.xiuyuanEntity).toBe(managedXiuyuan);
  });

  it('treats native riff remove as a no-op when only local-owned cards remain', async () => {
    const { service, xiuyuanRepository } = createHarness();
    const blockId = '20260302191000-abc1234';
    const localXiuyuan = createLocalOwnedXiuyuan(blockId);

    vi.mocked(xiuyuanRepository.findByBlockId).mockResolvedValue({
      ok: true,
      value: [localXiuyuan],
    });

    const result = await service.handleNativeRiffRemove([blockId]);

    expectSyncSuccess(result);
    expect(result.deletedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(vi.mocked(xiuyuanRepository.applySyncChangeSet)).not.toHaveBeenCalled();
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

  it('repairs imported Review riff cards with zero stability from their existing interval', async () => {
    const { service } = createHarness();
    const riffBlock = createRiffBlock({
      id: '20260426233833-abc1234',
      content: 'review card with malformed riff schedule',
      ial: {
        'custom-fsrs-card-type': 'item',
      },
    });
    riffBlock.riffCard = {
      ...createBaseRiffCard(),
      due: '2026-04-26T15:38:33.000Z',
      lastReview: '2026-02-15T15:38:33.000Z',
      reps: 4,
      state: CardState.Review,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
    };

    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(riffBlock);
    const schedule = xiuyuanEntity.getCards()[0]?.getScheduleInfo();

    expect(schedule?.stability).toBe(70);
    expect(schedule?.scheduledDays).toBe(70);
    expect(schedule?.difficulty).toBe(5);
  });

  it('promotes imported mature Learning riff cards into Review state', async () => {
    const { service } = createHarness();
    const riffBlock = createRiffBlock({
      id: '20260424190358-nv5h2no',
      content: '可训练性→可通过刻意练习提升',
      ial: {
        'custom-fsrs-card-type': 'descriptor',
      },
    });
    riffBlock.riffCard = {
      ...createBaseRiffCard(),
      due: '2026-04-28T15:21:27.202Z',
      lastReview: '2026-04-28T15:11:27.202Z',
      reps: 1,
      state: CardState.Learning,
      stability: 23.20535865,
      difficulty: 2.09745544,
      elapsedDays: 24,
      scheduledDays: 26,
    };

    const { xiuyuanEntity } = await (service as any).convertRiffCardToFSRSCard(riffBlock);
    const schedule = xiuyuanEntity.getCards()[0]?.getScheduleInfo();

    expect(schedule?.state).toBe(CardState.Review);
    expect(schedule?.scheduledDays).toBe(26);
    expect(schedule?.stability).toBe(23.20535865);
    expect(schedule?.difficulty).toBe(2.09745544);
  });
});
