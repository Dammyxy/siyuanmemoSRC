import { describe, expect, it, vi } from 'vitest';
import { WorkerCardCrudStorageAdapter } from '../WorkerCardCrudStorageAdapter';
import {
  UnifiedStorageManager,
  type UnifiedCardStore,
  type UnifiedStorageCardCrudMutation,
} from '@/core/storage/UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType, type FSRSCard } from '@/types/card';

const now = 1_700_000_000_000;

function createDTO(id: string, xiuyuanID = `xy-${id}`): CardPersistenceDTO {
  return {
    id,
    blockId: `block-${id}`,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    xiuyuanID,
    templateID: 'builtin-quick-card',
    frontBlockIDs: [`block-${id}`],
    backBlockIDs: [],
    xiuyuanPriority: 50,
    meta: { xiuyuanID },
  };
}

function createStore(cardIds: string[]): UnifiedCardStore {
  const cardDTOs = Object.fromEntries(cardIds.map((id) => [id, createDTO(id)]));
  const xiuyuans = Object.fromEntries(cardIds.map((id) => [`xy-${id}`, {
    id: `xy-${id}`,
    blockIDs: [`block-${id}`],
    fields: [{ name: 'content', blockID: `block-${id}` }],
    templateID: 'builtin-quick-card',
    createdAt: now,
    updatedAt: now,
  }]));
  return {
    version: 2,
    xiuyuans,
    cards: {},
    cardDTOs,
    deletedCardDTOs: {},
    deletedXiuyuans: {},
  };
}

async function createAdapter(
  cardIds: string[],
  commitCardCrudBatch: (mutation: UnifiedStorageCardCrudMutation) => Promise<void>,
): Promise<{ adapter: WorkerCardCrudStorageAdapter; projection: UnifiedStorageManager }> {
  const projection = new UnifiedStorageManager();
  projection.setPersistenceCallbacks(
    async () => undefined,
    async () => createStore(cardIds),
    { commitCardCrudBatch },
  );
  expect((await projection.load()).ok).toBe(true);
  return {
    adapter: new WorkerCardCrudStorageAdapter(projection),
    projection,
  };
}

describe('WorkerCardCrudStorageAdapter', () => {
  it('updates multiple FSRS cards through one Worker Card CRUD batch', async () => {
    const commitCardCrudBatch = vi.fn(async (_mutation: UnifiedStorageCardCrudMutation) => undefined);
    const { adapter, projection } = await createAdapter(['card-a', 'card-b'], commitCardCrudBatch);
    const cards = [
      { ...projection.getCard('card-a')!, priority: 61 },
      { ...projection.getCard('card-b')!, priority: 62 },
    ] satisfies FSRSCard[];

    const result = await adapter.batchUpdateCards(cards);

    expect(result.ok).toBe(true);
    expect(commitCardCrudBatch).toHaveBeenCalledTimes(1);
    expect(commitCardCrudBatch).toHaveBeenCalledWith({
      upsertCards: [
        expect.objectContaining({ id: 'card-a', priority: 61 }),
        expect.objectContaining({ id: 'card-b', priority: 62 }),
      ],
      upsertXiuyuans: [],
      deleteCardIds: [],
      deleteXiuyuanIds: [],
    });
    expect(projection.getCard('card-a')?.priority).toBe(61);
    expect(projection.getCard('card-b')?.priority).toBe(62);
  });

  it('deletes multiple cards through one Worker batch and rolls back on unavailable', async () => {
    const commitCardCrudBatch = vi.fn(async (_mutation: UnifiedStorageCardCrudMutation) => {
      throw new Error('BACKEND_UNAVAILABLE: Card CRUD writer offline');
    });
    const { adapter, projection } = await createAdapter(['card-a', 'card-b'], commitCardCrudBatch);

    const result = await adapter.deleteCards(['card-a', 'card-b']);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.message).toContain('BACKEND_UNAVAILABLE');
    expect(commitCardCrudBatch).toHaveBeenCalledTimes(1);
    expect(projection.getCard('card-a')).toBeDefined();
    expect(projection.getCard('card-b')).toBeDefined();
  });
});
