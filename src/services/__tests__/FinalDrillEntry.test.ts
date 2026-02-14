/**
 * FinalDrillEntry 单元测试
 * 
 * 测试刻意练习入口的核心功能：
 * 1. 配置项正确（cardTypeFilter: 'all', recordReview: false, supportDueMode: false）
 * 2. 接受所有类型的卡片（Item + Topic）
 * 3. 只支持"全部"模式（不支持"到期"模式）
 * 4. openReviewDialog 方法正确操作 FinalDrill 队列
 * 5. 进度保存和恢复功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinalDrillEntry } from '../FinalDrillEntry';
import type { ReviewEntryBaseDeps } from '../ReviewEntryBase';
import type { FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';

// Mock pushMsg API
vi.mock('@/core/siyuan/api', () => ({
  pushMsg: vi.fn().mockResolvedValue(undefined),
}));

describe('FinalDrillEntry', () => {
  let entry: FinalDrillEntry;
  let mockDeps: ReviewEntryBaseDeps;
  let mockQueue: any;
  
  beforeEach(() => {
    // 创建 mock 队列
    mockQueue = {
      getCards: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      addCard: vi.fn().mockResolvedValue(undefined),
    };
    
    // 创建 mock 依赖
    mockDeps = {
      storage: {
        getCardByBlockId: vi.fn(),
      } as any,
      reviewDialogManager: {
        deps: {
          plugin: {
            unifiedDataSourceManager: {
              getQueue: vi.fn().mockReturnValue(mockQueue),
            },
          },
        },
        openFinalDrill: vi.fn().mockResolvedValue(undefined),
      } as any,
      i18n: {
        drillNoCards: '当前范围内没有可练习的闪卡',
      },
    };
    
    // 创建入口实例
    entry = new FinalDrillEntry(mockDeps);
    
    // 重置 mocks
    vi.clearAllMocks();
  });
  
  describe('配置项验证', () => {
    it('应该配置为接受所有类型的卡片（cardTypeFilter: all）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.cardTypeFilter).toBe('all');
    });
    
    it('应该配置为不记录作答（recordReview: false）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.recordReview).toBe(false);
    });
    
    it('应该配置为不支持到期模式（supportDueMode: false）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.supportDueMode).toBe(false);
    });
    
    it('应该使用正确的队列类型（FinalDrill）', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.queueType).toBe(QueueType.FinalDrill);
    });
    
    it('应该使用正确的显示名称和图标', () => {
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.displayName).toBe('刻意练习');
      // @ts-ignore - 访问 protected 属性进行测试
      expect(entry.config.icon).toBe('iconCards');
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
    
    it('应该接受 Topic 类型的卡片', () => {
      const topicCard: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'topic',
        due: Date.now(),
      } as FSRSCard;
      
      // @ts-ignore - 访问 protected 方法进行测试
      const result = entry.filterCard(topicCard);
      
      expect(result).toBe(true);
    });
    
    it('应该接受没有 type 字段的卡片', () => {
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
    it('应该从块元素收集所有类型的卡片', () => {
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
      
      // 验证结果：Item 和 Topic 都被收集
      expect(cards).toHaveLength(2);
      expect(cards[0].id).toBe('card-1');
      expect(cards[0].type).toBe('item');
      expect(cards[1].id).toBe('card-2');
      expect(cards[1].type).toBe('topic');
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
  
  describe('菜单项生成', () => {
    it('应该只生成一个菜单项（全部模式）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const itemCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(itemCard);
      
      // 生成菜单项
      const menuItems = entry.createMenuItems([mockElement]);
      
      // 验证结果：只有一个菜单项（不支持到期模式）
      expect(menuItems).toHaveLength(1);
      expect(menuItems[0].icon).toBe('iconCards');
    });
    
    it('应该在菜单标签中显示总卡片数量', () => {
      // 准备测试数据
      const mockElement1 = document.createElement('div');
      mockElement1.setAttribute('data-node-id', 'block-1');
      
      const mockElement2 = document.createElement('div');
      mockElement2.setAttribute('data-node-id', 'block-2');
      
      const now = Date.now();
      const card1: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: now - 1000,
        skipped: false,
      } as FSRSCard;
      
      const card2: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'topic',
        due: now + 1000,
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId)
        .mockImplementation((blockId: string) => {
          if (blockId === 'block-1') return card1;
          if (blockId === 'block-2') return card2;
          return null;
        });
      
      // 生成菜单项
      const menuItems = entry.createMenuItems([mockElement1, mockElement2]);
      
      // 验证结果：显示总数（不区分到期/未到期）
      expect(menuItems).toHaveLength(1);
      expect(menuItems[0].label).toContain('(2)'); // 全部 2 张
    });
  });
  
  describe('openReviewDialog - 基本功能', () => {
    it('应该在没有卡片时显示提示消息', async () => {
      const cards: FSRSCard[] = [];
      const { pushMsg } = await import('@/core/siyuan/api');
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证显示提示消息
      expect(pushMsg).toHaveBeenCalledWith('当前范围内没有可练习的闪卡');
      
      // 验证不会调用队列操作
      expect(mockQueue.getCards).not.toHaveBeenCalled();
      expect(mockQueue.clear).not.toHaveBeenCalled();
      expect(mockQueue.addCard).not.toHaveBeenCalled();
    });
    
    it('应该获取 FinalDrill 队列', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
      ];
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证调用
      expect(mockDeps.reviewDialogManager.deps.plugin.unifiedDataSourceManager.getQueue)
        .toHaveBeenCalledWith(QueueType.FinalDrill);
    });
  });
  
  describe('openReviewDialog - 无进度场景', () => {
    it('应该清空队列并添加所有卡片', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列为空（无进度）
      mockQueue.getCards.mockResolvedValue([]);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证队列操作
      expect(mockQueue.getCards).toHaveBeenCalled();
      expect(mockQueue.clear).toHaveBeenCalled();
      expect(mockQueue.addCard).toHaveBeenCalledTimes(2);
      expect(mockQueue.addCard).toHaveBeenCalledWith('card-1', 'manual');
      expect(mockQueue.addCard).toHaveBeenCalledWith('card-2', 'manual');
    });
    
    it('应该打开 FinalDrill 对话框', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列为空（无进度）
      mockQueue.getCards.mockResolvedValue([]);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证对话框打开
      expect(mockDeps.reviewDialogManager.openFinalDrill).toHaveBeenCalled();
    });
  });
  
  describe('openReviewDialog - 有进度场景', () => {
    it('应该检测到已有进度', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列有卡片（有进度）
      mockQueue.getCards.mockResolvedValue([
        { id: 'card-1', blockId: 'block-1' },
      ]);
      
      // Mock showProgressDialog 返回 true（继续）
      const showProgressDialogSpy = vi.spyOn(entry as any, 'showProgressDialog')
        .mockResolvedValue(true);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证显示进度对话框
      expect(showProgressDialogSpy).toHaveBeenCalledWith(1, 2); // 已完成 1 张，总共 2 张
    });
    
    it('应该在用户选择"继续"时直接打开对话框', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列有卡片（有进度）
      mockQueue.getCards.mockResolvedValue([
        { id: 'card-1', blockId: 'block-1' },
      ]);
      
      // Mock showProgressDialog 返回 true（继续）
      vi.spyOn(entry as any, 'showProgressDialog').mockResolvedValue(true);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证不清空队列，不添加卡片
      expect(mockQueue.clear).not.toHaveBeenCalled();
      expect(mockQueue.addCard).not.toHaveBeenCalled();
      
      // 验证直接打开对话框
      expect(mockDeps.reviewDialogManager.openFinalDrill).toHaveBeenCalled();
    });
    
    it('应该在用户选择"从头开始"时清空队列并重新添加卡片', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列有卡片（有进度）
      mockQueue.getCards.mockResolvedValue([
        { id: 'card-1', blockId: 'block-1' },
      ]);
      
      // Mock showProgressDialog 返回 false（从头开始）
      vi.spyOn(entry as any, 'showProgressDialog').mockResolvedValue(false);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证清空队列
      expect(mockQueue.clear).toHaveBeenCalled();
      
      // 验证重新添加所有卡片
      expect(mockQueue.addCard).toHaveBeenCalledTimes(2);
      expect(mockQueue.addCard).toHaveBeenCalledWith('card-1', 'manual');
      expect(mockQueue.addCard).toHaveBeenCalledWith('card-2', 'manual');
      
      // 验证打开对话框
      expect(mockDeps.reviewDialogManager.openFinalDrill).toHaveBeenCalled();
    });
  });
  
  describe('openReviewDialog - 错误处理', () => {
    it('应该处理 UnifiedDataSourceManager 不存在的情况', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
      ];
      const { pushMsg } = await import('@/core/siyuan/api');
      
      // Mock manager 不存在
      mockDeps.reviewDialogManager = {
        deps: null,
      } as any;
      
      // 重新创建入口实例
      entry = new FinalDrillEntry(mockDeps);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证显示错误消息
      expect(pushMsg).toHaveBeenCalledWith('无法打开刻意练习');
      
      // 验证不会抛出错误（静默失败）
      expect(mockQueue.getCards).not.toHaveBeenCalled();
    });
    
    it('应该处理队列不存在的情况', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
      ];
      const { pushMsg } = await import('@/core/siyuan/api');
      
      // Mock 队列不存在
      mockDeps.reviewDialogManager.deps.plugin.unifiedDataSourceManager.getQueue
        .mockReturnValue(null);
      
      // 重新创建入口实例
      entry = new FinalDrillEntry(mockDeps);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证显示错误消息
      expect(pushMsg).toHaveBeenCalledWith('无法打开刻意练习队列');
      
      // 验证不会抛出错误（静默失败）
      expect(mockQueue.clear).not.toHaveBeenCalled();
    });
    
    it('应该处理队列操作失败的情况', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
      ];
      const { pushMsg } = await import('@/core/siyuan/api');
      
      // Mock 队列操作失败
      mockQueue.getCards.mockRejectedValue(new Error('Queue error'));
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证显示错误消息
      expect(pushMsg).toHaveBeenCalledWith('打开刻意练习失败');
      
      // 验证不会抛出错误（静默失败）
      expect(mockDeps.reviewDialogManager.openFinalDrill).not.toHaveBeenCalled();
    });
  });
  
  describe('进度保存和恢复', () => {
    it('应该根据队列中的卡片数量计算已完成数量', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
        { id: 'card-2', blockId: 'block-2', due: Date.now() } as FSRSCard,
        { id: 'card-3', blockId: 'block-3', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列有 1 张卡片（已完成 2 张）
      mockQueue.getCards.mockResolvedValue([
        { id: 'card-3', blockId: 'block-3' },
      ]);
      
      // Mock showProgressDialog
      const showProgressDialogSpy = vi.spyOn(entry as any, 'showProgressDialog')
        .mockResolvedValue(true);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证计算正确：总共 3 张，队列剩余 1 张，已完成 2 张
      expect(showProgressDialogSpy).toHaveBeenCalledWith(2, 3);
    });
    
    it('应该在队列为空时不显示进度对话框', async () => {
      const cards: FSRSCard[] = [
        { id: 'card-1', blockId: 'block-1', due: Date.now() } as FSRSCard,
      ];
      
      // Mock 队列为空
      mockQueue.getCards.mockResolvedValue([]);
      
      // Mock showProgressDialog
      const showProgressDialogSpy = vi.spyOn(entry as any, 'showProgressDialog')
        .mockResolvedValue(true);
      
      // @ts-ignore - 访问 protected 方法进行测试
      await entry.openReviewDialog(cards, 'all');
      
      // 验证不显示进度对话框
      expect(showProgressDialogSpy).not.toHaveBeenCalled();
    });
  });
});
