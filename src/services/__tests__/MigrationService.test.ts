/**
 * MigrationService 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MigrationService } from '../MigrationService';
import type { XiuyuanService } from '@/core/xiuyuan/service';
import type { StorageManager } from '@/core/storage/manager';
import { CardType } from '@/types';
import * as riffAPI from '@/core/siyuan/riff';
import * as siyuanAPI from '@/core/siyuan/api';

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
  getRiffCardsByBlockIDs: vi.fn(),
  addRiffCards: vi.fn(),
  BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
}));

// Mock SiYuan API
vi.mock('@/core/siyuan/api', () => ({
  setBlockAttrs: vi.fn(),
}));

describe('MigrationService', () => {
  let migrationService: MigrationService;
  let mockXiuyuanService: XiuyuanService;
  let mockStorageManager: StorageManager;

  beforeEach(() => {
    // 创建 mock 对象
    mockXiuyuanService = {
      getAllXiuyuans: vi.fn(),
      getMappingsByXiuyuanID: vi.fn(),
    } as any;

    mockStorageManager = {
      getCard: vi.fn(),
      setCard: vi.fn(),
      saveCards: vi.fn(),
    } as any;

    migrationService = new MigrationService(mockXiuyuanService, mockStorageManager);

    // 重置所有 mock
    vi.clearAllMocks();
  });

  describe('migrateExistingXiuyuanCards', () => {
    it('应该迁移未在 Riff 中的 Xiuyuan 卡片', async () => {
      // 准备测试数据
      const xiuyuan = {
        id: 'xiuyuan-001',
        blockIDs: ['block-1', 'block-2', 'block-3'],
        templateID: 'builtin-list-item',
        fields: [
          { name: 'question', blockID: 'block-1', marker: 'question' },
          { name: 'answer', blockID: 'block-2', marker: 'answer' },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mappings = [
        { 
          cardID: 'xiuyuan-001-0', 
          xiuyuanID: 'xiuyuan-001', 
          ruleIndex: 0,
          frontFields: [],
          backFields: [],
        },
        { 
          cardID: 'xiuyuan-001-1', 
          xiuyuanID: 'xiuyuan-001', 
          ruleIndex: 1,
          frontFields: [],
          backFields: [],
        },
      ];

      const cards = [
        { 
          id: 'xiuyuan-001-0', 
          blockId: 'old-block-id', 
          due: Date.now(),
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          state: 0,
          lastReview: Date.now(),
          elapsedDays: 0,
          scheduledDays: 0,
          priority: 50,
          type: CardType.Item,
          tags: [],
          leechCount: 0,
          isLeech: false,
          skipped: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          suspended: false,
          deckId: '',
          cardType: 'normal' as const,
          meta: { xiuyuanID: 'xiuyuan-001' },
        },
        { 
          id: 'xiuyuan-001-1', 
          blockId: 'old-block-id',
          due: Date.now(),
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          state: 0,
          lastReview: Date.now(),
          elapsedDays: 0,
          scheduledDays: 0,
          priority: 50,
          type: CardType.Item,
          tags: [],
          leechCount: 0,
          isLeech: false,
          skipped: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          suspended: false,
          deckId: '',
          cardType: 'normal' as const,
          meta: { xiuyuanID: 'xiuyuan-001' },
        },
      ];

      // 设置 mock 返回值
      vi.mocked(mockXiuyuanService.getAllXiuyuans).mockReturnValue([xiuyuan]);
      vi.mocked(mockXiuyuanService.getMappingsByXiuyuanID).mockReturnValue(mappings);
      vi.mocked(mockStorageManager.getCard)
        .mockReturnValueOnce(cards[0])
        .mockReturnValueOnce(cards[1]);
      vi.mocked(riffAPI.getRiffCardsByBlockIDs).mockResolvedValue([]);
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      vi.mocked(siyuanAPI.setBlockAttrs).mockResolvedValue(undefined);
      vi.mocked(mockStorageManager.saveCards).mockResolvedValue(undefined);

      // 执行迁移
      const result = await migrationService.migrateExistingXiuyuanCards();

      // 验证结果
      expect(result.total).toBe(1);
      expect(result.migrated).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // 验证调用
      expect(riffAPI.getRiffCardsByBlockIDs).toHaveBeenCalledWith(['block-1']);
      expect(riffAPI.addRiffCards).toHaveBeenCalledWith(
        riffAPI.BUILTIN_DECK_ID,
        ['block-1']
      );
      expect(siyuanAPI.setBlockAttrs).toHaveBeenCalledWith('block-1', {
        'custom-fsrs-xiuyuan-id': 'xiuyuan-001',
        'custom-fsrs-template-id': 'builtin-list-item',
      });
      expect(mockStorageManager.setCard).toHaveBeenCalledTimes(2);
      expect(mockStorageManager.saveCards).toHaveBeenCalled();

      // 验证 blockId 已更新
      expect(cards[0].blockId).toBe('block-1');
      expect(cards[1].blockId).toBe('block-1');
    });

    it('应该跳过已在 Riff 中的 Xiuyuan 卡片', async () => {
      // 准备测试数据
      const xiuyuan = {
        id: 'xiuyuan-002',
        blockIDs: ['block-4', 'block-5'],
        templateID: 'builtin-list-item',
        fields: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 设置 mock 返回值（已在 Riff 中）
      vi.mocked(mockXiuyuanService.getAllXiuyuans).mockReturnValue([xiuyuan]);
      vi.mocked(riffAPI.getRiffCardsByBlockIDs).mockResolvedValue([
        { id: 'block-4' } as any,
      ]);

      // 执行迁移
      const result = await migrationService.migrateExistingXiuyuanCards();

      // 验证结果
      expect(result.total).toBe(1);
      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(0);

      // 验证没有调用添加操作
      expect(riffAPI.addRiffCards).not.toHaveBeenCalled();
      expect(siyuanAPI.setBlockAttrs).not.toHaveBeenCalled();
      expect(mockStorageManager.saveCards).not.toHaveBeenCalled();
    });

    it('应该处理迁移失败的情况', async () => {
      // 准备测试数据
      const xiuyuan = {
        id: 'xiuyuan-003',
        blockIDs: ['block-6'],
        templateID: 'builtin-list-item',
        fields: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 设置 mock 返回值（添加到 Riff 失败）
      vi.mocked(mockXiuyuanService.getAllXiuyuans).mockReturnValue([xiuyuan]);
      vi.mocked(riffAPI.getRiffCardsByBlockIDs).mockResolvedValue([]);
      vi.mocked(riffAPI.addRiffCards).mockRejectedValue(new Error('Riff API error'));

      // 执行迁移
      const result = await migrationService.migrateExistingXiuyuanCards();

      // 验证结果
      expect(result.total).toBe(1);
      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        xiuyuanID: 'xiuyuan-003',
        error: 'Riff API error',
      });

      // 验证没有保存
      expect(mockStorageManager.saveCards).not.toHaveBeenCalled();
    });

    it('应该为不同模版类型选择正确的代表块', async () => {
      // 测试 builtin-concept-descriptor 模版
      const xiuyuan = {
        id: 'xiuyuan-004',
        blockIDs: ['block-7', 'block-8'],
        templateID: 'builtin-concept-descriptor',
        fields: [
          { name: 'concept', blockID: 'block-7', marker: 'concept' },
          { name: 'descriptor', blockID: 'block-8', marker: 'descriptor' },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(mockXiuyuanService.getAllXiuyuans).mockReturnValue([xiuyuan]);
      vi.mocked(mockXiuyuanService.getMappingsByXiuyuanID).mockReturnValue([]);
      vi.mocked(riffAPI.getRiffCardsByBlockIDs).mockResolvedValue([]);
      vi.mocked(riffAPI.addRiffCards).mockResolvedValue({ name: 'test', size: 1 });
      vi.mocked(siyuanAPI.setBlockAttrs).mockResolvedValue(undefined);

      // 执行迁移
      await migrationService.migrateExistingXiuyuanCards();

      // 验证选择了 descriptor 块
      expect(riffAPI.getRiffCardsByBlockIDs).toHaveBeenCalledWith(['block-8']);
      expect(riffAPI.addRiffCards).toHaveBeenCalledWith(
        riffAPI.BUILTIN_DECK_ID,
        ['block-8']
      );
    });

    it('应该处理空 Xiuyuan 列表', async () => {
      // 设置 mock 返回值（空列表）
      vi.mocked(mockXiuyuanService.getAllXiuyuans).mockReturnValue([]);

      // 执行迁移
      const result = await migrationService.migrateExistingXiuyuanCards();

      // 验证结果
      expect(result.total).toBe(0);
      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('应该处理部分成功的情况', async () => {
      // 准备测试数据（两个 Xiuyuan，一个成功一个失败）
      const xiuyuans = [
        {
          id: 'xiuyuan-005',
          blockIDs: ['block-9'],
          templateID: 'builtin-list-item',
          fields: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'xiuyuan-006',
          blockIDs: ['block-10'],
          templateID: 'builtin-list-item',
          fields: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      vi.mocked(mockXiuyuanService.getAllXiuyuans).mockReturnValue(xiuyuans);
      vi.mocked(mockXiuyuanService.getMappingsByXiuyuanID).mockReturnValue([]);
      vi.mocked(riffAPI.getRiffCardsByBlockIDs).mockResolvedValue([]);
      
      // 第一个成功，第二个失败
      vi.mocked(riffAPI.addRiffCards)
        .mockResolvedValueOnce({ name: 'test', size: 1 })
        .mockRejectedValueOnce(new Error('Second failed'));
      
      vi.mocked(siyuanAPI.setBlockAttrs).mockResolvedValue(undefined);
      vi.mocked(mockStorageManager.saveCards).mockResolvedValue(undefined);

      // 执行迁移
      const result = await migrationService.migrateExistingXiuyuanCards();

      // 验证结果
      expect(result.total).toBe(2);
      expect(result.migrated).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].xiuyuanID).toBe('xiuyuan-006');

      // 验证仍然保存了成功的部分
      expect(mockStorageManager.saveCards).toHaveBeenCalled();
    });
  });
});
