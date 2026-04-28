/**
 * UnifiedStorageManager DTO Operations Tests
 * 
 * Tests for task 4.6: 编写 UnifiedStorageManager DTO 操作测试
 * Validates Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 * 
 * 测试范围：
 * - createCardDTO 方法
 * - getCardDTO 方法
 * - updateCardDTO 方法
 * - batchCreateCardsDTO 方法
 * - 索引更新（使用 DTO 顶层字段）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '../../xiuyuan/types';
import type { CardType } from '../../../types/card';

describe('UnifiedStorageManager DTO Operations', () => {
  let storage: UnifiedStorageManager;
  let mockSaveCallback: (data: any) => Promise<void>;
  let mockLoadCallback: () => Promise<any>;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
    
    // Mock persistence callbacks
    mockSaveCallback = async (data: any) => {};
    mockLoadCallback = async () => ({
      version: 1,
      xiuyuans: {},
      cards: {},
      cardDTOs: {},
    });
    
    storage.setPersistenceCallbacks(mockSaveCallback, mockLoadCallback);
  });

  // Helper function to create a test XiuYuan
  const createTestXiuYuan = (id: string = 'xy_test_123'): IXiuyuan => ({
    id,
    blockIDs: ['block-1'],
    templateID: 'builtin-quick-card',
    fields: [
      { name: 'content', blockID: 'block-1' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Helper function to create a test CardPersistenceDTO
  const createTestDTO = (
    id: string = 'card-1',
    xiuyuanID: string = 'xy_test_123',
    blockId: string = 'block-1'
  ): CardPersistenceDTO => ({
    id,
    blockId,
    due: Date.now() + 86400000, // 1 day from now
    stability: 1.0,
    difficulty: 5.0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: Date.now(),
    elapsedDays: 0,
    scheduledDays: 1,
    learning_step: 0,
    type: 'item' as CardType,
    priority: 50,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    
    // Xiuyuan 字段（顶层）
    xiuyuanID,
    templateID: 'builtin-quick-card',
    frontBlockIDs: [blockId],
    backBlockIDs: [],
    xiuyuanPriority: 50,
  });

  describe('createCardDTO', () => {
    /**
     * 测试 createCardDTO 方法
     * 验证：需求 4.1, 4.2
     */
    it('should create a card using DTO and update all indexes', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      const result = await storage.createCardDTO(xiuyuan, dto);

      expect(result.ok).toBe(true);
      
      // 验证 DTO 已存储
      const storedDTO = storage.getCardDTO(dto.id);
      expect(storedDTO).toBeDefined();
      expect(storedDTO?.id).toBe(dto.id);
      expect(storedDTO?.xiuyuanID).toBe(xiuyuan.id);
      
      // 验证 XiuYuan 已存储
      const storedXiuYuan = storage.getXiuYuan(xiuyuan.id);
      expect(storedXiuYuan).toBeDefined();
      expect(storedXiuYuan?.id).toBe(xiuyuan.id);
      
      // 验证索引已更新（使用 DTO 的顶层字段）
      const cardsByBlock = storage.getCardsByBlockId(dto.blockId);
      expect(cardsByBlock).toHaveLength(1);
      expect(cardsByBlock[0].id).toBe(dto.id);
      
      const cardsByXiuyuan = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cardsByXiuyuan).toHaveLength(1);
      expect(cardsByXiuyuan[0].id).toBe(dto.id);
      
      const cardsByType = storage.getCardsByType(dto.type);
      expect(cardsByType).toHaveLength(1);
      expect(cardsByType[0].id).toBe(dto.id);
    });

    /**
     * 测试向后兼容性
     * 验证：需求 5.1, 5.4
     */
    it('should maintain backward compatibility with FSRSCard interface', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      // 验证可以通过旧接口获取卡片
      const fsrsCard = storage.getCard(dto.id);
      expect(fsrsCard).toBeDefined();
      expect(fsrsCard?.id).toBe(dto.id);
      
      // 验证 meta 中包含 Xiuyuan 字段（向后兼容）
      expect(fsrsCard?.meta?.xiuyuanID).toBe(dto.xiuyuanID);
      expect(fsrsCard?.meta?.templateID).toBe(dto.templateID);
    });

    /**
     * 测试不重复创建 XiuYuan
     * 验证：需求 4.1
     */
    it('should not duplicate XiuYuan if it already exists', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto1 = createTestDTO('card-1');
      const dto2 = createTestDTO('card-2');

      await storage.createCardDTO(xiuyuan, dto1);
      await storage.createCardDTO(xiuyuan, dto2);

      const allXiuYuans = storage.getAllXiuYuans();
      expect(allXiuYuans).toHaveLength(1);
      expect(allXiuYuans[0].id).toBe(xiuyuan.id);
    });
  });

  describe('getCardDTO', () => {
    /**
     * 测试 getCardDTO 方法
     * 验证：需求 4.2
     */
    it('should return a DTO by ID', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      const retrieved = storage.getCardDTO(dto.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(dto.id);
      expect(retrieved?.xiuyuanID).toBe(xiuyuan.id);
      expect(retrieved?.blockId).toBe(dto.blockId);
    });

    /**
     * 测试不存在的卡片
     * 验证：需求 4.2
     */
    it('should return undefined for non-existent card', () => {
      const retrieved = storage.getCardDTO('non-existent');
      expect(retrieved).toBeUndefined();
    });

    /**
     * 测试 DTO 包含顶层 Xiuyuan 字段
     * 验证：需求 4.4
     */
    it('should return DTO with top-level Xiuyuan fields', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      const retrieved = storage.getCardDTO(dto.id);
      expect(retrieved?.xiuyuanID).toBe(dto.xiuyuanID);
      expect(retrieved?.templateID).toBe(dto.templateID);
      expect(retrieved?.frontBlockIDs).toEqual(dto.frontBlockIDs);
      expect(retrieved?.backBlockIDs).toEqual(dto.backBlockIDs);
    });
  });

  describe('updateCardDTO', () => {
    /**
     * 测试 updateCardDTO 方法
     * 验证：需求 4.3
     */
    it('should update a DTO and refresh indexes', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      // 更新 DTO
      const updatedDTO = { ...dto, priority: 80, due: Date.now() };
      const result = await storage.updateCardDTO(updatedDTO, {
        preferIncomingScheduling: true,
        schedulingWriteSource: 'review-commit',
      });

      expect(result.ok).toBe(true);
      
      // 验证更新
      const retrieved = storage.getCardDTO(dto.id);
      expect(retrieved?.priority).toBe(80);
      expect(retrieved?.due).toBe(updatedDTO.due);
    });

    /**
     * 测试索引更新
     * 验证：需求 4.5
     */
    it('should update indexes when DTO properties change', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO('card-1', xiuyuan.id, 'block-1');

      await storage.createCardDTO(xiuyuan, dto);

      // 更改 blockId
      const updatedDTO = { ...dto, blockId: 'block-2' };
      await storage.updateCardDTO(updatedDTO);

      // 旧 blockId 不应包含该卡片
      const oldBlockCards = storage.getCardsByBlockId('block-1');
      expect(oldBlockCards).toHaveLength(0);

      // 新 blockId 应包含该卡片
      const newBlockCards = storage.getCardsByBlockId('block-2');
      expect(newBlockCards).toHaveLength(1);
      expect(newBlockCards[0].id).toBe(dto.id);
    });

    /**
     * 测试 xiuyuanID 索引更新
     * 验证：需求 4.4, 4.5
     */
    it('should update xiuyuanID index using top-level field', async () => {
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const dto = createTestDTO('card-1', 'xy_1', 'block-1');

      await storage.createCardDTO(xiuyuan1, dto);

      // 更改 xiuyuanID
      const updatedDTO = { ...dto, xiuyuanID: 'xy_2' };
      await storage.updateCardDTO(updatedDTO);

      // 旧 xiuyuanID 不应包含该卡片
      const oldXiuyuanCards = storage.getCardsByXiuyuanId('xy_1');
      expect(oldXiuyuanCards).toHaveLength(0);

      // 新 xiuyuanID 应包含该卡片
      const newXiuyuanCards = storage.getCardsByXiuyuanId('xy_2');
      expect(newXiuyuanCards).toHaveLength(1);
      expect(newXiuyuanCards[0].id).toBe(dto.id);
    });

    /**
     * 测试不存在的卡片
     * 验证：需求 4.3
     */
    it('should return error for non-existent card', async () => {
      const dto = createTestDTO();
      const result = await storage.updateCardDTO(dto);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    /**
     * 测试向后兼容性
     * 验证：需求 5.4
     */
    it('should maintain backward compatibility when updating', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      // 更新 DTO
      const updatedDTO = { ...dto, priority: 90 };
      await storage.updateCardDTO(updatedDTO);

      // 验证 FSRSCard 也被更新
      const fsrsCard = storage.getCard(dto.id);
      expect(fsrsCard?.priority).toBe(90);
    });
  });

  describe('batchCreateCardsDTO', () => {
    /**
     * 测试批量创建 DTO
     * 验证：需求 4.3
     */
    it('should create multiple DTOs in a single operation', async () => {
      const xiuyuan = createTestXiuYuan();
      const dtos = [
        createTestDTO('card-1', xiuyuan.id, 'block-1'),
        createTestDTO('card-2', xiuyuan.id, 'block-2'),
      ];

      const result = await storage.batchCreateCardsDTO(xiuyuan, dtos);

      expect(result.ok).toBe(true);
      
      // 验证所有 DTO 已存储
      expect(storage.getCardDTO('card-1')).toBeDefined();
      expect(storage.getCardDTO('card-2')).toBeDefined();
      
      // 验证索引已更新
      const cardsByXiuyuan = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cardsByXiuyuan).toHaveLength(2);
    });

    /**
     * 测试批量操作的原子性
     * 验证：需求 4.3
     */
    it('should be atomic - rollback on error', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto1 = createTestDTO('card-1', xiuyuan.id, 'block-1');
      
      // 先创建一个卡片
      await storage.createCardDTO(xiuyuan, dto1);

      // 尝试批量创建，其中一个已存在（应该失败）
      const dtos = [
        createTestDTO('card-1', xiuyuan.id, 'block-1'), // 已存在
        createTestDTO('card-2', xiuyuan.id, 'block-2'),
      ];

      const result = await storage.batchCreateCardsDTO(xiuyuan, dtos);

      expect(result.ok).toBe(false);
      
      // 验证 card-2 没有被创建（回滚）
      expect(storage.getCardDTO('card-2')).toBeUndefined();
      
      // 验证 card-1 仍然存在
      expect(storage.getCardDTO('card-1')).toBeDefined();
    });

    /**
     * 测试批量操作的性能优化
     * 验证：需求 8.2
     */
    it('should update indexes only once for batch operations', async () => {
      const xiuyuan = createTestXiuYuan();
      const dtos = Array.from({ length: 10 }, (_, i) => 
        createTestDTO(`card-${i}`, xiuyuan.id, 'block-1')
      );

      const result = await storage.batchCreateCardsDTO(xiuyuan, dtos);

      expect(result.ok).toBe(true);
      
      const cardsByBlock = storage.getCardsByBlockId('block-1');
      expect(cardsByBlock).toHaveLength(10);
      
      const cardsByXiuyuan = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cardsByXiuyuan).toHaveLength(10);
    });

    /**
     * 测试空数组验证
     * 验证：需求 4.3
     */
    it('should return error for empty array', async () => {
      const xiuyuan = createTestXiuYuan();
      const result = await storage.batchCreateCardsDTO(xiuyuan, []);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('empty array');
      }
    });

    /**
     * 测试 xiuyuanID 不匹配验证
     * 验证：需求 4.3
     */
    it('should return error if DTO xiuyuanID does not match', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const dtos = [
        createTestDTO('card-1', 'xy_2', 'block-1'), // 不匹配
      ];

      const result = await storage.batchCreateCardsDTO(xiuyuan, dtos);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('mismatch');
      }
    });
  });

  describe('Index updates using DTO top-level fields', () => {
    /**
     * 测试索引使用 DTO 顶层字段
     * 验证：需求 4.4, 4.5
     */
    it('should use DTO top-level xiuyuanID for indexing', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      // 验证可以通过 xiuyuanID 查询（使用顶层字段）
      const cards = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(dto.id);
    });

    /**
     * 测试索引不解析 meta
     * 验证：需求 4.4, 8.3
     */
    it('should not parse meta for indexing', async () => {
      const xiuyuan = createTestXiuYuan();
      
      // 创建一个 DTO，顶层有 xiuyuanID，但 meta 中没有
      const dto = createTestDTO();
      dto.meta = { someOtherField: 'value' }; // meta 中没有 xiuyuanID

      await storage.createCardDTO(xiuyuan, dto);

      // 验证索引仍然工作（使用顶层字段）
      const cards = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(dto.id);
    });

    /**
     * 测试多个索引同时更新
     * 验证：需求 4.5
     */
    it('should update all indexes consistently', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      // 验证所有索引
      expect(storage.getCardsByBlockId(dto.blockId)).toHaveLength(1);
      expect(storage.getCardsByXiuyuanId(dto.xiuyuanID!)).toHaveLength(1);
      expect(storage.getCardsByType(dto.type)).toHaveLength(1);

      // 更新 DTO
      const updatedDTO = {
        ...dto,
        blockId: 'block-2',
        xiuyuanID: 'xy_new',
        type: 'topic' as CardType,
      };
      await storage.updateCardDTO(updatedDTO);

      // 验证旧索引已清除
      expect(storage.getCardsByBlockId(dto.blockId)).toHaveLength(0);
      expect(storage.getCardsByXiuyuanId(dto.xiuyuanID!)).toHaveLength(0);
      expect(storage.getCardsByType(dto.type)).toHaveLength(0);

      // 验证新索引已创建
      expect(storage.getCardsByBlockId('block-2')).toHaveLength(1);
      expect(storage.getCardsByXiuyuanId('xy_new')).toHaveLength(1);
      expect(storage.getCardsByType('topic')).toHaveLength(1);
    });
  });

  describe('Data consistency', () => {
    /**
     * 测试 DTO 和 FSRSCard 的一致性
     * 验证：需求 5.5, 7.1
     */
    it('should maintain consistency between DTO and FSRSCard', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      // 获取 DTO 和 FSRSCard
      const storedDTO = storage.getCardDTO(dto.id);
      const storedCard = storage.getCard(dto.id);

      // 验证核心字段一致
      expect(storedDTO?.id).toBe(storedCard?.id);
      expect(storedDTO?.blockId).toBe(storedCard?.blockId);
      expect(storedDTO?.priority).toBe(storedCard?.priority);
      expect(storedDTO?.type).toBe(storedCard?.type);
      
      // 验证 Xiuyuan 字段一致
      expect(storedDTO?.xiuyuanID).toBe(storedCard?.meta?.xiuyuanID);
      expect(storedDTO?.templateID).toBe(storedCard?.meta?.templateID);
    });

    /**
     * 测试持久化数据结构
     * 验证：需求 4.2
     */
    it('should include cardDTOs in store data', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      await storage.createCardDTO(xiuyuan, dto);

      const storeData = storage.getStoreData();

      expect(storeData.cardDTOs).toBeDefined();
      expect(storeData.cardDTOs![dto.id]).toBeDefined();
      expect(storeData.cardDTOs![dto.id].id).toBe(dto.id);
    });

    /**
     * 测试加载 cardDTOs
     * 验证：需求 4.2
     */
    it('should load cardDTOs from store data', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto = createTestDTO();

      // 模拟加载包含 cardDTOs 的数据
      mockLoadCallback = async () => ({
        version: 1,
        xiuyuans: {
          [xiuyuan.id]: xiuyuan,
        },
        cards: {},
        cardDTOs: {
          [dto.id]: dto,
        },
      });

      storage.setPersistenceCallbacks(mockSaveCallback, mockLoadCallback);
      const result = await storage.load();

      expect(result.ok).toBe(true);
      
      // 验证 DTO 已加载
      const loadedDTO = storage.getCardDTO(dto.id);
      expect(loadedDTO).toBeDefined();
      expect(loadedDTO?.id).toBe(dto.id);
    });

    it('should hydrate symbol quick-card metadata from Xiuyuan meta after reload', async () => {
      const xiuyuan = {
        ...createTestXiuYuan(),
        meta: {
          source: 'symbol',
          symbolDetected: true,
          cardSource: 'quick-symbol',
          symbolType: '>>',
        },
      };
      const dto = {
        ...createTestDTO(),
        meta: undefined,
      };

      mockLoadCallback = async () => ({
        version: 1,
        xiuyuans: {
          [xiuyuan.id]: xiuyuan,
        },
        cards: {},
        cardDTOs: {
          [dto.id]: dto,
        },
      });

      storage.setPersistenceCallbacks(mockSaveCallback, mockLoadCallback);
      const result = await storage.load();

      expect(result.ok).toBe(true);

      const card = storage.getCard(dto.id);
      expect(card?.meta?.source).toBe('symbol');
      expect(card?.meta?.symbolDetected).toBe(true);
      expect(card?.meta?.cardSource).toBe('quick-symbol');
      expect(card?.meta?.symbolType).toBe('>>');

      const cardsByBlock = storage.getCardsByBlockId(dto.blockId);
      expect(cardsByBlock).toHaveLength(1);
      expect(cardsByBlock[0].meta?.source).toBe('symbol');

      const allCards = storage.getAllCards();
      expect(allCards).toHaveLength(1);
      expect(allCards[0].meta?.cardSource).toBe('quick-symbol');
    });
  });

  describe('Statistics with DTO operations', () => {
    /**
     * 测试统计信息
     * 验证：需求 4.1, 4.2, 4.3
     */
    it('should provide accurate statistics after DTO operations', async () => {
      const xiuyuan = createTestXiuYuan();
      const dto1 = createTestDTO('card-1');
      const dto2 = createTestDTO('card-2', xiuyuan.id, 'block-2');

      await storage.createCardDTO(xiuyuan, dto1);
      await storage.createCardDTO(xiuyuan, dto2);

      const stats = storage.getStats();

      expect(stats.totalCards).toBe(2);
      expect(stats.totalXiuYuans).toBe(1);
      expect(stats.cardsByType.item).toBe(2);
      expect(stats.newCards).toBe(2); // state === 0

      // 更新一个 DTO
      const updatedDTO = { ...dto1, state: 2 as const };
      await storage.updateCardDTO(updatedDTO, {
        preferIncomingScheduling: true,
        schedulingWriteSource: 'review-commit',
      });

      const updatedStats = storage.getStats();
      expect(updatedStats.newCards).toBe(1);
      expect(updatedStats.reviewCards).toBe(1);
    });
  });
});
