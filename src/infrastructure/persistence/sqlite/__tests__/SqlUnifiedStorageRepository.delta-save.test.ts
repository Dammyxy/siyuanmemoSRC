import { describe, expect, it } from 'vitest';
import type { UnifiedCardStore, UnifiedStorageXiuyuanCardDelta } from '@/core/storage/UnifiedStorageManager';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { FSRSCard } from '@/types/card';
import { CardState, CardType } from '@/types/card';

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }
}

function createXiuyuan(id: string, blockId: string, updatedAt = 1_700_000_000_000): IXiuyuan {
  return {
    id,
    blockIDs: [blockId],
    templateID: 'builtin-quick-card',
    fields: [{ name: 'content', blockID: blockId }],
    createdAt: 1_700_000_000_000,
    updatedAt,
  };
}

function createDTO(overrides: Partial<CardPersistenceDTO>): CardPersistenceDTO {
  const now = 1_700_000_000_000;
  const blockId = overrides.blockId ?? `block-${overrides.id ?? 'card'}`;
  return {
    id: overrides.id ?? 'card-default',
    blockId,
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    learning_step: overrides.learning_step ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    xiuyuanID: overrides.xiuyuanID ?? 'xy-default',
    templateID: overrides.templateID ?? 'builtin-quick-card',
    frontBlockIDs: overrides.frontBlockIDs ?? [blockId],
    backBlockIDs: overrides.backBlockIDs ?? [],
    xiuyuanPriority: overrides.xiuyuanPriority ?? 50,
    meta: overrides.meta,
  };
}

function createCard(dto: CardPersistenceDTO): FSRSCard {
  return {
    ...dto,
    xiuyuanID: dto.xiuyuanID || '',
    meta: {
      ...(dto.meta || {}),
      xiuyuanID: dto.xiuyuanID,
    },
  } as FSRSCard;
}

function createStore(dtos: CardPersistenceDTO[], tombstones: UnifiedCardStore['deletedCardDTOs'] = {}): UnifiedCardStore {
  return {
    version: 2,
    xiuyuans: Object.fromEntries(dtos.map((dto) => [
      dto.xiuyuanID || `xy-${dto.id}`,
      createXiuyuan(dto.xiuyuanID || `xy-${dto.id}`, dto.blockId),
    ])),
    cards: Object.fromEntries(dtos.map((dto) => [dto.id, createCard(dto)])),
    cardDTOs: Object.fromEntries(dtos.map((dto) => [dto.id, dto])),
    deletedCardDTOs: tombstones,
    deletedXiuyuans: {},
    riffBlacklist: ['block-blacklisted'],
    riffSyncState: {
      lastSuccessfulIncrementalAt: 1_700_000_001_000,
      lastSuccessfulIncrementalCursor: 'cursor:1',
    },
  };
}

describe('SqlUnifiedStorageRepository Xiuyuan/card delta persistence', () => {
  it('upserts supplied Xiuyuan/card rows without deleting unrelated rows or tombstones', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const existingDto = createDTO({
      id: 'card-existing',
      blockId: 'block-existing',
      xiuyuanID: 'xy-existing',
      meta: { content: 'Existing content', rootId: 'doc-existing' },
    });
    await repository.saveStore(createStore([existingDto], {
      'card-deleted': {
        deletedAt: 1_700_000_002_000,
        deletedBy: 'test',
        blockId: 'block-deleted',
      },
    }));

    const newDto = createDTO({
      id: 'card-new',
      blockId: 'block-new',
      xiuyuanID: 'xy-new',
      priority: 88,
      meta: { content: 'Question>>Answer', source: 'symbol' },
    });
    const delta: UnifiedStorageXiuyuanCardDelta = {
      version: 2,
      xiuyuans: {
        'xy-new': createXiuyuan('xy-new', 'block-new', 1_700_000_003_000),
      },
      cards: {
        [newDto.id]: createCard(newDto),
      },
      cardDTOs: {
        [newDto.id]: newDto,
      },
    };

    await repository.saveXiuyuanCardDelta(delta);

    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.['card-existing']).toMatchObject({
      id: 'card-existing',
      blockId: 'block-existing',
      xiuyuanID: 'xy-existing',
    });
    expect(loaded.xiuyuans['xy-existing']).toMatchObject({ id: 'xy-existing' });
    expect(loaded.deletedCardDTOs?.['card-deleted']).toMatchObject({
      deletedBy: 'test',
    });
    expect(loaded.riffBlacklist).toEqual(['block-blacklisted']);
    expect(loaded.riffSyncState?.lastSuccessfulIncrementalCursor).toBe('cursor:1');
    expect(loaded.cardDTOs?.['card-new']).toMatchObject({
      id: 'card-new',
      xiuyuanID: 'xy-new',
      priority: 88,
    });
    expect(loaded.xiuyuans['xy-new']).toMatchObject({
      id: 'xy-new',
      blockIDs: ['block-new'],
    });
  });

  it('preserves source-existence projection values when rewriting the same block card row', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const existingDto = createDTO({
      id: 'card-existing',
      blockId: 'block-existing',
      xiuyuanID: 'xy-existing',
      priority: 10,
    });
    await repository.saveStore(createStore([existingDto]));
    await repository.updateSourceExistence([
      { cardId: 'card-existing', blockId: 'block-existing', exists: true },
    ], 1_700_000_010_000);

    const updatedDto = {
      ...existingDto,
      priority: 99,
      updatedAt: 1_700_000_011_000,
    };
    await repository.saveXiuyuanCardDelta({
      version: 2,
      xiuyuans: {
        'xy-existing': createXiuyuan('xy-existing', 'block-existing', 1_700_000_011_000),
      },
      cards: {
        'card-existing': createCard(updatedDto),
      },
      cardDTOs: {
        'card-existing': updatedDto,
      },
    });

    expect(repository.getCard('card-existing')).toMatchObject({
      id: 'card-existing',
      priority: 99,
    });
    expect(repository.getSourceExistenceByBlockIds(['block-existing']).get('block-existing')).toBe(true);
  });
});
