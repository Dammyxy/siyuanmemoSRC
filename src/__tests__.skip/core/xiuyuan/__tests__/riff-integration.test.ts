/**
 * Xiuyuan Riff Integration Tests
 * 
 * 测试 Xiuyuan 层与 Riff 解耦后的集成行为
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XiuyuanService } from '../service';
import { XiuyuanStorage } from '../storage';
import type { StorageManager } from '@/core/storage/manager';
import * as riffAPI from '@/core/siyuan/riff';

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
  addRiffCards: vi.fn().mockResolvedValue({ name: 'test', size: 1 }),
  removeRiffCards: vi.fn().mockResolvedValue({ name: 'test', size: 1 }),
  BUILTIN_DECK_ID: 'builtin-deck',
}));

// Mock block operations
vi.mock('@/core/siyuan/block', () => ({
  markBlockAsCard: vi.fn(),
}));

// Mock StorageManager
const createMockStorageManager = (): StorageManager => {
  const cards = new Map();
  return {
    setCard: vi.fn((card) => cards.set(card.id, card)),
    getCard: vi.fn((id) => cards.get(id)),
    removeCard: vi.fn((id) => cards.delete(id)),
    saveCards: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageManager;
};

describe('Xiuyuan Riff Integration', () => {
  let service: XiuyuanService;
  let storage: XiuyuanStorage;
  let storageManager: StorageManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    storage = new XiuyuanStorage('test-plugin');
    storageManager = createMockStorageManager();
    service = new XiuyuanService(storage, storageManager);
    
    await service.init();
    
    // 创建基础模板
    service.createTemplate({
      id: 'basic',
      name: 'Basic',
      fields: [
        { name: 'question', description: 'Question' },
        { name: 'answer', description: 'Answer' }
      ],
      cardRules: [
        { typeMarker: 'basic', frontFields: ['question'], backFields: ['answer'] }
      ]
    });
  });

  describe('createFromBlocks - Riff 同步失败不影响本地卡片创建', () => {
    it('应该在 Riff 同步成功时创建本地卡片和 Riff 卡片', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // Mock Riff API 成功
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      
      const result = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      // 验证：创建成功
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.xiuyuan).toBeDefined();
        expect(result.value.cards).toHaveLength(1);
        expect(result.value.cards[0].cardID).toBe('block-question');
      }
      
      // 验证：本地卡片已创建
      expect(storageManager.setCard).toHaveBeenCalled();
      expect(storageManager.saveCards).toHaveBeenCalled();
      
      // 验证：Riff API 已调用
      expect(riffAPI.addRiffCards).toHaveBeenCalledWith(deckID, ['block-question']);
    });

    it('应该在 Riff 同步失败时仍能创建本地卡片', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // Mock Riff API 失败
      vi.mocked(riffAPI.addRiffCards).mockRejectedValue(new Error('Riff API failed'));
      
      const result = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      // 验证：创建仍然成功
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.xiuyuan).toBeDefined();
        expect(result.value.cards).toHaveLength(1);
        expect(result.value.cards[0].cardID).toBe('block-question');
      }
      
      // 验证：本地卡片已创建
      expect(storageManager.setCard).toHaveBeenCalled();
      expect(storageManager.saveCards).toHaveBeenCalled();
      
      // 验证：Riff API 已尝试调用
      expect(riffAPI.addRiffCards).toHaveBeenCalledWith(deckID, ['block-question']);
    });

    it('应该在 Riff 网络错误时仍能创建本地卡片', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // Mock Riff API 网络错误
      vi.mocked(riffAPI.addRiffCards).mockRejectedValue(new Error('Network timeout'));
      
      const result = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      // 验证：创建仍然成功
      expect(result.ok).toBe(true);
      
      // 验证：本地卡片已创建
      expect(storageManager.setCard).toHaveBeenCalled();
      expect(storageManager.saveCards).toHaveBeenCalled();
    });
  });

  describe('deleteXiuyuan - Riff 删除失败不影响本地删除', () => {
    it('应该在 Riff 删除成功时删除本地和 Riff 卡片', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // 先创建 Xiuyuan
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      const createResult = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;
      
      const xiuyuanID = createResult.value.xiuyuan.id;
      
      // Mock Riff API 删除成功
      vi.mocked(riffAPI.removeRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      
      // 删除 Xiuyuan
      const deleteResult = await service.deleteXiuyuan(xiuyuanID, deckID);
      
      // 验证：删除成功
      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok) {
        expect(deleteResult.value).toBe(true);
      }
      
      // 验证：本地卡片已删除
      expect(storageManager.removeCard).toHaveBeenCalledWith('block-question');
      expect(storageManager.saveCards).toHaveBeenCalled();
      
      // 验证：Riff API 已调用
      expect(riffAPI.removeRiffCards).toHaveBeenCalledWith(deckID, ['block-question']);
      
      // 验证：Xiuyuan 已删除
      expect(service.getXiuyuan(xiuyuanID)).toBeUndefined();
    });

    it('应该在 Riff 删除失败时仍能删除本地数据', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // 先创建 Xiuyuan
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      const createResult = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;
      
      const xiuyuanID = createResult.value.xiuyuan.id;
      
      // Mock Riff API 删除失败
      vi.mocked(riffAPI.removeRiffCards).mockRejectedValue(new Error('Riff API failed'));
      
      // 删除 Xiuyuan
      const deleteResult = await service.deleteXiuyuan(xiuyuanID, deckID);
      
      // 验证：删除仍然成功
      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok) {
        expect(deleteResult.value).toBe(true);
      }
      
      // 验证：本地卡片已删除
      expect(storageManager.removeCard).toHaveBeenCalledWith('block-question');
      expect(storageManager.saveCards).toHaveBeenCalled();
      
      // 验证：Riff API 已尝试调用
      expect(riffAPI.removeRiffCards).toHaveBeenCalledWith(deckID, ['block-question']);
      
      // 验证：Xiuyuan 已删除
      expect(service.getXiuyuan(xiuyuanID)).toBeUndefined();
    });

    it('应该在没有 deckID 时跳过 Riff 删除', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // 先创建 Xiuyuan
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      const createResult = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;
      
      const xiuyuanID = createResult.value.xiuyuan.id;
      
      // 重置 mock 调用记录
      vi.mocked(riffAPI.removeRiffCards).mockClear();
      
      // 删除 Xiuyuan（不提供 deckID）
      const deleteResult = await service.deleteXiuyuan(xiuyuanID);
      
      // 验证：删除成功
      expect(deleteResult.ok).toBe(true);
      
      // 验证：本地卡片已删除
      expect(storageManager.removeCard).toHaveBeenCalledWith('block-question');
      
      // 验证：Riff API 未调用
      expect(riffAPI.removeRiffCards).not.toHaveBeenCalled();
    });
  });

  describe('CardMapping 使用本地 blockID 作为 cardID', () => {
    it('应该使用第一个块的 ID 作为 cardID', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      
      const result = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' }
      );
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      // 验证：CardMapping 使用 blockID 作为 cardID
      const mapping = result.value.cards[0];
      expect(mapping.cardID).toBe('block-question');
      
      // 验证：可以通过 cardID 查询 mapping
      const queriedMapping = service.getMappingByCardID('block-question');
      expect(queriedMapping).toBeDefined();
      expect(queriedMapping?.xiuyuanID).toBe(result.value.xiuyuan.id);
    });

    it('应该在 FSRSCard 中使用 blockID 作为 id', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      
      const result = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' }
      );
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      // 验证：FSRSCard 使用 blockID 作为 id
      expect(storageManager.setCard).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'block-question',
          blockId: 'block-question',
        })
      );
    });

    it('应该在 FSRSCard.meta 中存储 answerBlockID', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      
      const result = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' }
      );
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      // 验证：FSRSCard.meta 包含 answerBlockID
      expect(storageManager.setCard).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            xiuyuanID: result.value.xiuyuan.id,
            answerBlockID: 'block-answer',
            templateID: 'basic',
          })
        })
      );
    });
  });

  describe('执行顺序验证', () => {
    it('应该先保存本地卡片再调用 Riff API', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      const callOrder: string[] = [];
      
      vi.mocked(storageManager.saveCards).mockImplementation(async () => {
        callOrder.push('saveCards');
      });
      
      vi.mocked(riffAPI.addRiffCards).mockImplementation(async () => {
        callOrder.push('addRiffCards');
        return { name: 'test', size: 1 };
      });
      
      await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      // 验证：saveCards 在 addRiffCards 之前调用
      expect(callOrder).toEqual(['saveCards', 'addRiffCards']);
    });

    it('应该先删除本地卡片再调用 Riff 删除 API', async () => {
      const blockIDs = ['block-question', 'block-answer'];
      const deckID = 'test-deck';
      
      // 先创建
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      const createResult = await service.createFromBlocks(
        blockIDs,
        'basic',
        { question: 'block-question', answer: 'block-answer' },
        deckID
      );
      
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;
      
      const xiuyuanID = createResult.value.xiuyuan.id;
      
      const callOrder: string[] = [];
      
      vi.mocked(storageManager.saveCards).mockImplementation(async () => {
        callOrder.push('saveCards');
      });
      
      vi.mocked(riffAPI.removeRiffCards).mockImplementation(async () => {
        callOrder.push('removeRiffCards');
        return { name: 'test', size: 1 };
      });
      
      await service.deleteXiuyuan(xiuyuanID, deckID);
      
      // 验证：saveCards 在 removeRiffCards 之前调用
      expect(callOrder).toEqual(['saveCards', 'removeRiffCards']);
    });
  });
});
