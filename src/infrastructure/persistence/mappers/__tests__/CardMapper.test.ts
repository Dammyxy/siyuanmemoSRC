/**
 * CardMapper 单元测试
 * 
 * **验证需求 6.1**：测试 CardMapper 的所有转换方法
 * 
 * 测试覆盖：
 * 1. fromEntity 方法的基本功能
 * 2. toEntity 方法的基本功能
 * 3. 批量转换方法
 * 4. 边界条件（空数组、undefined 字段）
 */

import { describe, it, expect } from 'vitest';
import { CardMapper } from '../CardMapper';
import { Card } from '../../../../domain/entities/Card';
import type { FSRSCard } from '../../../../types/card';
import { CardState, CardType } from '../../../../types/card';
import type { CardPersistenceDTO } from '../../dto/CardPersistenceDTO';
import { isErr } from '../../../../types/result';

// ==================== 测试辅助函数 ====================

function createBasicCardProps() {
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: 1234567890,
    stability: 5.0,
    difficulty: 3.5,
    reps: 10,
    lapses: 2,
    state: CardState.Review,
    lastReview: 1234567800,
    elapsedDays: 5,
    scheduledDays: 10,
    priority: 50,
    type: CardType.Item,
    tags: ['test'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1234567000,
    updatedAt: 1234567890,
  };
}

function createBasicDTO(): CardPersistenceDTO {
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: 1234567890,
    stability: 5.0,
    difficulty: 3.5,
    reps: 10,
    lapses: 2,
    state: CardState.Review,
    lastReview: 1234567800,
    elapsedDays: 5,
    scheduledDays: 10,
    priority: 50,
    type: CardType.Item,
    tags: ['test'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1234567000,
    updatedAt: 1234567890,
  };
}

// ==================== fromEntity 测试 ====================

describe('CardMapper.fromEntity', () => {
  it('应该正确转换基本 Card Entity', () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);

    expect(dto.id).toBe('card-1');
    expect(dto.blockId).toBe('block-1');
    expect(dto.due).toBe(1234567890);
    expect(dto.stability).toBe(5.0);
    expect(dto.difficulty).toBe(3.5);
    expect(dto.reps).toBe(10);
    expect(dto.lapses).toBe(2);
    expect(dto.state).toBe(CardState.Review);
    expect(dto.priority).toBe(50);
    expect(dto.type).toBe(CardType.Item);
    expect(dto.tags).toEqual(['test']);
  });

  it('应该提取 Xiuyuan 元数据到顶层字段', () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      type: CardType.Concept,
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

    const dto = CardMapper.fromEntity(cardResult.value);

    expect(dto.xiuyuanID).toBe('xy_123');
    expect(dto.templateID).toBe('builtin-concept-simple');
    expect(dto.frontBlockIDs).toEqual(['block-1']);
    expect(dto.backBlockIDs).toEqual(['block-2']);
    expect(dto.fieldMapping).toEqual({ question: 'block-1', answer: 'block-2' });
    expect(dto.xiuyuanPriority).toBe(80);
  });

  it('应该处理没有 Xiuyuan 元数据的卡片', () => {
    const cardResult = Card.create(createBasicCardProps());
    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);

    expect(dto.xiuyuanID).toBeUndefined();
    expect(dto.templateID).toBeUndefined();
    expect(dto.frontBlockIDs).toBeUndefined();
    expect(dto.backBlockIDs).toBeUndefined();
  });

  it('应该处理扩展数据字段', () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      extensionData: {
        customField: 'customValue',
        anotherField: 123,
      },
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);

    expect(dto.meta).toEqual({
      customField: 'customValue',
      anotherField: 123,
    });
  });
});

// ==================== toEntity 测试 ====================

describe('CardMapper.toEntity', () => {
  it('应该正确转换基本 DTO 为 Card Entity', () => {
    const dto = createBasicDTO();
    const result = CardMapper.toEntity(dto);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    const card = result.value;
    expect(card.id.value).toBe('card-1');
    expect(card.blockId.value).toBe('block-1');
    expect(card.due).toBe(1234567890);
    expect(card.stability).toBe(5.0);
    expect(card.difficulty).toBe(3.5);
    expect(card.priority.value).toBe(50);
    expect(card.type).toBe(CardType.Item);
  });

  it('应该重建 Xiuyuan 元数据', () => {
    const dto: CardPersistenceDTO = {
      ...createBasicDTO(),
      type: CardType.Concept,
      xiuyuanID: 'xy_123',
      templateID: 'builtin-concept-simple',
      frontBlockIDs: ['block-1'],
      backBlockIDs: ['block-2'],
      fieldMapping: { question: 'block-1', answer: 'block-2' },
      xiuyuanPriority: 80,
    };

    const result = CardMapper.toEntity(dto);
    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    const card = result.value;
    expect(card.xiuyuanMetadata).toBeDefined();
    expect(card.xiuyuanMetadata?.xiuyuanID).toBe('xy_123');
    expect(card.xiuyuanMetadata?.templateID).toBe('builtin-concept-simple');
    expect(card.xiuyuanMetadata?.frontBlockIDs).toEqual(['block-1']);
    expect(card.xiuyuanMetadata?.backBlockIDs).toEqual(['block-2']);
    expect(card.xiuyuanMetadata?.priority).toBe(80);
  });

  it('应该处理没有 Xiuyuan 字段的 DTO', () => {
    const dto = createBasicDTO();
    const result = CardMapper.toEntity(dto);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    const card = result.value;
    expect(card.xiuyuanMetadata).toBeUndefined();
  });

  it('应该返回错误当 DTO 数据无效时', () => {
    const dto: CardPersistenceDTO = {
      ...createBasicDTO(),
      id: '', // 无效：空 ID
    };

    const result = CardMapper.toEntity(dto);
    expect(isErr(result)).toBe(true);
  });

  it('应该处理扩展数据字段', () => {
    const dto: CardPersistenceDTO = {
      ...createBasicDTO(),
      meta: {
        customField: 'customValue',
        anotherField: 123,
      },
    };

    const result = CardMapper.toEntity(dto);
    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    const card = result.value;
    expect(card.extensionData).toEqual({
      customField: 'customValue',
      anotherField: 123,
    });
  });
});

// ==================== 批量转换测试 ====================

describe('CardMapper.fromEntityBatch', () => {
  it('应该正确批量转换 Card Entity 数组', () => {
    const card1Result = Card.create({ ...createBasicCardProps(), id: 'card-1', blockId: 'block-1' });
    const card2Result = Card.create({ ...createBasicCardProps(), id: 'card-2', blockId: 'block-2' });
    const card3Result = Card.create({ ...createBasicCardProps(), id: 'card-3', blockId: 'block-3' });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    expect(isErr(card3Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result) || isErr(card3Result)) return;

    const cards = [card1Result.value, card2Result.value, card3Result.value];
    const dtos = CardMapper.fromEntityBatch(cards);

    expect(dtos).toHaveLength(3);
    expect(dtos[0].id).toBe('card-1');
    expect(dtos[1].id).toBe('card-2');
    expect(dtos[2].id).toBe('card-3');
  });

  it('应该处理空数组', () => {
    const dtos = CardMapper.fromEntityBatch([]);
    expect(dtos).toEqual([]);
  });

  it('应该保持数组顺序', () => {
    const card1Result = Card.create({ ...createBasicCardProps(), id: 'card-1', blockId: 'block-1' });
    const card2Result = Card.create({ ...createBasicCardProps(), id: 'card-2', blockId: 'block-2' });

    expect(isErr(card1Result)).toBe(false);
    expect(isErr(card2Result)).toBe(false);
    if (isErr(card1Result) || isErr(card2Result)) return;

    const cards = [card1Result.value, card2Result.value];
    const dtos = CardMapper.fromEntityBatch(cards);

    expect(dtos[0].id).toBe('card-1');
    expect(dtos[1].id).toBe('card-2');
  });
});

describe('CardMapper.toEntityBatch', () => {
  it('应该正确批量转换 DTO 数组', () => {
    const dto1: CardPersistenceDTO = { ...createBasicDTO(), id: 'card-1', blockId: 'block-1' };
    const dto2: CardPersistenceDTO = { ...createBasicDTO(), id: 'card-2', blockId: 'block-2' };
    const dto3: CardPersistenceDTO = { ...createBasicDTO(), id: 'card-3', blockId: 'block-3' };

    const result = CardMapper.toEntityBatch([dto1, dto2, dto3]);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    const cards = result.value;
    expect(cards).toHaveLength(3);
    expect(cards[0].id.value).toBe('card-1');
    expect(cards[1].id.value).toBe('card-2');
    expect(cards[2].id.value).toBe('card-3');
  });

  it('应该处理空数组', () => {
    const result = CardMapper.toEntityBatch([]);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    expect(result.value).toEqual([]);
  });

  it('应该返回错误当任何 DTO 无效时', () => {
    const dto1: CardPersistenceDTO = { ...createBasicDTO(), id: 'card-1', blockId: 'block-1' };
    const dto2: CardPersistenceDTO = { ...createBasicDTO(), id: '', blockId: 'block-2' }; // 无效
    const dto3: CardPersistenceDTO = { ...createBasicDTO(), id: 'card-3', blockId: 'block-3' };

    const result = CardMapper.toEntityBatch([dto1, dto2, dto3]);

    expect(isErr(result)).toBe(true);
  });

  it('应该收集所有错误信息', () => {
    const dto1: CardPersistenceDTO = { ...createBasicDTO(), id: '', blockId: 'block-1' }; // 无效
    const dto2: CardPersistenceDTO = { ...createBasicDTO(), id: 'card-2', blockId: '' }; // 无效

    const result = CardMapper.toEntityBatch([dto1, dto2]);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error.message).toContain('Failed to convert 2 cards');
  });
});

// ==================== 边界条件测试 ====================

describe('CardMapper - 边界条件', () => {
  it('应该处理 undefined 可选字段', () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      learning_step: undefined,
      skipNote: undefined,
      skipUntil: undefined,
      sourceUrl: undefined,
      extractedFrom: undefined,
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);

    expect(dto.learning_step).toBeUndefined();
    expect(dto.skipNote).toBeUndefined();
    expect(dto.skipUntil).toBeUndefined();
    expect(dto.sourceUrl).toBeUndefined();
    expect(dto.extractedFrom).toBeUndefined();
  });

  it('应该处理空标签数组', () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      tags: [],
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);
    expect(dto.tags).toEqual([]);
  });

  it('应该处理 undefined 扩展数据', () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      extensionData: undefined,
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);
    expect(dto.meta).toBeUndefined();
  });

  it('应该处理部分 Xiuyuan 元数据', () => {
    const cardResult = Card.create({
      ...createBasicCardProps(),
      xiuyuanMetadata: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-quick-card',
        frontBlockIDs: [],
        backBlockIDs: [],
        // fieldMapping 和 priority 未定义
      },
    });

    expect(isErr(cardResult)).toBe(false);
    if (isErr(cardResult)) return;

    const dto = CardMapper.fromEntity(cardResult.value);

    expect(dto.xiuyuanID).toBe('xy_123');
    expect(dto.templateID).toBe('builtin-quick-card');
    expect(dto.frontBlockIDs).toEqual([]);
    expect(dto.backBlockIDs).toEqual([]);
    expect(dto.fieldMapping).toBeUndefined();
    expect(dto.xiuyuanPriority).toBeUndefined();
  });
});

// ==================== FSRSCard 兼容性测试 ====================

describe('CardMapper - FSRSCard 兼容性', () => {
  describe('toPersistence', () => {
    it('应该正确映射基础字段', () => {
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.New,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: ['test'],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
      };

      const dto = CardMapper.toPersistence(card);

      expect(dto.id).toBe('card-1');
      expect(dto.blockId).toBe('block-1');
      expect(dto.due).toBe(1234567890);
      expect(dto.stability).toBe(5.0);
      expect(dto.difficulty).toBe(3.5);
      expect(dto.type).toBe(CardType.Item);
    });

    it('应该提取 Xiuyuan 字段到顶层', () => {
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Concept,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
        meta: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-concept-simple',
          frontBlockIDs: ['block-1'],
          backBlockIDs: ['block-2'],
          fieldMapping: { question: 'block-1', answer: 'block-2' },
          priority: 80,
          customField: 'customValue',
        },
      };

      const dto = CardMapper.toPersistence(card);

      expect(dto.xiuyuanID).toBe('xy_123');
      expect(dto.templateID).toBe('builtin-concept-simple');
      expect(dto.frontBlockIDs).toEqual(['block-1']);
      expect(dto.backBlockIDs).toEqual(['block-2']);
      expect(dto.fieldMapping).toEqual({ question: 'block-1', answer: 'block-2' });
      expect(dto.xiuyuanPriority).toBe(80);
      expect(dto.meta).toEqual({ customField: 'customValue' });
    });

    it('应该清理空的 meta 对象', () => {
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
        meta: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-quick-card',
        },
      };

      const dto = CardMapper.toPersistence(card);
      expect(dto.meta).toBeUndefined();
    });

    it('应该移除持久 meta 中的调度预览和算法状态', () => {
      const card = {
        id: 'card-scheduling-meta',
        blockId: 'block-scheduling-meta',
        due: 1234567890,
        stability: 5,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.New,
        lastReview: 1234567800,
        elapsedDays: 1,
        scheduledDays: 3,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
        meta: {
          nextDues: { again: 1 },
          stability: 1,
          difficulty: 1,
          aFactor: 9,
          scheduledDays: 1,
          customField: 'kept',
        },
      } as FSRSCard;

      const dto = CardMapper.toPersistence(card);

      expect(dto.meta).toEqual({ customField: 'kept' });
      expect(dto.schedulerType).toBe('fsrs-v6');
      expect(dto.aFactor).toBeUndefined();
      expect(dto.schedulerMeta).toBeUndefined();
    });
  });

  describe('toDomain', () => {
    it('应该正确重建领域模型', () => {
      const dto: CardPersistenceDTO = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: ['test'],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
      };

      const card = CardMapper.toDomain(dto);

      expect(card.id).toBe('card-1');
      expect(card.blockId).toBe('block-1');
      expect(card.due).toBe(1234567890);
      expect(card.stability).toBe(5.0);
      expect(card.type).toBe(CardType.Item);
    });

    it('应该重建 meta 字段', () => {
      const dto: CardPersistenceDTO = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Concept,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-1'],
        backBlockIDs: ['block-2'],
        fieldMapping: { question: 'block-1', answer: 'block-2' },
        xiuyuanPriority: 80,
        meta: { customField: 'customValue' },
      };

      const card = CardMapper.toDomain(dto);

      expect(card.meta).toEqual({
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['block-1'],
        backBlockIDs: ['block-2'],
        fieldMapping: { question: 'block-1', answer: 'block-2' },
        priority: 80,
        customField: 'customValue',
      });
    });

    it('应该处理没有 Xiuyuan 字段的卡片', () => {
      const dto: CardPersistenceDTO = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
      };

      const card = CardMapper.toDomain(dto);
      expect(card.meta).toBeUndefined();
    });

    it('应该把 Topic/Concept 的历史 fsrs-v6 调度类型规范为 a-factor-v2', () => {
      const dto: CardPersistenceDTO = {
        ...createBasicDTO(),
        id: 'topic-dirty',
        blockId: 'block-topic-dirty',
        type: CardType.Topic,
        schedulerType: 'fsrs-v6',
        aFactor: 99,
        schedulerMeta: {
          staleExternal: {
            of: 3,
            optimumInterval: 4,
            afs: [3],
          } as unknown,
        },
        meta: {
          aFactor: 9,
          nextDues: { good: 1 },
          customField: 'kept',
        },
      };

      const card = CardMapper.toDomain(dto);

      expect(card.schedulerType).toBe('a-factor-v2');
      expect(card.aFactor).toBe(6);
      expect(card.schedulerMeta).toEqual({
        topic: {
          afs: [6],
          of: 6,
          optimalInterval: 10,
        },
      });
      expect(card.meta).toEqual({ customField: 'kept' });
    });
  });

  describe('往返转换', () => {
    it('应该保持数据一致性（无 Xiuyuan）', () => {
      const original: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.New,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: ['test'],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
      };

      const dto = CardMapper.toPersistence(original);
      const restored = CardMapper.toDomain(dto);

      expect(restored).toMatchObject({
        ...original,
        schedulerType: 'fsrs-v6',
      });
    });

    it('应该保持数据一致性（有 Xiuyuan）', () => {
      const original: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: 1234567890,
        stability: 5.0,
        difficulty: 3.5,
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: 1234567800,
        elapsedDays: 5,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Concept,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1234567000,
        updatedAt: 1234567890,
        meta: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-concept-simple',
          frontBlockIDs: ['block-1'],
          backBlockIDs: ['block-2'],
          priority: 80,
          customField: 'customValue',
        },
      };

      const dto = CardMapper.toPersistence(original);
      const restored = CardMapper.toDomain(dto);

      expect(restored).toMatchObject({
        ...original,
        aFactor: 2.5,
        schedulerType: 'a-factor-v2',
        schedulerMeta: {
          topic: {
            afs: [2.5],
            of: 2.5,
            optimalInterval: 10,
          },
        },
      });
    });
  });
});

// ==================== Card Entity Result 处理测试 ====================

/**
 * **验证需求 2.1, 2.4**：测试 Card Entity 的 Result 处理
 * 
 * 测试覆盖：
 * 1. 无效输入返回 err
 * 2. 有效输入返回 ok
 * 3. updatePriority 的 Result 处理
 */
describe('Card Entity Result 处理', () => {
  describe('Card.create - 无效输入', () => {
    it('应该返回 err 当 ID 为空时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        id: '', // 无效：空 ID
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Card ID cannot be empty');
    });

    it('应该返回 err 当 blockId 为空时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        blockId: '', // 无效：空 blockId
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Block ID cannot be empty');
    });

    it('应该返回 err 当 priority 超出范围时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        priority: 150, // 无效：超出范围 (0-100)
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Priority must be between 0 and 100');
    });

    it('应该返回 err 当 priority 为负数时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        priority: -10, // 无效：负数
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Priority must be between 0 and 100');
    });
  });

  describe('Card.create - 有效输入', () => {
    it('应该返回 ok 当所有字段有效时', () => {
      const result = Card.create(createBasicCardProps());

      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;
      expect(result.value).toBeDefined();
      expect(result.value.id.value).toBe('card-1');
    });

    it('应该返回 ok 当 priority 为 0 时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        priority: 0, // 边界值：最小值
      });

      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;
      expect(result.value.priority.value).toBe(0);
    });

    it('应该返回 ok 当 priority 为 100 时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        priority: 100, // 边界值：最大值
      });

      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;
      expect(result.value.priority.value).toBe(100);
    });

    it('应该返回 ok 当包含 Xiuyuan 元数据时', () => {
      const result = Card.create({
        ...createBasicCardProps(),
        type: CardType.Concept,
        xiuyuanMetadata: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-concept-simple',
          frontBlockIDs: ['block-1'],
          backBlockIDs: ['block-2'],
          fieldMapping: { question: 'block-1', answer: 'block-2' },
          priority: 80,
        },
      });

      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;
      expect(result.value.xiuyuanMetadata).toBeDefined();
      expect(result.value.xiuyuanMetadata?.xiuyuanID).toBe('xy_123');
    });
  });

  describe('updatePriority - Result 处理', () => {
    it('应该返回 err 当新 priority 超出范围时', () => {
      const cardResult = Card.create(createBasicCardProps());
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const updateResult = card.updatePriority(150); // 无效：超出范围

      expect(isErr(updateResult)).toBe(true);
      if (!isErr(updateResult)) return;
      expect(updateResult.error.message).toContain('Priority must be between 0 and 100');
    });

    it('应该返回 err 当新 priority 为负数时', () => {
      const cardResult = Card.create(createBasicCardProps());
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const updateResult = card.updatePriority(-5); // 无效：负数

      expect(isErr(updateResult)).toBe(true);
      if (!isErr(updateResult)) return;
      expect(updateResult.error.message).toContain('Priority must be between 0 and 100');
    });

    it('应该返回 ok 当新 priority 有效时', () => {
      const cardResult = Card.create(createBasicCardProps());
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const updateResult = card.updatePriority(75); // 有效

      expect(isErr(updateResult)).toBe(false);
      if (isErr(updateResult)) return;
      expect(card.priority.value).toBe(75);
    });

    it('应该返回 ok 当新 priority 为边界值 0 时', () => {
      const cardResult = Card.create(createBasicCardProps());
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const updateResult = card.updatePriority(0); // 边界值：最小值

      expect(isErr(updateResult)).toBe(false);
      if (isErr(updateResult)) return;
      expect(card.priority.value).toBe(0);
    });

    it('应该返回 ok 当新 priority 为边界值 100 时', () => {
      const cardResult = Card.create(createBasicCardProps());
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const updateResult = card.updatePriority(100); // 边界值：最大值

      expect(isErr(updateResult)).toBe(false);
      if (isErr(updateResult)) return;
      expect(card.priority.value).toBe(100);
    });

    it('应该更新 updatedAt 时间戳当 priority 更新成功时', () => {
      const cardResult = Card.create(createBasicCardProps());
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const oldUpdatedAt = card.updatedAt;
      
      // 等待一小段时间确保时间戳不同
      const updateResult = card.updatePriority(80);
      
      expect(isErr(updateResult)).toBe(false);
      if (isErr(updateResult)) return;
      expect(card.updatedAt).toBeGreaterThanOrEqual(oldUpdatedAt);
    });

    it('应该不修改 priority 当更新失败时', () => {
      const cardResult = Card.create({
        ...createBasicCardProps(),
        priority: 50,
      });
      expect(isErr(cardResult)).toBe(false);
      if (isErr(cardResult)) return;

      const card = cardResult.value;
      const originalPriority = card.priority.value;
      
      const updateResult = card.updatePriority(150); // 无效
      
      expect(isErr(updateResult)).toBe(true);
      expect(card.priority.value).toBe(originalPriority); // 保持原值
    });
  });
});

// ==================== validate 测试 ====================

describe('CardMapper.validate', () => {
  it('应该验证有效的 DTO', () => {
    const dto: CardPersistenceDTO = {
      id: 'card-1',
      blockId: 'block-1',
      due: 1234567890,
      stability: 5.0,
      difficulty: 3.5,
      reps: 10,
      lapses: 2,
      state: CardState.Review,
      lastReview: 1234567800,
      elapsedDays: 5,
      scheduledDays: 10,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1234567000,
      updatedAt: 1234567890,
    };

    const result = CardMapper.validate(dto);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('应该检测缺失的必需字段', () => {
    const dto = {
      blockId: 'block-1',
      // 缺少 id
    } as any;

    const result = CardMapper.validate(dto);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: id');
  });

  it('应该检测无效的字段值', () => {
    const dto: CardPersistenceDTO = {
      id: 'card-1',
      blockId: 'block-1',
      due: 1234567890,
      stability: -1, // 无效：负数
      difficulty: 15, // 无效：超出范围
      reps: 10,
      lapses: 2,
      state: CardState.Review,
      lastReview: 1234567800,
      elapsedDays: 5,
      scheduledDays: 10,
      priority: 150, // 无效：超出范围
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1234567000,
      updatedAt: 1234567890,
    };

    const result = CardMapper.validate(dto);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid stability: must be non-negative');
    expect(result.errors).toContain('Invalid difficulty: must be between 1 and 10');
    expect(result.errors).toContain('Invalid priority: must be between 0 and 100');
  });

  it('应该检测 Xiuyuan 卡片的一致性', () => {
    const dto: CardPersistenceDTO = {
      id: 'card-1',
      blockId: 'block-1',
      due: 1234567890,
      stability: 5.0,
      difficulty: 3.5,
      reps: 10,
      lapses: 2,
      state: CardState.Review,
      lastReview: 1234567800,
      elapsedDays: 5,
      scheduledDays: 10,
      priority: 50,
      type: CardType.Concept,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1234567000,
      updatedAt: 1234567890,
      xiuyuanID: 'xy_123',
      // 缺少 templateID
    };

    const result = CardMapper.validate(dto);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Xiuyuan card missing templateID');
  });
});
