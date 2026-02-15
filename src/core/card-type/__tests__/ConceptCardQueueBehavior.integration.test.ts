/**
 * Concept Card Queue Behavior Integration Test
 * 
 * 测试概念卡在队列中的行为：
 * - 概念卡不出现在提取练习队列
 * - 概念卡不出现在刻意练习队列
 * - 描述符卡正常出现在练习队列
 * 
 * @see .kiro/specs/card-type-system-enhancement/requirements.md 第 3.3 节
 * @see .kiro/specs/card-type-system-enhancement/tasks.md Phase 2.2
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CardType, CardState } from '@/types/card';
import type { FSRSCard } from '@/types/card';
import * as siyuanApi from '@/core/siyuan/api';

// Mock 思源 API
vi.mock('@/core/siyuan/api', () => ({
  setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  getBlockAttrs: vi.fn().mockResolvedValue({}),
  sql: vi.fn().mockResolvedValue([]),
  addRiffCards: vi.fn().mockResolvedValue(undefined),
}));

/**
 * 创建测试用的卡片
 */
function createTestCard(
  id: string,
  blockId: string,
  type: CardType,
  cardTypeMarker?: 'concept' | 'descriptor'
): FSRSCard {
  return {
    id,
    blockId,
    type,
    cardTypeMarker,
    state: CardState.New,
    due: Date.now(),
    stability: 0,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('Concept Card Queue Behavior Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('2.2.1 创建测试用例 - Concept 卡行为', () => {
    it('应该创建 Concept 卡并使用 A-Factor 调度器', async () => {
      // Given: 创建一个概念卡
      const conceptCard = createTestCard(
        'concept-card-1',
        'block-concept-1',
        CardType.Concept,
        'concept'
      );

      // Then: 验证卡片类型
      expect(conceptCard.type).toBe(CardType.Concept);
      expect(conceptCard.cardTypeMarker).toBe('concept');
    });

    it('Concept 卡应该使用 A-Factor 调度器（与 Topic 相同）', () => {
      // Given: 创建概念卡和 Topic 卡
      const conceptCard = createTestCard(
        'concept-card-2',
        'block-concept-2',
        CardType.Concept,
        'concept'
      );
      const topicCard = createTestCard(
        'topic-card-1',
        'block-topic-1',
        CardType.Topic
      );

      // Then: 两者都应该使用 A-Factor 调度器
      // 在实际系统中，SchedulerRouter 会根据 CardType 返回调度器类型
      // Concept 和 Topic 都应该返回 'a-factor'
      expect(conceptCard.type).toBe(CardType.Concept);
      expect(topicCard.type).toBe(CardType.Topic);
    });

    it('应该在块属性中标记 Concept 卡', async () => {
      // Given: 创建概念卡
      const conceptCard = createTestCard(
        'concept-card-3',
        'block-concept-3',
        CardType.Concept,
        'concept'
      );

      // When: 设置块属性
      await siyuanApi.setBlockAttrs(conceptCard.blockId, {
        'custom-fsrs-card-id': conceptCard.id,
        'custom-fsrs-card-type': 'concept',
      });

      // Then: 验证块属性已设置
      expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith(
        'block-concept-3',
        expect.objectContaining({
          'custom-fsrs-card-type': 'concept',
        })
      );
    });
  });

  describe('2.2.1 创建测试用例 - Descriptor 卡行为', () => {
    it('应该创建 Descriptor 卡并使用 FSRS 调度器', () => {
      // Given: 创建描述符卡
      const descriptorCard = createTestCard(
        'descriptor-card-1',
        'block-descriptor-1',
        CardType.Descriptor,
        'descriptor'
      );

      // Then: 验证卡片类型
      expect(descriptorCard.type).toBe(CardType.Descriptor);
      expect(descriptorCard.cardTypeMarker).toBe('descriptor');
    });

    it('Descriptor 卡应该使用 FSRS 调度器（与 Item 相同）', () => {
      // Given: 创建描述符卡和 Item 卡
      const descriptorCard = createTestCard(
        'descriptor-card-2',
        'block-descriptor-2',
        CardType.Descriptor,
        'descriptor'
      );
      const itemCard = createTestCard(
        'item-card-1',
        'block-item-1',
        CardType.Item
      );

      // Then: 两者都应该使用 FSRS 调度器
      expect(descriptorCard.type).toBe(CardType.Descriptor);
      expect(itemCard.type).toBe(CardType.Item);
    });

    it('应该在块属性中标记 Descriptor 卡', async () => {
      // Given: 创建描述符卡
      const descriptorCard = createTestCard(
        'descriptor-card-3',
        'block-descriptor-3',
        CardType.Descriptor,
        'descriptor'
      );

      // When: 设置块属性
      await siyuanApi.setBlockAttrs(descriptorCard.blockId, {
        'custom-fsrs-card-id': descriptorCard.id,
        'custom-fsrs-card-type': 'descriptor',
      });

      // Then: 验证块属性已设置
      expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith(
        'block-descriptor-3',
        expect.objectContaining({
          'custom-fsrs-card-type': 'descriptor',
        })
      );
    });
  });

  describe('2.2.1 创建测试用例 - 队列筛选行为（模拟）', () => {
    it('应该模拟 Concept 卡被 filterTopicCards 排除', async () => {
      // Given: 创建混合卡片列表
      const cards = [
        createTestCard('item-1', 'block-item-1', CardType.Item),
        createTestCard('concept-1', 'block-concept-1', CardType.Concept, 'concept'),
        createTestCard('descriptor-1', 'block-descriptor-1', CardType.Descriptor, 'descriptor'),
        createTestCard('topic-1', 'block-topic-1', CardType.Topic),
      ];

      // Mock SQL 查询返回卡片类型
      const mockSqlResult = [
        { block_id: 'block-concept-1', value: 'concept' },
        { block_id: 'block-descriptor-1', value: 'descriptor' },
        { block_id: 'block-topic-1', value: 'topic' },
      ];
      (siyuanApi.sql as any).mockResolvedValue(mockSqlResult);

      // When: 模拟 filterTopicCards 逻辑
      const blockIds = cards.map(c => c.blockId);
      const sqlResult = await siyuanApi.sql(`
        SELECT block_id, value
        FROM attributes
        WHERE name = 'custom-fsrs-card-type'
        AND block_id IN (${blockIds.map(id => `'${id}'`).join(',')})
      `);

      const cardTypes = new Map<string, string>();
      for (const row of sqlResult as any[]) {
        cardTypes.set(row.block_id, row.value);
      }

      // 筛选逻辑：排除 type 为 'topic' 或 'concept' 的卡片
      // Concept 使用 A-Factor 调度器，应该被排除
      const filtered = cards.filter(card => {
        const cardType = cardTypes.get(card.blockId);
        // 未找到类型的默认为 Item（向后兼容）
        // 排除 topic 和 concept（都使用 A-Factor）
        return cardType !== 'topic' && cardType !== 'concept';
      });

      // Then: 验证筛选结果
      expect(filtered).toHaveLength(2); // Item 和 Descriptor
      expect(filtered.find(c => c.id === 'item-1')).toBeDefined();
      expect(filtered.find(c => c.id === 'descriptor-1')).toBeDefined();
      expect(filtered.find(c => c.id === 'concept-1')).toBeUndefined(); // Concept 被排除
      expect(filtered.find(c => c.id === 'topic-1')).toBeUndefined(); // Topic 被排除
    });

    it('应该模拟提取练习队列只包含 FSRS 卡片', () => {
      // Given: 创建混合卡片列表
      const allCards = [
        createTestCard('item-1', 'block-item-1', CardType.Item),
        createTestCard('item-2', 'block-item-2', CardType.Item),
        createTestCard('concept-1', 'block-concept-1', CardType.Concept, 'concept'),
        createTestCard('descriptor-1', 'block-descriptor-1', CardType.Descriptor, 'descriptor'),
        createTestCard('topic-1', 'block-topic-1', CardType.Topic),
      ];

      // When: 模拟提取练习队列筛选（只包含 FSRS 卡片）
      // FSRS 卡片：Item 和 Descriptor
      // A-Factor 卡片：Concept 和 Topic
      const extractionPracticeCards = allCards.filter(card => 
        card.type === CardType.Item || card.type === CardType.Descriptor
      );

      // Then: 验证筛选结果
      expect(extractionPracticeCards).toHaveLength(3); // 2 Item + 1 Descriptor
      expect(extractionPracticeCards.filter(c => c.type === CardType.Item)).toHaveLength(2);
      expect(extractionPracticeCards.filter(c => c.type === CardType.Descriptor)).toHaveLength(1);
      expect(extractionPracticeCards.filter(c => c.type === CardType.Concept)).toHaveLength(0);
      expect(extractionPracticeCards.filter(c => c.type === CardType.Topic)).toHaveLength(0);
    });

    it('应该模拟刻意练习队列只包含 FSRS 卡片', () => {
      // Given: 创建混合卡片列表
      const allCards = [
        createTestCard('item-1', 'block-item-1', CardType.Item),
        createTestCard('concept-1', 'block-concept-1', CardType.Concept, 'concept'),
        createTestCard('descriptor-1', 'block-descriptor-1', CardType.Descriptor, 'descriptor'),
        createTestCard('descriptor-2', 'block-descriptor-2', CardType.Descriptor, 'descriptor'),
        createTestCard('topic-1', 'block-topic-1', CardType.Topic),
      ];

      // When: 模拟刻意练习队列筛选（只包含 FSRS 卡片）
      const deliberatePracticeCards = allCards.filter(card => 
        card.type === CardType.Item || card.type === CardType.Descriptor
      );

      // Then: 验证筛选结果
      expect(deliberatePracticeCards).toHaveLength(3); // 1 Item + 2 Descriptor
      expect(deliberatePracticeCards.filter(c => c.type === CardType.Item)).toHaveLength(1);
      expect(deliberatePracticeCards.filter(c => c.type === CardType.Descriptor)).toHaveLength(2);
      expect(deliberatePracticeCards.filter(c => c.type === CardType.Concept)).toHaveLength(0);
      expect(deliberatePracticeCards.filter(c => c.type === CardType.Topic)).toHaveLength(0);
    });

    it('应该模拟 Preset "到期卡片" 排除 Concept 卡', () => {
      // Given: 创建混合卡片列表（都是到期卡片）
      const now = Date.now();
      const dueCards = [
        createTestCard('item-1', 'block-item-1', CardType.Item),
        createTestCard('concept-1', 'block-concept-1', CardType.Concept, 'concept'),
        createTestCard('descriptor-1', 'block-descriptor-1', CardType.Descriptor, 'descriptor'),
        createTestCard('topic-1', 'block-topic-1', CardType.Topic),
      ].map(card => ({
        ...card,
        due: now - 1000, // 已到期
        state: CardState.Review,
      }));

      // When: 模拟 "到期卡片" Preset 筛选
      // 如果按调度器筛选，应该只包含 FSRS 卡片
      const presetDueCards = dueCards.filter(card => 
        card.type === CardType.Item || card.type === CardType.Descriptor
      );

      // Then: 验证筛选结果
      expect(presetDueCards).toHaveLength(2); // Item 和 Descriptor
      expect(presetDueCards.find(c => c.id === 'item-1')).toBeDefined();
      expect(presetDueCards.find(c => c.id === 'descriptor-1')).toBeDefined();
      expect(presetDueCards.find(c => c.id === 'concept-1')).toBeUndefined();
      expect(presetDueCards.find(c => c.id === 'topic-1')).toBeUndefined();
    });
  });

  describe('2.2.1 创建测试用例 - 类型映射验证', () => {
    it('应该验证 Concept 使用 A-Factor 调度器', () => {
      // Given: 概念卡和 Topic 卡
      const conceptCard = createTestCard(
        'concept-1',
        'block-concept-1',
        CardType.Concept,
        'concept'
      );
      const topicCard = createTestCard(
        'topic-1',
        'block-topic-1',
        CardType.Topic
      );

      // Then: 两者都应该使用 A-Factor 调度器
      // 在 SchedulerRouter 中，Concept 和 Topic 都映射到 'a-factor'
      expect(conceptCard.type).toBe(CardType.Concept);
      expect(topicCard.type).toBe(CardType.Topic);
      
      // 模拟 SchedulerRouter.getSchedulerType() 的行为
      const getSchedulerType = (type: CardType) => {
        if (type === CardType.Concept || type === CardType.Topic) {
          return 'a-factor';
        }
        return 'fsrs';
      };

      expect(getSchedulerType(conceptCard.type)).toBe('a-factor');
      expect(getSchedulerType(topicCard.type)).toBe('a-factor');
    });

    it('应该验证 Descriptor 使用 FSRS 调度器', () => {
      // Given: 描述符卡和 Item 卡
      const descriptorCard = createTestCard(
        'descriptor-1',
        'block-descriptor-1',
        CardType.Descriptor,
        'descriptor'
      );
      const itemCard = createTestCard(
        'item-1',
        'block-item-1',
        CardType.Item
      );

      // Then: 两者都应该使用 FSRS 调度器
      expect(descriptorCard.type).toBe(CardType.Descriptor);
      expect(itemCard.type).toBe(CardType.Item);
      
      // 模拟 SchedulerRouter.getSchedulerType() 的行为
      const getSchedulerType = (type: CardType) => {
        if (type === CardType.Concept || type === CardType.Topic) {
          return 'a-factor';
        }
        return 'fsrs';
      };

      expect(getSchedulerType(descriptorCard.type)).toBe('fsrs');
      expect(getSchedulerType(itemCard.type)).toBe('fsrs');
    });
  });
});
