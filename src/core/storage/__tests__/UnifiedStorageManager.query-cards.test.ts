import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import { CardState, CardType } from '@/types/card';

function createXiuyuan(id: string = 'xy-query'): IXiuyuan {
  return {
    id,
    blockIDs: ['block-a', 'block-b', 'block-c'],
    templateID: 'builtin-quick-card',
    fields: [{ name: 'content', blockID: 'block-a' }],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

function createDTO(overrides: Partial<CardPersistenceDTO> = {}): CardPersistenceDTO {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-default',
    blockId: overrides.blockId ?? 'block-default',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 1,
    learning_step: overrides.learning_step ?? 0,
    type: overrides.type ?? CardType.Item,
    priority: overrides.priority ?? 50,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    xiuyuanID: overrides.xiuyuanID ?? 'xy-query',
    templateID: overrides.templateID ?? 'builtin-quick-card',
    frontBlockIDs: overrides.frontBlockIDs ?? [overrides.blockId ?? 'block-default'],
    backBlockIDs: overrides.backBlockIDs ?? [],
    xiuyuanPriority: overrides.xiuyuanPriority ?? 50,
  };
}

describe('UnifiedStorageManager queryCards', () => {
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
  });

  async function seedCards(): Promise<void> {
    const xiuyuan = createXiuyuan();
    const cards = [
      createDTO({
        id: 'card-a',
        blockId: 'block-a',
        type: CardType.Item,
        state: CardState.New,
        due: 1_700_000_001_000,
        tags: ['alpha'],
      }),
      createDTO({
        id: 'card-b',
        blockId: 'block-b',
        type: CardType.Topic,
        state: CardState.Review,
        due: 1_700_000_002_000,
        tags: ['beta'],
      }),
      createDTO({
        id: 'card-c',
        blockId: 'block-c',
        type: CardType.Item,
        state: CardState.Review,
        due: 1_700_000_003_000,
        tags: ['gamma'],
      }),
    ];

    for (const dto of cards) {
      const result = await storage.createCardDTO(xiuyuan, dto);
      expect(result.ok).toBe(true);
    }
  }

  it('uses the block index for blockIds queries', async () => {
    await seedCards();
    const getAllCardsSpy = vi.spyOn(storage, 'getAllCards');

    const cards = storage.queryCards({ blockIds: ['block-b'] });

    expect(cards.map(card => card.id)).toEqual(['card-b']);
    expect(getAllCardsSpy).not.toHaveBeenCalled();
  });

  it('uses the type index for cardTypes queries', async () => {
    await seedCards();
    const getAllCardsSpy = vi.spyOn(storage, 'getAllCards');

    const cards = storage.queryCards({ cardTypes: [CardType.Topic] });

    expect(cards.map(card => card.id)).toEqual(['card-b']);
    expect(getAllCardsSpy).not.toHaveBeenCalled();
  });

  it('uses the state index for states queries', async () => {
    await seedCards();
    const getAllCardsSpy = vi.spyOn(storage, 'getAllCards');

    const cards = storage.queryCards({ states: [CardState.Review] });

    expect(cards.map(card => card.id)).toEqual(['card-b', 'card-c']);
    expect(getAllCardsSpy).not.toHaveBeenCalled();
  });

  it('uses the due index for dueDate.lte queries', async () => {
    await seedCards();
    const getAllCardsSpy = vi.spyOn(storage, 'getAllCards');

    const cards = storage.queryCards({ dueDate: { lte: 1_700_000_002_000 } });

    expect(cards.map(card => card.id)).toEqual(['card-a', 'card-b']);
    expect(getAllCardsSpy).not.toHaveBeenCalled();
  });

  it('intersects multiple structured conditions before residual filtering', async () => {
    await seedCards();

    const cards = storage.queryCards({
      cardTypes: [CardType.Item],
      states: [CardState.Review],
      dueDate: { lte: 1_700_000_003_000 },
    });

    expect(cards.map(card => card.id)).toEqual(['card-c']);
  });

  it('falls back to getAllCards when only residual filters exist', async () => {
    await seedCards();
    const getAllCardsSpy = vi.spyOn(storage, 'getAllCards');

    const cards = storage.queryCards({ tags: ['beta'] });

    expect(cards.map(card => card.id)).toEqual(['card-b']);
    expect(getAllCardsSpy).toHaveBeenCalledOnce();
  });

  it('filters suspended cards from unified storage metadata without block attrs', async () => {
    await seedCards();
    await storage.updateCard({
      ...storage.getCard('card-c')!,
      meta: { suspended: true },
    });

    const cards = storage.queryCards({ suspended: true });

    expect(cards.map(card => card.id)).toEqual(['card-c']);
  });

  it('excludes suspended cards when includeSuspended is false', async () => {
    await seedCards();
    await storage.updateCard({
      ...storage.getCard('card-b')!,
      meta: { suspended: true },
    });

    const cards = storage.queryCards({ includeSuspended: false });

    expect(cards.map(card => card.id)).toEqual(['card-a', 'card-c']);
  });
});
