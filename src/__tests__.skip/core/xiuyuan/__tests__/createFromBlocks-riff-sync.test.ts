/**
 * CreateFromBlocks Riff Sync Tests
 * 
 * @description
 * 测试 createFromBlocks 方法的 Riff 同步功能。
 * 
 * **测试覆盖**：
 * - 代表块成功加入 Riff
 * - 块属性正确标记
 * - 所有 FSRSCard 共用同一个 blockId
 * - 错误处理正确（Riff 操作失败不阻断流程）
 * 
 * **验证需求**: 3.2 - 创建流程修改
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XiuyuanStorage } from '../storage';
import { XiuyuanService } from '../service';
import type { ICardTemplate } from '../types';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import * as riffAPI from '@/core/siyuan/riff';
import * as siyuanAPI from '@/core/siyuan/api';

// ============ Mock Setup ============

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
  addRiffCards: vi.fn(),
  removeRiffCards: vi.fn(),
  BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
}));

// Mock Siyuan API
vi.mock('@/core/siyuan/api', () => ({
  setBlockAttrs: vi.fn(),
  getBlockAttrs: vi.fn(),
}));

/**
 * 创建 Mock StorageManager
 */
function createMockStorageManager(): StorageManager {
  const cards = new Map<string, FSRSCard>();
  
  return {
    getCard: (id: string) => cards.get(id),
    setCard: (card: FSRSCard) => cards.set(card.id, card),
    removeCard: (id: string) => cards.delete(id),
    saveCards: async () => {},
    getAllCards: () => Array.from(cards.values()),
  } as any;
}

/**
 * 创建列表模版
 */
function createListTemplate(): ICardTemplate {
  return {
    id: 'builtin-list-item',
    name: '列表项',
    description: '列表项卡片',
    fields: [
      { name: 'question', description: '问题' },
      { name: 'answer', description: '答案' }
    ],
    cardRules: [
      {
        typeMarker: 'list-item',
        frontFields: ['question'],
        backFields: ['answer']
      }
    ]
  };
}

// ============ Tests ============

describe('createFromBlocks Riff 同步', () => {
  let storage: XiuyuanStorage;
  let storageManager: StorageManager;
  let service: XiuyuanService;

  beforeEach(() => {
    storage = new XiuyuanStorage('test-plugin');
    storageManager = createMockStorageManager();
    service = new XiuyuanService(storage, storageManager);
    
    // 注册模版
    storage.createTemplate(createListTemplate());
    
    // 清除 mock 调用记录
    vi.clearAllMocks();
  });

  it('应该将代表块加入 Riff', async () => {
    // Given: 准备块 ID 和字段映射
    const blockIDs = ['parent-block', 'child1-block', 'child2-block'];
    const templateID = 'builtin-list-item';
    const fieldMapping = { question: 'parent-block', answer: 'child1-block' };
    const deckID = riffAPI.BUILTIN_DECK_ID;

    // When: 创建 Xiuyuan
    const result = await service.createFromBlocks(blockIDs, templateID, fieldMapping, deckID);

    // Then: 应该成功
    expect(result.ok).toBe(true);
    
    // Then: 应该调用 addRiffCards，参数为代表块（第一个块）
    expect(riffAPI.addRiffCards).toHaveBeenCalledWith(deckID, ['parent-block']);
  });

  it('应该标记代表块属性', async () => {
    // Given: 准备块 ID 和字段映射
    const blockIDs = ['parent-block', 'child1-block', 'child2-block'];
    const templateID = 'builtin-list-item';
    const fieldMapping = { question: 'parent-block', answer: 'child1-block' };

    // When: 创建 Xiuyuan
    const result = await service.createFromBlocks(blockIDs, templateID, fieldMapping);

    // Then: 应该成功
    expect(result.ok).toBe(true);
    
    if (result.ok) {
      const xiuyuanID = result.value.xiuyuan.id;
      
      // Then: 应该调用 setBlockAttrs，标记 xiuyuan-id 和 template-id
      expect(siyuanAPI.setBlockAttrs).toHaveBeenCalledWith('parent-block', {
        'custom-fsrs-xiuyuan-id': xiuyuanID,
        'custom-fsrs-template-id': templateID,
      });
    }
  });

  it('所有 FSRSCard 应该共用同一个 blockId（代表块）', async () => {
    // Given: 准备块 ID 和字段映射
    const blockIDs = ['parent-block', 'child1-block', 'child2-block'];
    const templateID = 'builtin-list-item';
    const fieldMapping = { question: 'parent-block', answer: 'child1-block' };

    // When: 创建 Xiuyuan
    const result = await service.createFromBlocks(blockIDs, templateID, fieldMapping);

    // Then: 应该成功
    expect(result.ok).toBe(true);
    
    if (result.ok) {
      const xiuyuanID = result.value.xiuyuan.id;
      
      // Then: 获取所有关联的 FSRSCard
      const allCards = storageManager.getAllCards();
      const xiuyuanCards = allCards.filter(card => card.meta?.xiuyuanID === xiuyuanID);
      
      // Then: 应该至少有一张卡片
      expect(xiuyuanCards.length).toBeGreaterThan(0);
      
      // Then: 所有卡片的 blockId 应该相同，且为代表块
      const blockIds = new Set(xiuyuanCards.map(card => card.blockId));
      expect(blockIds.size).toBe(1);
      expect(blockIds.has('parent-block')).toBe(true);
    }
  });

  it('Riff 操作失败不应阻断流程', async () => {
    // Given: Mock addRiffCards 抛出错误
    vi.mocked(riffAPI.addRiffCards).mockRejectedValueOnce(new Error('Riff API Error'));
    
    const blockIDs = ['parent-block', 'child1-block', 'child2-block'];
    const templateID = 'builtin-list-item';
    const fieldMapping = { question: 'parent-block', answer: 'child1-block' };

    // When: 创建 Xiuyuan
    const result = await service.createFromBlocks(blockIDs, templateID, fieldMapping);

    // Then: 应该仍然成功（错误不阻断流程）
    expect(result.ok).toBe(true);
    
    if (result.ok) {
      // Then: Xiuyuan 应该被创建
      expect(result.value.xiuyuan).toBeDefined();
      expect(result.value.cards.length).toBeGreaterThan(0);
      
      // Then: FSRSCard 应该被创建
      const allCards = storageManager.getAllCards();
      expect(allCards.length).toBeGreaterThan(0);
    }
  });

  it('块属性标记失败不应阻断流程', async () => {
    // Given: Mock setBlockAttrs 抛出错误
    vi.mocked(siyuanAPI.setBlockAttrs).mockRejectedValueOnce(new Error('API Error'));
    
    const blockIDs = ['parent-block', 'child1-block', 'child2-block'];
    const templateID = 'builtin-list-item';
    const fieldMapping = { question: 'parent-block', answer: 'child1-block' };

    // When: 创建 Xiuyuan
    const result = await service.createFromBlocks(blockIDs, templateID, fieldMapping);

    // Then: 应该仍然成功（错误不阻断流程）
    expect(result.ok).toBe(true);
    
    if (result.ok) {
      // Then: Xiuyuan 应该被创建
      expect(result.value.xiuyuan).toBeDefined();
      expect(result.value.cards.length).toBeGreaterThan(0);
      
      // Then: FSRSCard 应该被创建
      const allCards = storageManager.getAllCards();
      expect(allCards.length).toBeGreaterThan(0);
    }
  });
});
