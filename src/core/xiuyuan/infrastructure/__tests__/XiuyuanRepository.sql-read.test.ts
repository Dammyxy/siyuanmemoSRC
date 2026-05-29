import { describe, expect, it, vi } from 'vitest';
import { XiuyuanRepository, type XiuyuanSqlReadPort } from '../XiuyuanRepository';
import { XiuyuanId } from '../../domain/XiuyuanId';
import { BlockId } from '../../domain/BlockId';
import type { IXiuyuan } from '../../types';
import { CardState, CardType } from '@/types/card';

function createXiuyuan(overrides: Partial<IXiuyuan> = {}): IXiuyuan {
  const now = Date.now();
  return {
    id: 'xy_sql_first',
    blockIDs: ['20210808180117-6v0mkxr'],
    fields: [{ name: 'question', blockID: '20210808180117-6v0mkxr' }],
    templateID: 'basic',
    createdAt: now,
    updatedAt: now,
    meta: {
      faces: [{ question: 'Q', answer: 'A' }],
      cardIds: [],
    },
    ...overrides,
  };
}

function createFailingStorage() {
  return {
    getXiuYuan: vi.fn(() => {
      throw new Error('legacy getXiuYuan should not be used');
    }),
    getAllXiuYuans: vi.fn(() => {
      throw new Error('legacy getAllXiuYuans should not be used');
    }),
    getCardDTO: vi.fn(() => {
      throw new Error('legacy getCardDTO should not be used');
    }),
    upsertXiuYuan: vi.fn(),
    save: vi.fn(async () => ({ ok: true, value: undefined })),
  };
}

function createSqlCardDTO(cardId: string, xiuyuanID = 'xy_sql_rich') {
  const now = Date.now();
  return {
    id: cardId,
    blockId: '20210808180117-6v0mkxr',
    due: now + 60_000,
    stability: 2.5,
    difficulty: 4.5,
    reps: 3,
    lapses: 1,
    state: CardState.Review,
    lastReview: now,
    elapsedDays: 1,
    scheduledDays: 2,
    priority: 7,
    type: CardType.Item,
    tags: ['sql'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    xiuyuanID,
    templateID: 'builtin-list-item',
    meta: { faceIndex: 0 },
  };
}

describe('XiuyuanRepository SQL-first reads', () => {
  it('reads findById through the SQL port without touching legacy storage', async () => {
    const storage = createFailingStorage();
    const sqlReadPort: XiuyuanSqlReadPort = {
      findById: vi.fn(() => createXiuyuan()),
      findByBlockId: vi.fn(() => []),
      getCardDTO: vi.fn(() => null),
      getCardDTOsByXiuyuanId: vi.fn(() => []),
    };
    const id = XiuyuanId.create('xy_sql_first');
    expect(id.ok).toBe(true);
    if (!id.ok) return;

    const repository = new XiuyuanRepository(storage as never, undefined, sqlReadPort);
    const result = await repository.findById(id.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.getId().getValue()).toBe('xy_sql_first');
    expect(sqlReadPort.findById).toHaveBeenCalledWith('xy_sql_first');
    expect(storage.getXiuYuan).not.toHaveBeenCalled();
  });

  it('reads findByBlockId through the SQL port without scanning legacy storage', async () => {
    const storage = createFailingStorage();
    const sqlReadPort: XiuyuanSqlReadPort = {
      findById: vi.fn(() => null),
      findByBlockId: vi.fn(() => [createXiuyuan()]),
      getCardDTO: vi.fn(() => null),
      getCardDTOsByXiuyuanId: vi.fn(() => []),
    };
    const blockId = BlockId.create('20210808180117-6v0mkxr');
    expect(blockId.ok).toBe(true);
    if (!blockId.ok) return;

    const repository = new XiuyuanRepository(storage as never, undefined, sqlReadPort);
    const result = await repository.findByBlockId(blockId.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(sqlReadPort.findByBlockId).toHaveBeenCalledWith('20210808180117-6v0mkxr');
    expect(storage.getAllXiuYuans).not.toHaveBeenCalled();
  });

  it('preserves aggregate metadata and scheduling links when hydrating through SQL', async () => {
    const storage = createFailingStorage();
    const sqlCardDTO = createSqlCardDTO('card-sql-1');
    const persisted = createXiuyuan({
      id: 'xy_sql_rich',
      blockIDs: ['20210808180117-6v0mkxr', '20210808180117-6v0mkxs'],
      templateID: 'builtin-list-item',
      meta: {
        ownership: 'riff-managed',
        cardType: 'item',
        faces: [{
          question: 'Question block',
          answer: 'Answer block',
          questionBlockId: '20210808180117-6v0mkxr',
          answerBlockId: '20210808180117-6v0mkxs',
        }],
        cardIds: ['card-sql-1'],
      },
    });
    const sqlReadPort: XiuyuanSqlReadPort = {
      findById: vi.fn(() => persisted),
      findByBlockId: vi.fn(() => [persisted]),
      getCardDTO: vi.fn(() => sqlCardDTO),
      getCardDTOsByXiuyuanId: vi.fn(() => [sqlCardDTO]),
    };
    const id = XiuyuanId.create('xy_sql_rich');
    expect(id.ok).toBe(true);
    if (!id.ok) return;

    const repository = new XiuyuanRepository(storage as never, undefined, sqlReadPort);
    const result = await repository.findById(id.value);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) return;
    expect(result.value.getTemplateID().getValue()).toBe('builtin-list-item');
    expect(result.value.getBlockIDs().map((item) => item.getValue())).toEqual([
      '20210808180117-6v0mkxr',
      '20210808180117-6v0mkxs',
    ]);
    expect(result.value.getFaces()[0].question).toBe('Question block');
    expect(result.value.getMeta()).toMatchObject({
      ownership: 'riff-managed',
      cardType: 'item',
      cardIds: ['card-sql-1'],
    });
    const [card] = result.value.getCards();
    expect(card.getId().getValue()).toBe('card-sql-1');
    expect(card.getScheduleInfo().reps).toBe(3);
    expect(sqlReadPort.getCardDTO).toHaveBeenCalledWith('card-sql-1');
    expect(storage.getCardDTO).not.toHaveBeenCalled();
  });

  it('hydrates aggregate cards through SQL when persisted cardIds are missing without writing legacy storage', async () => {
    const storage = createFailingStorage();
    const sqlCardDTO = createSqlCardDTO('card-sql-rebuilt', 'xy_sql_missing_cardids');
    const persisted = createXiuyuan({
      id: 'xy_sql_missing_cardids',
      meta: {
        faces: [{
          question: 'Q',
          answer: 'A',
          questionBlockId: '20210808180117-6v0mkxr',
          answerBlockId: '20210808180117-6v0mkxr',
        }],
      },
    });
    const sqlReadPort: XiuyuanSqlReadPort = {
      findById: vi.fn(() => persisted),
      findByBlockId: vi.fn(() => [persisted]),
      getCardDTO: vi.fn(() => sqlCardDTO),
      getCardDTOsByXiuyuanId: vi.fn(() => [sqlCardDTO]),
    };
    const id = XiuyuanId.create('xy_sql_missing_cardids');
    expect(id.ok).toBe(true);
    if (!id.ok) return;

    const repository = new XiuyuanRepository(storage as never, undefined, sqlReadPort);
    const result = await repository.findById(id.value);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) return;
    expect(result.value.getCards().map((card) => card.getId().getValue())).toEqual(['card-sql-rebuilt']);
    expect(sqlReadPort.getCardDTOsByXiuyuanId).toHaveBeenCalledWith('xy_sql_missing_cardids');
    expect(sqlReadPort.getCardDTO).not.toHaveBeenCalled();
    expect(storage.upsertXiuYuan).not.toHaveBeenCalled();
    expect(storage.getCardDTO).not.toHaveBeenCalled();
  });
});
