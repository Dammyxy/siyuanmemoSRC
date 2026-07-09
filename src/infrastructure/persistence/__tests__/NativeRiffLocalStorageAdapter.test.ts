import { describe, expect, it, vi } from 'vitest';
import { NativeRiffAdoptionModule } from '@/application/services/NativeRiffAdoptionModule';
import { buildNativeRiffImportReceipt } from '@/core/card/semantics';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType } from '@/types/card';
import {
  NativeRiffLocalStorageAdapter,
} from '../NativeRiffLocalStorageAdapter';

function createCard(overrides: Partial<CardPersistenceDTO> = {}): CardPersistenceDTO {
  return {
    id: '20260610140511-bb340gl',
    blockId: '20260610140511-bb340gl',
    due: 1_789_488_000_000,
    stability: 4.5,
    difficulty: 6.2,
    reps: 9,
    lapses: 1,
    state: CardState.Review,
    lastReview: 1_789_056_000_000,
    elapsedDays: 5,
    scheduledDays: 10,
    learning_step: 0,
    priority: 37,
    type: CardType.Item,
    tags: ['保留标签'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 100,
    updatedAt: 200,
    schedulerType: 'fsrs-v6',
    xiuyuanID: 'xy_20260610140511-bb340gl',
    templateID: 'builtin-riff-sync',
    meta: {
      xiuyuanID: 'xy_20260610140511-bb340gl',
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
      riffCardId: '20260610192850-rzrmc29',
      nativeRiffCompatibility: {
        owner: 'native-riff',
        source: 'riff-sync',
      },
    },
    ...overrides,
  };
}

function createXiuyuan(overrides: Partial<IXiuyuan> = {}): IXiuyuan {
  return {
    id: 'xy_20260610140511-bb340gl',
    blockIDs: ['20260610140511-bb340gl'],
    fields: [{
      name: 'content',
      blockID: '20260610140511-bb340gl',
    }],
    templateID: 'builtin-riff-sync',
    createdAt: 100,
    updatedAt: 200,
    meta: {
      ownership: 'riff-managed',
      source: 'riff-sync',
      cardType: 'item',
      riffCardId: '20260610192850-rzrmc29',
      riffDeckId: 'deck-1',
      nativeRiffCompatibility: {
        owner: 'native-riff',
        source: 'riff-sync',
      },
    },
    ...overrides,
  };
}

function createRuntime(input: {
  xiuyuans?: IXiuyuan[];
  cards?: CardPersistenceDTO[];
  sourceMarkdown?: string | null;
}) {
  const xiuyuans = new Map((input.xiuyuans ?? []).map(value => [value.id, value]));
  const cards = new Map((input.cards ?? []).map(value => [value.id, value]));
  const storage = {
    createCardDTO: vi.fn(async (xiuyuan: IXiuyuan, dto: CardPersistenceDTO) => {
      xiuyuans.set(xiuyuan.id, xiuyuan);
      cards.set(dto.id, dto);
      return { ok: true, value: undefined };
    }),
    getAllXiuYuans: vi.fn(() => [...xiuyuans.values()]),
    getCardDTO: vi.fn((cardId: string) => cards.get(cardId)),
    getCardDTOsByXiuyuanId: vi.fn((xiuyuanId: string) => (
      [...cards.values()].filter(card => card.xiuyuanID === xiuyuanId)
    )),
    getXiuYuan: vi.fn((xiuyuanId: string) => xiuyuans.get(xiuyuanId)),
    hasNativeRiffDeletionTombstone: vi.fn(() => false),
    saveXiuyuanCardDelta: vi.fn(async () => ({ ok: true, value: { mode: 'delta' } })),
    updateCardDTO: vi.fn(async (dto: CardPersistenceDTO) => {
      cards.set(dto.id, dto);
      return { ok: true, value: undefined };
    }),
    upsertXiuYuan: vi.fn((xiuyuan: IXiuyuan) => {
      xiuyuans.set(xiuyuan.id, xiuyuan);
    }),
  };
  const adapter = new NativeRiffLocalStorageAdapter(
    storage as never,
    {
      findExclusion: vi.fn(async () => null),
      hasExclusion: vi.fn(async () => false),
      saveExclusion: vi.fn(),
      removeExclusion: vi.fn(),
    },
    {
      getBlock: vi.fn(async () => input.sourceMarkdown == null
        ? null
        : {
          id: '20260610140511-bb340gl',
          markdown: input.sourceMarkdown,
        }),
    } as never,
    () => 1_789_056_000_000,
  );
  return { adapter, cards, storage, xiuyuans };
}

describe('NativeRiffLocalStorageAdapter', () => {
  it('creates a local-owned quick-symbol card with immutable receipt and schedule seed', async () => {
    const { adapter, cards } = createRuntime({});
    const receipt = buildNativeRiffImportReceipt({
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      importedAt: 1_789_056_000_000,
    });

    await expect(adapter.createImportedFaces([{
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      sourceMarkdown: '反思>>反思',
      logicalKey: 'block:20260610140511-bb340gl::face:0',
      faceIndex: 0,
      scheduleSeed: {
        due: '2026-09-01T00:00:00.000Z',
        state: CardState.Review,
        stability: 4.5,
        difficulty: 6.2,
        reps: 9,
        lapses: 1,
        lastReview: '2026-08-27T00:00:00.000Z',
      },
      importReceipt: receipt,
    }])).resolves.toEqual({
      createdCardIds: ['20260610140511-bb340gl'],
    });

    const card = cards.get('20260610140511-bb340gl');
    expect(card).toMatchObject({
      reps: 9,
      lapses: 1,
      stability: 4.5,
      difficulty: 6.2,
      templateID: 'builtin-quick-card',
      meta: {
        ownership: 'local-owned',
        source: 'symbol',
        symbolDetected: true,
        symbolType: '>>',
        nativeRiffImportReceipt: receipt,
      },
    });
  });

  it('adopts in place while preserving scheduling, history-facing fields, tags, and priority', async () => {
    const originalCard = createCard();
    const { adapter, cards, xiuyuans } = createRuntime({
      cards: [originalCard],
      xiuyuans: [createXiuyuan()],
      sourceMarkdown: '反思>>反思',
    });
    const module = new NativeRiffAdoptionModule({
      readPort: adapter,
      writePort: adapter,
    });

    const preview = await module.preview();
    expect(preview.counts.adoptable).toBe(1);

    await expect(module.applySelected({
      cardIds: ['20260610140511-bb340gl'],
    })).resolves.toMatchObject({
      adopted: [{ cardId: '20260610140511-bb340gl' }],
      blocked: [],
    });

    expect(cards.get(originalCard.id)).toMatchObject({
      id: originalCard.id,
      xiuyuanID: originalCard.xiuyuanID,
      due: originalCard.due,
      stability: originalCard.stability,
      difficulty: originalCard.difficulty,
      reps: originalCard.reps,
      lapses: originalCard.lapses,
      lastReview: originalCard.lastReview,
      tags: originalCard.tags,
      priority: originalCard.priority,
      templateID: 'builtin-quick-card',
      meta: {
        ownership: 'local-owned',
        source: 'symbol',
        symbolDetected: true,
        symbolType: '>>',
      },
    });
    expect(xiuyuans.get(originalCard.xiuyuanID!)).toMatchObject({
      id: originalCard.xiuyuanID,
      templateID: 'builtin-quick-card',
      meta: {
        ownership: 'local-owned',
      },
    });
  });
});
