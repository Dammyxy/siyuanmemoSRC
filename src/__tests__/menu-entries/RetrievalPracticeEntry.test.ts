/**
 * RetrievalPracticeEntry 单元测试
 * 
 * 测试提取练习入口的核心功能：
 * 1. 配置项正确（cardTypeFilter: 'item-only', recordReview: true, supportDueMode: true）
 * 2. 只接受 Item 类型的卡片（过滤 Topic）
 * 3. 到期模式只返回到期的卡片
 * 4. 全部模式返回所有 Item 卡片
 * 5. openReviewDialog 方法正确调用 ReviewDialogManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetrievalPracticeEntry } from '../RetrievalPracticeEntry';
import type { ReviewEntryBaseDeps } from '../ReviewEntryBase';
import type { FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';

describe('RetrievalPracticeEntry', () => {
  let entry: RetrievalPracticeEntry;
  let mockDeps: ReviewEntryBaseDeps;
  
  beforeEach(() => {
    // 创建 mock 依赖
    mockDeps = {
      storage: {
        getCardByBlockId: vi.fn(),
      } as any,
      reviewDialogManager: {
        openRetrievalPracticeWithFilter: vi.fn(),
      } as any,
      i18n: {
        drillNoCards: '当前范围内没有可练习的闪卡',
        noDueCards: '当前范围内没有到期的闪卡',
      },
    };
    
    // 创建入口实例
    entry = new RetrievalPracticeEntry(mockDeps);
    
    // 重置 mocks
    vi.clearAllMocks();
  });
  
  describe('配置项验证', () => {
    it('应该配置为 item-only 卡片类型过滤器', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.cardTypeFilter).toBe('item-only');
    });
    
    it('应该配置为记录作答（recordReview: true）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.recordReview).toBe(true);
    });
    
    it('应该支持到期/全部模式（supportDueMode: true）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.supportDueMode).toBe(true);
    });
    
    it('应该使用正确的队列类型（RetrievalPractice）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.queueType).toBe(QueueType.RetrievalPractice);
    });
    
    it('应该使用正确的显示名称和图标', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.displayName).toBe('提取练习');
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.icon).toBe('iconRiffCard');
    });
  });
  
  describe('卡片类型过滤', () => {
    it('应该接受 Item 类型的卡片', () => {
      const itemCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
      } as FSRSCard;
      
      // @ts-ignore - 访问 protected 方法进行测试
      const result = entry.filterCard(itemCard);
      
      expect(result).toBe(true);
    });
    
    it('应该过滤 Topic 类型的卡片', () => {
      const topicCard: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'topic',
        due: Date.now(),
      } as FSRSCard;
      
      // @ts-ignore - 访问 protected 方法进行测试
      const result = entry.filterCard(topicCard);
      
      expect(result).toBe(false);
    });
    
    it('应该接受没有 type 字段的卡片（默认为 Item）', () => {
      const cardWithoutType: FSRSCard = {
        id: 'card-3',
        blockId: 'block-3',
        due: Date.now(),
      } as FSRSCard;
      
      // @ts-ignore - 访问 protected 方法进行测试
      const result = entry.filterCard(cardWithoutType);
      
      expect(result).toBe(true);
    });
  });
  
  describe('卡片收集', () => {
    it('应该从块元素收集 Item 卡片', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const itemCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(itemCard);
      
      // 执行收集
      // @ts-ignore - 访问 protected 方法进行测试
      const cards = entry.collectCardsFromElements([mockElement]);
      
      // 验证结果
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('card-1');
      expect(cards[0].type).toBe('item');
    });
    
    it('应该过滤掉 Topic 卡片', () => {
      // 准备测试数据
      const mockElement1 = document.createElement('div');
      mockElement1.setAttribute('data-node-id', 'block-1');
      
      const mockElement2 = document.createElement('div');
      mockElement2.setAttribute('data-node-id', 'block-2');
      
      const itemCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
      } as FSRSCard;
      
      const topicCard: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'topic',
        due: Date.now(),
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId)
        .mockImplementation((blockId: string) => {
          if (blockId === 'block-1') return itemCard;
          if (blockId === 'block-2') return topicCard;
          return null;
        });
      
      // 执行收集
      // @ts-ignore - 访问 protected 方法进行测试
      const cards = entry.collectCardsFromElements([mockElement1, mockElement2]);
      
      // 验证结果：只有 Item 卡片被收集
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('card-1');
      expect(cards[0].type).toBe('item');
    });
    
    it('应该处理没有卡片的块', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      // 设置 mock：返回 null
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(null);
      
      // 执行收集
      // @ts-ignore - 访问 protected 方法进行测试
      const cards = entry.collectCardsFromElements([mockElement]);
      
      // 验证结果
      expect(cards).toHaveLength(0);
    });
  });
  
  describe('到期卡片计数', () => {
    it('应该正确计算到期卡片数量', () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false } as FSRSCard, // 到期
        { id: 'card-2', blockId: 'block-2', due: now + 1000, skipped: false } as FSRSCard, // 未到期
        { id: 'card-3', blockId: 'block-3', due: now - 2000, skipped: false } as FSRSCard, // 到期
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      const dueCount = entry.countDueCards(cards);
      
      expect(dueCount).toBe(2);
    });
    
    it('应该排除已跳过的卡片', () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false } as FSRSCard, // 到期
        { id: 'card-2', blockId: 'block-2', due: now - 1000, skipped: true } as FSRSCard,  // 已跳过
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      const dueCount = entry.countDueCards(cards);
      
      expect(dueCount).toBe(1);
    });
    
    it('应该排除 skipUntil 未到期的卡片', () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false, skipUntil: undefined } as FSRSCard, // 到期
        { id: 'card-2', blockId: 'block-2', due: now - 1000, skipped: false, skipUntil: now + 1000 } as FSRSCard,  // skipUntil 未到期
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      const dueCount = entry.countDueCards(cards);
      
      expect(dueCount).toBe(1);
    });
  });
  
  describe('菜单项生成', () => {
    it('应该生成两个菜单项（到期和全部）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const now = Date.now();
      const itemCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: now - 1000,
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(itemCard);
      
      // 生成菜单项
      const menuItems = entry.createMenuItems([mockElement]);
      
      // 验证结果
      expect(menuItems).toHaveLength(2);
      expect(menuItems[0].icon).toBe('iconRiffCard');
      expect(menuItems[1].icon).toBe('iconRiffCard');
    });
    
    it('应该在菜单标签中显示正确的卡片数量', () => {
      // 准备测试数据
      const mockElement1 = document.createElement('div');
      mockElement1.setAttribute('data-node-id', 'block-1');
      
      const mockElement2 = document.createElement('div');
      mockElement2.setAttribute('data-node-id', 'block-2');
      
      const now = Date.now();
      const dueCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: now - 1000,
        skipped: false,
      } as FSRSCard;
      
      const notDueCard: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'item',
        due: now + 1000,
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId)
        .mockImplementation((blockId: string) => {
          if (blockId === 'block-1') return dueCard;
          if (blockId === 'block-2') return notDueCard;
          return null;
        });
      
      // 生成菜单项
      const menuItems = entry.createMenuItems([mockElement1, mockElement2]);
      
      // 验证结果
      expect(menuItems).toHaveLength(2);
      expect(menuItems[0].label).toContain('(1/2)'); // 到期 1 张，总共 2 张
      expect(menuItems[1].label).toContain('(2)');   // 全部 2 张
    });
  });
  
  describe('openReviewDialog', () => {
    it('应该在到期模式下只传递到期的卡片', async () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false } as FSRSCard, // 到期
        { id: 'card-2', blockId: 'block-2', due: now + 1000, skipped: false } as FSRSCard, // 未到期
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'due');
      
      // 验证调用
      expect(mockDeps.reviewDialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
        blockIds: ['block-1'], // 只有到期的卡片
        dueOnly: true,
      });
    });
    
    it('应该在全部模式下传递所有卡片', async () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: now + 1000, skipped: false } as FSRSCard,
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证调用
      expect(mockDeps.reviewDialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
        blockIds: ['block-1', 'block-2'], // 所有卡片
        dueOnly: false,
      });
    });
    
    it('应该排除已跳过的卡片', async () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: now - 1000, skipped: true } as FSRSCard,  // 已跳过
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'due');
      
      // 验证调用
      expect(mockDeps.reviewDialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
        blockIds: ['block-1'], // 不包含已跳过的卡片
        dueOnly: true,
      });
    });
    
    it('应该排除 skipUntil 未到期的卡片', async () => {
      const now = Date.now();
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: now - 1000, skipped: false, skipUntil: undefined } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: now - 1000, skipped: false, skipUntil: now + 1000 } as FSRSCard,
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'due');
      
      // 验证调用
      expect(mockDeps.reviewDialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
        blockIds: ['block-1'], // 不包含 skipUntil 未到期的卡片
        dueOnly: true,
      });
    });
    
    it('应该处理空卡片列表', async () => {
      const cards: FSRSCard[] = [];
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证调用
      expect(mockDeps.reviewDialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
        blockIds: [],
        dueOnly: false,
      });
    });
  });
});
