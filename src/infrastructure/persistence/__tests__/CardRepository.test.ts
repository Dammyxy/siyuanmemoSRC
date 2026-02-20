/**
 * CardRepository 单元测试
 * 
 * **验证需求 6.2**：测试 CardRepository 的所有 CRUD 操作
 * 
 * 测试覆盖：
 * 1. save 方法
 * 2. findById 方法
 * 3. 查询方法（findByBlockId、findByXiuyuanId）
 * 4. 错误处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardRepository } from '../CardRepository';
import { Card } from '../../../domain/entities/Card';
import { CardMapper } from '../mappers/CardMapper';
import type { UnifiedStorageManager } from '../../../core/storage/UnifiedStorageManager';
import type { FSRSCard, CardType } from '../../../types/card';
import { CardState } from '../../../types/card';
import { ok, err, isErr } from '../../../types/result';

// ==================== Mock UnifiedStorageManager ====================

function createMockStorageManager(): UnifiedStorageManager {
  const cards = new Map<string, FSRSCard>();
  const xiuyuans = new Map<string, any>();

  return {
    getCard: vi.fn((id: string) => cards.get(id)),
    
    createCard: vi.fn(async (xiuyuan: any, card: FSRSCard) => {
      xiuyuans.set(xiuyuan.id, xiuyuan);
      cards.set(card.id, card);
      return ok(undefined);
    }),
    
    updateCard: vi.fn(async (card: FSRSCard) => {
      if (!cards.has(card.id)) {
        return err(new Error(`Card not found: ${card.id}`));
      }
      cards.set(card.id, card);
      return ok(undefined);
    }),
    
    deleteCard: vi.fn(async (id: string) => {
      if (!cards.has(id)) {
        return err(new Error(`Card not found: ${id}`));
      }
      cards.delete(id);
      return ok(undefined);
    }),
    
    getCardsByBlockId: vi.fn((blockId: string) => {
      return Array.from(cards.values()).filter(c => c.blockId === blockId);
    }),
    
    getCardsByXiuyuanId: vi.fn((xiuyuanId: string) => {
      return Array.from(cards.values()).filter(c => c.meta?.xiuyuanID === xiuyuanId);
    }),
    
    getCardsByType: vi.fn((type: CardType) => {
      return Array.from(cards.values()).filter(c => c.type === type);
    }),
    
    getAllCards: vi.fn(() => Array.from(cards.values())),
    
    getDueCards: vi.fn((limit: number) => {
      const now = Date.now();
      return Array.from(cards.values())
        .filter(c => c.due <= now && c.state !== 4)
        .slice(0, limit);
    }),
    
    getStats: vi.fn(() => ({
      totalCards: cards.size,
      totalXiuyuans: xiuyuans.size,
      cardsByType: {} as any,
      cardsByState: {} as any,
    })),
    
    save: vi.fn(async () => ok(undefined)),
    load: vi.fn(async () => ok(undefined)),
  } as any;
}

// ==================== 测试辅助函数 ====================

function createBasicCardProps() {
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: Date.now() + 86400000, // 明天
    stability: 5.0,
    difficulty: 3.5,
    reps: 10,
    lapses: 2,
    state: CardState.Review,
    lastReview: Date.now() - 86400000, // 昨天
    elapsedDays: 5,
    scheduledDays: 10,
    priority: 50,
    type: 'item' as CardType,
    tags: ['test'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now() - 864000000, // 10天前
    updatedAt: Date.now(),
  };
}

// ==================== save 方法测试 ====================

describe('CardRepository.save', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该成功保存新卡片', async () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    const result = await repository.save(card);

    expect(isErr(result)).toBe(false);
    expect(storage.createCard).toHaveBeenCalled();
  });

  it('应该成功更新已存在的卡片', async () => {
    // 先创建一个卡片
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    await repository.save(card);

    // 再次保存（更新）
    const result = await repository.save(card);

    expect(isErr(result)).toBe(false);
    expect(storage.updateCard).toHaveBeenCalled();
  });

  it('应该正确处理 Xiuyuan 卡片', async () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      type: 'concept' as CardType,
      xiuyuanMetadata: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-1'],
        backBlockIDs: ['block-2'],
        fieldMapping: { question: 'block-1', answer: 'block-2' },
        priority: 80,
      },
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    const result = await repository.save(card);

    expect(isErr(result)).toBe(false);
    expect(storage.createCard).toHaveBeenCalled();
    
    // 验证传递给 createCard 的 xiuyuan 参数
    const createCardCall = vi.mocked(storage.createCard).mock.calls[0];
    expect(createCardCall[0].id).toBe('xy_123');
    expect(createCardCall[0].templateID).toBe('builtin-concept-simple');
  });

  it('应该正确处理普通卡片（非 Xiuyuan）', async () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    const result = await repository.save(card);

    expect(isErr(result)).toBe(false);
    expect(storage.createCard).toHaveBeenCalled();
    
    // 验证为普通卡片创建了默认 xiuyuan
    const createCardCall = vi.mocked(storage.createCard).mock.calls[0];
    expect(createCardCall[0].id).toBe(`xy_${card.id.value}`);
    expect(createCardCall[0].templateID).toBe('builtin-quick-card');
  });

  it('应该返回错误当存储失败时', async () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    
    // Mock 存储失败 - 抛出异常而不是返回 err Result
    vi.mocked(storage.createCard).mockRejectedValueOnce(
      new Error('Storage error')
    );

    const result = await repository.save(card);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('Storage error');
  });
});

// ==================== findById 方法测试 ====================

describe('CardRepository.findById', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该成功查找存在的卡片', async () => {
    // 先保存一个卡片
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    await repository.save(card);

    // 查找卡片
    const result = await repository.findById(card.id.value);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).not.toBeNull();
    expect(result.value?.id.value).toBe(card.id.value);
  });

  it('应该返回 null 当卡片不存在时', async () => {
    const result = await repository.findById('non-existent-id');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toBeNull();
  });

  it('应该正确重建 Xiuyuan 元数据', async () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      type: 'concept' as CardType,
      xiuyuanMetadata: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-1'],
        backBlockIDs: ['block-2'],
        fieldMapping: { question: 'block-1', answer: 'block-2' },
        priority: 80,
      },
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const card = cardResult.value;
    await repository.save(card);

    // 查找并验证
    const result = await repository.findById(card.id.value);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).not.toBeNull();
    expect(result.value?.xiuyuanMetadata).toBeDefined();
    expect(result.value?.xiuyuanMetadata?.xiuyuanID).toBe('xy_123');
    expect(result.value?.xiuyuanMetadata?.templateID).toBe('builtin-concept-simple');
  });

  it('应该返回错误当转换失败时', async () => {
    // Mock getCard 返回无效数据
    vi.mocked(storage.getCard).mockReturnValueOnce({
      id: '', // 无效：空 ID
      blockId: 'block-1',
    } as any);

    const result = await repository.findById('invalid-card');

    expect(isErr(result)).toBe(true);
  });
});

// ==================== findByBlockId 方法测试 ====================

describe('CardRepository.findByBlockId', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该查找指定 blockId 的所有卡片', async () => {
    // 创建多个卡片，相同 blockId
    const card1Result = Card.create({ ...createBasicCardProps(), id: 'card-1', blockId: 'block-1' });
    const card2Result = Card.create({ ...createBasicCardProps(), id: 'card-2', blockId: 'block-1' });
    const card3Result = Card.create({ ...createBasicCardProps(), id: 'card-3', blockId: 'block-2' });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    expect(isErr(card3Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result) || isErr(card3Result)) return;

    await repository.save(card1Result.value);
    await repository.save(card2Result.value);
    await repository.save(card3Result.value);

    // 查找 block-1 的卡片
    const result = await repository.findByBlockId('block-1');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toHaveLength(2);
    expect(result.value.every(c => c.blockId.value === 'block-1')).toBe(true);
  });

  it('应该返回空数组当没有匹配的卡片时', async () => {
    const result = await repository.findByBlockId('non-existent-block');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toEqual([]);
  });

  it('应该跳过无效的卡片', async () => {
    // 保存一个有效卡片
    const cardResult = Card.create({ ...createBasicCardProps(), blockId: 'block-1' });
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;
    await repository.save(cardResult.value);

    // Mock getCardsByBlockId 返回包含无效卡片的数组
    vi.mocked(storage.getCardsByBlockId).mockReturnValueOnce([
      CardMapper.toDomain(CardMapper.fromEntity(cardResult.value)),
      { id: '', blockId: 'block-1' } as any, // 无效卡片
    ]);

    const result = await repository.findByBlockId('block-1');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    // 应该只返回有效的卡片
    expect(result.value).toHaveLength(1);
  });
});

// ==================== findByXiuyuanId 方法测试 ====================

describe('CardRepository.findByXiuyuanId', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该查找指定 xiuyuanId 的所有卡片', async () => {
    // 创建多个 Xiuyuan 卡片
    const card1Result = Card.create({
      ...createBasicCardProps(),
      id: 'card-1',
      type: 'concept' as CardType,
      xiuyuanMetadata: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-1'],
        backBlockIDs: ['block-2'],
      },
    });

    const card2Result = Card.create({
      ...createBasicCardProps(),
      id: 'card-2',
      type: 'concept' as CardType,
      xiuyuanMetadata: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-3'],
        backBlockIDs: ['block-4'],
      },
    });

    const card3Result = Card.create({
      ...createBasicCardProps(),
      id: 'card-3',
      type: 'concept' as CardType,
      xiuyuanMetadata: {
        xiuyuanID: 'xy_456',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-5'],
        backBlockIDs: ['block-6'],
      },
    });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    expect(isErr(card3Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result) || isErr(card3Result)) return;

    await repository.save(card1Result.value);
    await repository.save(card2Result.value);
    await repository.save(card3Result.value);

    // 查找 xy_123 的卡片
    const result = await repository.findByXiuyuanId('xy_123');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toHaveLength(2);
    expect(result.value.every(c => c.xiuyuanMetadata?.xiuyuanID === 'xy_123')).toBe(true);
  });

  it('应该返回空数组当没有匹配的卡片时', async () => {
    const result = await repository.findByXiuyuanId('non-existent-xiuyuan');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toEqual([]);
  });

  it('应该不返回普通卡片（非 Xiuyuan）', async () => {
    // 创建普通卡片
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;
    await repository.save(cardResult.value);

    // 查找任何 xiuyuanId
    const result = await repository.findByXiuyuanId('any-id');

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toEqual([]);
  });
});

// ==================== 错误处理测试 ====================

describe('CardRepository - 错误处理', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该处理 save 时的存储错误', async () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    // Mock 存储错误
    vi.mocked(storage.createCard).mockRejectedValueOnce(new Error('Storage failure'));

    const result = await repository.save(cardResult.value);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('Storage failure');
  });

  it('应该处理 findById 时的转换错误', async () => {
    // Mock 返回无效数据
    vi.mocked(storage.getCard).mockReturnValueOnce({
      id: '',
      blockId: '',
    } as any);

    const result = await repository.findById('invalid-id');

    expect(isErr(result)).toBe(true);
  });

  it('应该处理 findByBlockId 时的查询错误', async () => {
    // Mock 抛出异常
    vi.mocked(storage.getCardsByBlockId).mockImplementationOnce(() => {
      throw new Error('Query error');
    });

    const result = await repository.findByBlockId('block-1');

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('Query error');
  });

  it('应该处理 findByXiuyuanId 时的查询错误', async () => {
    // Mock 抛出异常
    vi.mocked(storage.getCardsByXiuyuanId).mockImplementationOnce(() => {
      throw new Error('Query error');
    });

    const result = await repository.findByXiuyuanId('xy_123');

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('Query error');
  });

  it('应该处理 delete 时的错误', async () => {
    const result = await repository.delete('non-existent-id');

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('Card not found');
  });
});

// ==================== 批量操作测试 ====================

describe('CardRepository - 批量操作', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该成功批量保存卡片', async () => {
    const card1Result = Card.create({ ...createBasicCardProps(), id: 'card-1', blockId: 'block-1' });
    const card2Result = Card.create({ ...createBasicCardProps(), id: 'card-2', blockId: 'block-2' });
    const card3Result = Card.create({ ...createBasicCardProps(), id: 'card-3', blockId: 'block-3' });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    expect(isErr(card3Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result) || isErr(card3Result)) return;

    const cards = [card1Result.value, card2Result.value, card3Result.value];
    const result = await repository.saveBatch(cards);

    expect(isErr(result)).toBe(false);
    expect(storage.createCard).toHaveBeenCalledTimes(3);
  });

  it('应该在批量保存失败时停止并返回错误', async () => {
    const card1Result = Card.create({ ...createBasicCardProps(), id: 'card-1', blockId: 'block-1' });
    const card2Result = Card.create({ ...createBasicCardProps(), id: 'card-2', blockId: 'block-2' });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result)) return;

    const cards = [card1Result.value, card2Result.value];
    
    // Mock 第二次保存失败 - 抛出异常
    let callCount = 0;
    vi.mocked(storage.createCard).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Save failed');
      }
      return ok(undefined);
    });

    const result = await repository.saveBatch(cards);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('Save failed');
  });
});

// ==================== 其他查询方法测试 ====================

describe('CardRepository - 其他查询方法', () => {
  let repository: CardRepository;
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = createMockStorageManager();
    repository = new CardRepository(storage);
  });

  it('应该查找到期的卡片', async () => {
    const now = Date.now();
    const dueCard = Card.create({ ...createBasicCardProps(), id: 'due-card', due: now - 1000 });
    const futureCard = Card.create({ ...createBasicCardProps(), id: 'future-card', due: now + 86400000 });

    expect(isErr(dueCard)).toBe(false);
    expect(isErr(futureCard)).toBe(false);
    if (isErr(dueCard) || isErr(futureCard)) return;

    await repository.save(dueCard.value);
    await repository.save(futureCard.value);

    const result = await repository.findDueCards(10);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.some(c => c.id.value === 'due-card')).toBe(true);
  });

  it('应该检查卡片是否存在', async () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    await repository.save(cardResult.value);

    const existsResult = await repository.exists(cardResult.value.id.value);
    expect(isErr(existsResult)).toBe(false);
    if (isErr(existsResult)) return;
    expect(existsResult.value).toBe(true);

    const notExistsResult = await repository.exists('non-existent-id');
    expect(isErr(notExistsResult)).toBe(false);
    if (isErr(notExistsResult)) return;
    expect(notExistsResult.value).toBe(false);
  });

  it('应该统计卡片数量', async () => {
    const card1Result = Card.create({ ...createBasicCardProps(), id: 'card-1', blockId: 'block-1' });
    const card2Result = Card.create({ ...createBasicCardProps(), id: 'card-2', blockId: 'block-2' });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result)) return;

    await repository.save(card1Result.value);
    await repository.save(card2Result.value);

    const result = await repository.count();

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value).toBe(2);
  });
});
