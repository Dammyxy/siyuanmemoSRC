/**
 * CardTypeMarkerService 单元测试
 * 
 * 测试卡片类型标记服务的核心功能：
 * - 设置和获取卡片类型标记
 * - 类型映射规则
 * - 批量操作
 * - 缓存机制
 * - 错误处理
 * 
 * @see .kiro/specs/card-type-system-enhancement/design.md 第 2.1 节
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardTypeMarkerService } from '../CardTypeMarkerService';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types/card';
import { CardType, CardState } from '@/types/card';
import * as siyuanApi from '@/core/siyuan/api';

// Mock 思源 API
vi.mock('@/core/siyuan/api', () => ({
  setBlockAttrs: vi.fn().mockResolvedValue(undefined),
}));

/**
 * 创建测试用的 Mock StorageManager
 */
function createMockStorage(): StorageManager {
  const cards = new Map<string, FSRSCard>();

  return {
    getCard: vi.fn((id: string) => cards.get(id)),
    setCard: vi.fn((card: FSRSCard) => {
      cards.set(card.id, card);
    }),
    saveCards: vi.fn().mockResolvedValue(undefined),
    getAllCards: vi.fn(() => Array.from(cards.values())),
    // 添加其他必要的方法
  } as any;
}

/**
 * 创建测试用的默认卡片
 */
function createTestCard(id: string, blockId: string): FSRSCard {
  return {
    id,
    blockId,
    type: CardType.Item,
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

describe('CardTypeMarkerService', () => {
  let service: CardTypeMarkerService;
  let storage: StorageManager;

  beforeEach(() => {
    storage = createMockStorage();
    service = new CardTypeMarkerService(storage);
    vi.clearAllMocks();
  });

  describe('setCardTypeMarker', () => {
    it('应该正确设置概念卡标记', async () => {
      const card = createTestCard('card-1', 'block-1');
      storage.setCard(card);

      await service.setCardTypeMarker('card-1', 'concept');

      const updatedCard = storage.getCard('card-1');
      expect(updatedCard?.cardTypeMarker).toBe('concept');
      expect(updatedCard?.type).toBe(CardType.Concept);
      expect(storage.saveCards).toHaveBeenCalledOnce();
    });

    it('应该正确设置描述符卡标记', async () => {
      const card = createTestCard('card-2', 'block-2');
      storage.setCard(card);

      await service.setCardTypeMarker('card-2', 'descriptor');

      const updatedCard = storage.getCard('card-2');
      expect(updatedCard?.cardTypeMarker).toBe('descriptor');
      expect(updatedCard?.type).toBe(CardType.Descriptor);
      expect(storage.saveCards).toHaveBeenCalledOnce();
    });

    it('应该同步块属性', async () => {
      const card = createTestCard('card-3', 'block-3');
      storage.setCard(card);

      await service.setCardTypeMarker('card-3', 'concept');

      expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith('block-3', {
        'custom-fsrs-card-type': 'concept',
      });
    });

    it('应该为概念卡种子同步神经漫游标记', async () => {
      const card = createTestCard('card-4', 'block-4');
      card.neuralRoamSeed = true;
      storage.setCard(card);

      await service.setCardTypeMarker('card-4', 'concept');

      expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith('block-4', {
        'custom-fsrs-card-type': 'concept',
        'custom-fsrs-neural-seed': 'true',
      });
    });

    it('应该更新缓存', async () => {
      const card = createTestCard('card-5', 'block-5');
      storage.setCard(card);

      await service.setCardTypeMarker('card-5', 'concept');

      // 第二次调用应该从缓存读取
      const marker = service.getCardTypeMarker('card-5');
      expect(marker).toBe('concept');
      expect(storage.getCard).toHaveBeenCalledTimes(1); // 只在 setCardTypeMarker 时调用一次
    });

    it('应该在卡片不存在时抛出错误', async () => {
      await expect(
        service.setCardTypeMarker('non-existent', 'concept')
      ).rejects.toThrow('Card not found: non-existent');
    });
  });

  describe('getCardTypeMarker', () => {
    it('应该返回已设置的类型标记', async () => {
      const card = createTestCard('card-6', 'block-6');
      card.cardTypeMarker = 'concept';
      storage.setCard(card);

      const marker = service.getCardTypeMarker('card-6');
      expect(marker).toBe('concept');
    });

    it('应该返回 undefined 对于未设置标记的卡片', () => {
      const card = createTestCard('card-7', 'block-7');
      storage.setCard(card);

      const marker = service.getCardTypeMarker('card-7');
      expect(marker).toBeUndefined();
    });

    it('应该返回 undefined 对于不存在的卡片', () => {
      const marker = service.getCardTypeMarker('non-existent');
      expect(marker).toBeUndefined();
    });

    it('应该使用缓存', async () => {
      const card = createTestCard('card-8', 'block-8');
      storage.setCard(card);

      await service.setCardTypeMarker('card-8', 'descriptor');

      // 清除 mock 调用记录
      vi.clearAllMocks();

      // 第二次调用应该从缓存读取
      const marker1 = service.getCardTypeMarker('card-8');
      const marker2 = service.getCardTypeMarker('card-8');

      expect(marker1).toBe('descriptor');
      expect(marker2).toBe('descriptor');
      expect(storage.getCard).not.toHaveBeenCalled(); // 应该从缓存读取
    });
  });

  describe('inferTechnicalType', () => {
    it('应该将概念卡映射到 Concept 类型', () => {
      const type = service.inferTechnicalType('concept');
      expect(type).toBe(CardType.Concept);
    });

    it('应该将描述符卡映射到 Descriptor 类型', () => {
      const type = service.inferTechnicalType('descriptor');
      expect(type).toBe(CardType.Descriptor);
    });
  });

  describe('batchSetMarker', () => {
    it('应该批量设置多个卡片的类型标记', async () => {
      const card1 = createTestCard('card-9', 'block-9');
      const card2 = createTestCard('card-10', 'block-10');
      const card3 = createTestCard('card-11', 'block-11');
      storage.setCard(card1);
      storage.setCard(card2);
      storage.setCard(card3);

      await service.batchSetMarker(['card-9', 'card-10', 'card-11'], 'concept');

      expect(storage.getCard('card-9')?.cardTypeMarker).toBe('concept');
      expect(storage.getCard('card-9')?.type).toBe(CardType.Concept);
      expect(storage.getCard('card-10')?.cardTypeMarker).toBe('concept');
      expect(storage.getCard('card-10')?.type).toBe(CardType.Concept);
      expect(storage.getCard('card-11')?.cardTypeMarker).toBe('concept');
      expect(storage.getCard('card-11')?.type).toBe(CardType.Concept);
      expect(storage.saveCards).toHaveBeenCalledOnce();
    });

    it('应该批量同步块属性', async () => {
      const card1 = createTestCard('card-12', 'block-12');
      const card2 = createTestCard('card-13', 'block-13');
      storage.setCard(card1);
      storage.setCard(card2);

      await service.batchSetMarker(['card-12', 'card-13'], 'descriptor');

      expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith('block-12', {
        'custom-fsrs-card-type': 'descriptor',
      });
      expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith('block-13', {
        'custom-fsrs-card-type': 'descriptor',
      });
    });

    it('应该跳过不存在的卡片并继续处理其他卡片', async () => {
      const card1 = createTestCard('card-14', 'block-14');
      storage.setCard(card1);

      await service.batchSetMarker(['card-14', 'non-existent', 'card-15'], 'concept');

      expect(storage.getCard('card-14')?.cardTypeMarker).toBe('concept');
      expect(storage.saveCards).toHaveBeenCalledOnce();
    });

    it('应该批量更新缓存', async () => {
      const card1 = createTestCard('card-16', 'block-16');
      const card2 = createTestCard('card-17', 'block-17');
      storage.setCard(card1);
      storage.setCard(card2);

      await service.batchSetMarker(['card-16', 'card-17'], 'concept');

      // 清除 mock 调用记录
      vi.clearAllMocks();

      // 应该从缓存读取
      expect(service.getCardTypeMarker('card-16')).toBe('concept');
      expect(service.getCardTypeMarker('card-17')).toBe('concept');
      expect(storage.getCard).not.toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    it('应该清除缓存', async () => {
      const card = createTestCard('card-18', 'block-18');
      storage.setCard(card);

      await service.setCardTypeMarker('card-18', 'concept');

      // 清除缓存
      service.clearCache();

      // 清除 mock 调用记录
      vi.clearAllMocks();

      // 应该重新从存储读取
      const marker = service.getCardTypeMarker('card-18');
      expect(marker).toBe('concept');
      expect(storage.getCard).toHaveBeenCalledOnce();
    });
  });

  describe('validateTypeMapping', () => {
    it('应该验证概念卡和 Concept 类型的映射为有效', () => {
      const card = createTestCard('card-19', 'block-19');
      card.cardTypeMarker = 'concept';
      card.type = CardType.Concept;

      expect(service.validateTypeMapping(card)).toBe(true);
    });

    it('应该验证描述符卡和 Descriptor 类型的映射为有效', () => {
      const card = createTestCard('card-20', 'block-20');
      card.cardTypeMarker = 'descriptor';
      card.type = CardType.Descriptor;

      expect(service.validateTypeMapping(card)).toBe(true);
    });

    it('应该验证概念卡和 Item 类型的映射为无效', () => {
      const card = createTestCard('card-21', 'block-21');
      card.cardTypeMarker = 'concept';
      card.type = CardType.Item; // 错误的类型

      expect(service.validateTypeMapping(card)).toBe(false);
    });

    it('应该验证描述符卡和 Topic 类型的映射为无效', () => {
      const card = createTestCard('card-22', 'block-22');
      card.cardTypeMarker = 'descriptor';
      card.type = CardType.Topic; // 错误的类型

      expect(service.validateTypeMapping(card)).toBe(false);
    });

    it('应该对没有标记的卡片返回 true', () => {
      const card = createTestCard('card-23', 'block-23');
      // 没有设置 cardTypeMarker

      expect(service.validateTypeMapping(card)).toBe(true);
    });
  });

  describe('fixInconsistentCards', () => {
    it('应该修复类型映射不一致的卡片', async () => {
      const card1 = createTestCard('card-24', 'block-24');
      card1.cardTypeMarker = 'concept';
      card1.type = CardType.Item; // 错误的类型

      const card2 = createTestCard('card-25', 'block-25');
      card2.cardTypeMarker = 'descriptor';
      card2.type = CardType.Topic; // 错误的类型

      storage.setCard(card1);
      storage.setCard(card2);

      const fixedCount = await service.fixInconsistentCards();

      expect(fixedCount).toBe(2);
      expect(storage.getCard('card-24')?.type).toBe(CardType.Concept);
      expect(storage.getCard('card-25')?.type).toBe(CardType.Descriptor);
      expect(storage.saveCards).toHaveBeenCalledOnce();
    });

    it('应该跳过一致的卡片', async () => {
      const card1 = createTestCard('card-26', 'block-26');
      card1.cardTypeMarker = 'concept';
      card1.type = CardType.Concept; // 正确的类型

      const card2 = createTestCard('card-27', 'block-27');
      card2.cardTypeMarker = 'descriptor';
      card2.type = CardType.Descriptor; // 正确的类型

      storage.setCard(card1);
      storage.setCard(card2);

      const fixedCount = await service.fixInconsistentCards();

      expect(fixedCount).toBe(0);
      expect(storage.saveCards).not.toHaveBeenCalled();
    });

    it('应该跳过没有标记的卡片', async () => {
      const card = createTestCard('card-28', 'block-28');
      // 没有设置 cardTypeMarker
      storage.setCard(card);

      const fixedCount = await service.fixInconsistentCards();

      expect(fixedCount).toBe(0);
      expect(storage.saveCards).not.toHaveBeenCalled();
    });
  });

  describe('缓存机制', () => {
    it('应该在设置标记后缓存结果', async () => {
      const card = createTestCard('card-29', 'block-29');
      storage.setCard(card);

      await service.setCardTypeMarker('card-29', 'concept');

      // 清除 mock 调用记录
      vi.clearAllMocks();

      // 多次获取应该只从缓存读取
      service.getCardTypeMarker('card-29');
      service.getCardTypeMarker('card-29');
      service.getCardTypeMarker('card-29');

      expect(storage.getCard).not.toHaveBeenCalled();
    });

    it('应该在批量设置后缓存所有结果', async () => {
      const card1 = createTestCard('card-30', 'block-30');
      const card2 = createTestCard('card-31', 'block-31');
      storage.setCard(card1);
      storage.setCard(card2);

      await service.batchSetMarker(['card-30', 'card-31'], 'descriptor');

      // 清除 mock 调用记录
      vi.clearAllMocks();

      // 获取应该从缓存读取
      service.getCardTypeMarker('card-30');
      service.getCardTypeMarker('card-31');

      expect(storage.getCard).not.toHaveBeenCalled();
    });

    it('应该在首次获取时缓存结果', () => {
      const card = createTestCard('card-32', 'block-32');
      card.cardTypeMarker = 'concept';
      storage.setCard(card);

      // 首次获取
      service.getCardTypeMarker('card-32');

      // 清除 mock 调用记录
      vi.clearAllMocks();

      // 第二次获取应该从缓存读取
      const marker = service.getCardTypeMarker('card-32');

      expect(marker).toBe('concept');
      expect(storage.getCard).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该在卡片不存在时抛出明确的错误', async () => {
      await expect(
        service.setCardTypeMarker('non-existent', 'concept')
      ).rejects.toThrow('Card not found: non-existent');
    });

    it('应该在批量操作中记录警告但继续处理', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const card = createTestCard('card-33', 'block-33');
      storage.setCard(card);

      await service.batchSetMarker(['card-33', 'non-existent'], 'concept');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Card not found: non-existent')
      );
      expect(storage.getCard('card-33')?.cardTypeMarker).toBe('concept');

      consoleSpy.mockRestore();
    });
  });
});
