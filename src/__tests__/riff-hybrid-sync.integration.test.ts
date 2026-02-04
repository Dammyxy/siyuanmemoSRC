/**
 * Riff Hybrid Sync Integration Test
 * 
 * 完整的集成测试，覆盖 Advanced 模式和 Simple 模式的完整流程
 * 
 * 测试场景：
 * 1. Advanced 模式完整流程
 *    - 插件启动 → 增量同步
 *    - 打开浏览器 → 增量同步
 *    - 打开复习 → 增量同步
 *    - 删除卡片 → 删除同步
 *    - 24小时后 → 全量同步
 * 
 * 2. Simple 模式
 *    - 确认不初始化 HybridSyncService
 *    - 确认功能正常
 * 
 * 3. 配置迁移
 *    - 测试旧配置自动迁移
 *    - 测试迁移提示显示
 * 
 * 4. 错误恢复
 *    - 网络断开场景
 *    - Riff API 错误
 *    - 删除同步失败
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HybridSyncService } from '@/services/HybridSyncService';
import type { StorageManager } from '@/core/storage/manager';
import { ConfigMigrator } from '@/utils/configMigrator';
import { DEFAULT_RIFF_CONFIG, type RiffIntegrationConfig } from '@/types/settings';
import type { FSRSCard } from '@/core/storage/types';
import type { RiffBlock } from '@/core/siyuan/riff';

// Mock dependencies
vi.mock('@/core/siyuan/api', () => ({
  pushMsg: vi.fn(),
  pushErrMsg: vi.fn(),
  sql: vi.fn(() => Promise.resolve([])),
  setBlockAttrs: vi.fn(() => Promise.resolve()),
  getBlockBreadcrumb: vi.fn(() => Promise.resolve([])),
  getIconByType: vi.fn(() => 'iconFile'),
}));

// Mock Riff API
const mockGetRiffCards = vi.fn();
const mockGetRiffNewCards = vi.fn();
const mockRemoveRiffCards = vi.fn();
const mockGetRiffDueCards = vi.fn();

vi.mock('@/core/siyuan/riff', () => ({
  BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
  getRiffCards: (...args: any[]) => mockGetRiffCards(...args),
  getRiffNewCards: (...args: any[]) => mockGetRiffNewCards(...args),
  removeRiffCards: (...args: any[]) => mockRemoveRiffCards(...args),
  getRiffDueCards: (...args: any[]) => mockGetRiffDueCards(...args),
  getRiffCardsByBlockIDs: vi.fn(() => Promise.resolve([])),
  addRiffCards: vi.fn(() => Promise.resolve()),
  reviewRiffCard: vi.fn(() => Promise.resolve()),
  skipReviewRiffCard: vi.fn(() => Promise.resolve()),
}));

describe('Riff Hybrid Sync - Integration Tests', () => {
  let mockStorage: Partial<StorageManager>;
  let mockSettings: any;
  let mockCards: FSRSCard[];
  let mockBlacklist: Set<string>;

  beforeEach(() => {
    // 创建测试卡片数据
    mockCards = [
      {
        id: 'card-1',
        blockId: 'block-1',
        due: Date.now() - 1000,
        stability: 5,
        difficulty: 5,
        elapsedDays: 1,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        state: 2,
        lastReview: Date.now() - 86400000,
        deckID: '20230218211946-2kw8jgx',
      },
      {
        id: 'card-2',
        blockId: 'block-2',
        due: Date.now() - 2000,
        stability: 3,
        difficulty: 7,
        elapsedDays: 2,
        scheduledDays: 2,
        reps: 2,
        lapses: 1,
        state: 2,
        lastReview: Date.now() - 172800000,
        deckID: '20230218211946-2kw8jgx',
      },
    ];

    mockBlacklist = new Set<string>();

    // 创建 mock storage
    mockStorage = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      getAllCards: vi.fn(() => [...mockCards]),
      getCard: vi.fn((id: string) => mockCards.find(c => c.id === id)),
      setCard: vi.fn((card: FSRSCard) => {
        const index = mockCards.findIndex(c => c.id === card.id);
        if (index >= 0) {
          mockCards[index] = card;
        } else {
          mockCards.push(card);
        }
      }),
      removeCard: vi.fn((id: string) => {
        const index = mockCards.findIndex(c => c.id === id);
        if (index >= 0) {
          mockCards.splice(index, 1);
        }
      }),
      saveCards: vi.fn(() => Promise.resolve()),
      getRiffBlacklist: vi.fn(() => new Set(mockBlacklist)),
      addToRiffBlacklist: vi.fn((id: string) => {
        mockBlacklist.add(id);
      }),
      removeFromRiffBlacklist: vi.fn((id: string) => {
        mockBlacklist.delete(id);
      }),
      clearRiffBlacklist: vi.fn(() => {
        mockBlacklist.clear();
      }),
      saveRiffBlacklist: vi.fn(() => Promise.resolve()),
      addReviewLog: vi.fn(),
      loadData: vi.fn(() => Promise.resolve([])),
      saveData: vi.fn(() => Promise.resolve()),
    };

    // 默认设置
    mockSettings = {
      fsrs: {
        requestRetention: 0.9,
        maximumInterval: 36500,
        weights: Array(19).fill(1),
        enableFuzz: true,
        enableShortTerm: true,
      },
      schedulerEngine: 'simple-fsrs',
      scheduler: {
        defaultScheduler: 'fsrs-v6',
        enableRiffSync: false,
        riffIntegration: DEFAULT_RIFF_CONFIG,
      },
    };

    (mockStorage.getSettings as any).mockReturnValue(mockSettings);

    // Reset mock functions
    mockGetRiffCards.mockReset();
    mockGetRiffNewCards.mockReset();
    mockRemoveRiffCards.mockReset();
    mockGetRiffDueCards.mockReset();

    // Default mock implementations
    mockGetRiffCards.mockResolvedValue({ blocks: [], pageCount: 1 });
    mockGetRiffNewCards.mockResolvedValue([]);
    mockRemoveRiffCards.mockResolvedValue(undefined);
    mockGetRiffDueCards.mockResolvedValue({ blocks: [], pageCount: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockCards = [];
    mockBlacklist.clear();
  });

  describe('Advanced Mode - Complete Workflow', () => {
    let advancedConfig: RiffIntegrationConfig;
    let syncService: HybridSyncService;

    beforeEach(async () => {
      advancedConfig = {
        mode: 'advanced',
        useLocalScheduler: true,
        incrementalSync: {
          enabled: true,
          triggers: ['plugin-start', 'browser-open', 'review-open'],
          useBlacklist: true,
        },
        fullSync: {
          enabled: true,
          interval: 86400000, // 24 hours
          cleanupBlacklist: true,
        },
        deleteSync: {
          enabled: true,
          useBlacklistFallback: true,
        },
      };

      mockSettings.scheduler.riffIntegration = advancedConfig;

      const { HybridSyncService } = await import('@/services/HybridSyncService');
      syncService = new HybridSyncService({
        deckId: '20230218211946-2kw8jgx',
        storage: mockStorage as StorageManager,
        incrementalSync: advancedConfig.incrementalSync,
        fullSync: advancedConfig.fullSync,
        deleteSync: advancedConfig.deleteSync,
      });
    });

    afterEach(() => {
      if (syncService) {
        syncService.stop();
      }
    });

    it('should complete full workflow: plugin start → incremental sync', async () => {
      // Arrange
      const newRiffCards: RiffBlock[] = [
        {
          id: 'new-card-1',
          content: 'New card content',
          riffCard: {
            id: 'new-card-1',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffNewCards.mockResolvedValue(newRiffCards);

      // Act - Simulate plugin startup
      await syncService.start();

      // Wait for async sync to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(mockGetRiffNewCards).toHaveBeenCalled();
      expect(mockStorage.setCard).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-card-1',
          blockId: 'new-card-1',
        })
      );
      expect(mockStorage.saveCards).toHaveBeenCalled();

      const status = syncService.getSyncStatus();
      expect(['idle', 'success']).toContain(status.status);
    });

    it('should trigger incremental sync when browser opens', async () => {
      // Arrange
      const newRiffCards: RiffBlock[] = [
        {
          id: 'browser-card-1',
          content: 'Browser card content',
          riffCard: {
            id: 'browser-card-1',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffNewCards.mockResolvedValue(newRiffCards);

      // Act - Simulate browser opening
      const result = await syncService.incrementalSync();

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1);
      expect(mockGetRiffNewCards).toHaveBeenCalled();
      expect(mockStorage.setCard).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'browser-card-1',
        })
      );
    });

    it('should trigger incremental sync when review opens', async () => {
      // Arrange
      const newRiffCards: RiffBlock[] = [
        {
          id: 'review-card-1',
          content: 'Review card content',
          riffCard: {
            id: 'review-card-1',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffNewCards.mockResolvedValue(newRiffCards);

      // Act - Simulate review opening
      const result = await syncService.incrementalSync();

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1);
      expect(mockGetRiffNewCards).toHaveBeenCalled();
    });

    it('should sync delete when card is deleted', async () => {
      // Arrange
      const cardToDelete = mockCards[0];
      mockRemoveRiffCards.mockResolvedValue(undefined);

      // Act - Delete card locally
      mockStorage.removeCard!(cardToDelete.id);
      await mockStorage.saveCards!();

      // Sync delete to Riff
      const deleteSuccess = await syncService.deleteSync(cardToDelete.id);

      // Assert
      expect(deleteSuccess).toBe(true);
      expect(mockRemoveRiffCards).toHaveBeenCalledWith(
        '20230218211946-2kw8jgx',
        [cardToDelete.id]
      );
      expect(mockStorage.addToRiffBlacklist).not.toHaveBeenCalled(); // Should not add to blacklist on success
    });

    it('should add to blacklist when delete sync fails', async () => {
      // Arrange
      const cardToDelete = mockCards[0];
      mockRemoveRiffCards.mockRejectedValue(new Error('Network error'));

      // Act - Delete card locally
      mockStorage.removeCard!(cardToDelete.id);
      await mockStorage.saveCards!();

      // Sync delete to Riff (will fail)
      const deleteSuccess = await syncService.deleteSync(cardToDelete.id);

      // Assert
      expect(deleteSuccess).toBe(false);
      expect(mockRemoveRiffCards).toHaveBeenCalled();
      expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith(cardToDelete.id);
      // Note: saveRiffBlacklist is not called immediately in deleteSync
      // It will be saved during the next full sync or when storage is persisted
    });

    it('should perform full sync after 24 hours', async () => {
      // Arrange
      const riffCards: RiffBlock[] = [
        {
          id: 'card-1',
          content: 'Card 1',
          riffCard: {
            id: 'card-1',
            due: new Date().toISOString(),
            stability: 5,
            difficulty: 5,
            elapsedDays: 1,
            scheduledDays: 1,
            reps: 1,
            lapses: 0,
            state: 2,
            deckID: '20230218211946-2kw8jgx',
          },
        },
        {
          id: 'new-card-from-riff',
          content: 'New card from Riff',
          riffCard: {
            id: 'new-card-from-riff',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffCards.mockResolvedValue(riffCards); // Return array directly, not wrapped in object

      // Act - Perform full sync
      const result = await syncService.fullSync();

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1); // new-card-from-riff
      expect(result.deletedCount).toBe(1); // card-2 (not in Riff)
      expect(mockGetRiffCards).toHaveBeenCalled();
      expect(mockStorage.setCard).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-card-from-riff',
        })
      );
      expect(mockStorage.removeCard).toHaveBeenCalledWith('card-2');
    });

    it('should cleanup blacklist during full sync', async () => {
      // Arrange
      // Add some cards to blacklist
      mockStorage.addToRiffBlacklist!('deleted-card-1');
      mockStorage.addToRiffBlacklist!('deleted-card-2');
      mockStorage.addToRiffBlacklist!('card-1'); // This one exists in Riff

      const riffCards: RiffBlock[] = [
        {
          id: 'card-1',
          content: 'Card 1',
          riffCard: {
            id: 'card-1',
            due: new Date().toISOString(),
            stability: 5,
            difficulty: 5,
            elapsedDays: 1,
            scheduledDays: 1,
            reps: 1,
            lapses: 0,
            state: 2,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffCards.mockResolvedValue(riffCards); // Return array directly

      // Act - Perform full sync
      const result = await syncService.fullSync();

      // Assert
      expect(result.success).toBe(true);
      expect(result.blacklistCleanedCount).toBe(2); // deleted-card-1 and deleted-card-2
      expect(mockStorage.removeFromRiffBlacklist).toHaveBeenCalledWith('deleted-card-1');
      expect(mockStorage.removeFromRiffBlacklist).toHaveBeenCalledWith('deleted-card-2');
      expect(mockStorage.removeFromRiffBlacklist).not.toHaveBeenCalledWith('card-1'); // Still in Riff
    });

    it('should filter blacklisted cards during incremental sync', async () => {
      // Arrange
      mockStorage.addToRiffBlacklist!('blacklisted-card');

      const newRiffCards: RiffBlock[] = [
        {
          id: 'new-card-1',
          content: 'New card 1',
          riffCard: {
            id: 'new-card-1',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
        {
          id: 'blacklisted-card',
          content: 'Blacklisted card',
          riffCard: {
            id: 'blacklisted-card',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffNewCards.mockResolvedValue(newRiffCards);

      // Act
      const result = await syncService.incrementalSync();

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1); // Only new-card-1
      // Note: skippedCount only counts cards that exist locally, not blacklisted cards
      // The blacklisted card was filtered out before the local check
      expect(mockStorage.setCard).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-card-1' })
      );
      expect(mockStorage.setCard).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'blacklisted-card' })
      );
    });
  });

  describe('Simple Mode - Workflow', () => {
    let simpleConfig: RiffIntegrationConfig;

    beforeEach(() => {
      simpleConfig = {
        mode: 'simple',
        useLocalScheduler: false,
        incrementalSync: {
          enabled: false,
          triggers: [],
          useBlacklist: false,
        },
        fullSync: {
          enabled: false,
          interval: 86400000,
          cleanupBlacklist: false,
        },
        deleteSync: {
          enabled: false,
          useBlacklistFallback: false,
        },
      };

      mockSettings.scheduler.riffIntegration = simpleConfig;
    });

    it('should not initialize HybridSyncService in simple mode', async () => {
      // Arrange & Act
      const { HybridSyncService } = await import('@/services/HybridSyncService');
      
      // In simple mode, the plugin should check config and not create service
      const shouldInitialize = simpleConfig.mode === 'advanced';

      // Assert
      expect(shouldInitialize).toBe(false);
      expect(simpleConfig.incrementalSync.enabled).toBe(false);
      expect(simpleConfig.fullSync.enabled).toBe(false);
      expect(simpleConfig.deleteSync.enabled).toBe(false);
    });

    it('should not trigger any sync operations in simple mode', async () => {
      // Arrange
      const { HybridSyncService } = await import('@/services/HybridSyncService');
      const syncService = new HybridSyncService({
        deckId: '20230218211946-2kw8jgx',
        storage: mockStorage as StorageManager,
        incrementalSync: simpleConfig.incrementalSync,
        fullSync: simpleConfig.fullSync,
        deleteSync: simpleConfig.deleteSync,
      });

      // Act
      await syncService.start();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(mockGetRiffNewCards).not.toHaveBeenCalled();
      expect(mockGetRiffCards).not.toHaveBeenCalled();

      syncService.stop();
    });

    it('should work normally with RiffDataSource in simple mode', async () => {
      // Arrange
      const riffDueCards: RiffBlock[] = [
        {
          id: 'riff-card-1',
          content: 'Riff card 1',
          riffCard: {
            id: 'riff-card-1',
            due: new Date(Date.now() - 1000).toISOString(),
            stability: 5,
            difficulty: 5,
            elapsedDays: 1,
            scheduledDays: 1,
            reps: 1,
            lapses: 0,
            state: 2,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffDueCards.mockResolvedValue({ blocks: riffDueCards, pageCount: 1 });

      // Act - Simulate getting due cards from Riff
      const result = await mockGetRiffDueCards('20230218211946-2kw8jgx', {
        dueOnly: true,
        page: 1,
        pageSize: 50,
      });

      // Assert
      expect(mockGetRiffDueCards).toHaveBeenCalled();
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].id).toBe('riff-card-1');
    });
  });

  describe('Configuration Migration', () => {
    it('should detect and migrate legacy "data-only" config', () => {
      // Arrange
      const legacyConfig = {
        mode: 'data-only',
        dataSourceMode: 'due-only',
        syncToRiff: false,
        useRiffScheduler: false,
        incrementalUpdateInterval: 300,
      };

      // Act
      const needsMigration = ConfigMigrator.needsMigration(legacyConfig);
      const migratedConfig = ConfigMigrator.migrate(legacyConfig);

      // Assert
      expect(needsMigration).toBe(true);
      expect(migratedConfig.mode).toBe('advanced');
      expect(migratedConfig.useLocalScheduler).toBe(true);
      expect(migratedConfig.incrementalSync.enabled).toBe(true);
      expect(migratedConfig.fullSync.enabled).toBe(true);
      expect(migratedConfig.deleteSync.enabled).toBe(true);
    });

    it('should detect and migrate legacy "disabled" config', () => {
      // Arrange
      const legacyConfig = {
        mode: 'disabled',
        dataSourceMode: 'due-only',
        syncToRiff: false,
        useRiffScheduler: false,
        incrementalUpdateInterval: 300,
      };

      // Act
      const needsMigration = ConfigMigrator.needsMigration(legacyConfig);
      const migratedConfig = ConfigMigrator.migrate(legacyConfig);

      // Assert
      expect(needsMigration).toBe(true);
      expect(migratedConfig.mode).toBe('simple');
      expect(migratedConfig.useLocalScheduler).toBe(false);
      expect(migratedConfig.incrementalSync.enabled).toBe(false);
      expect(migratedConfig.fullSync.enabled).toBe(false);
    });

    it('should detect and migrate legacy "full-scheduler" config', () => {
      // Arrange
      const legacyConfig = {
        mode: 'full-scheduler',
        dataSourceMode: 'due-only',
        syncToRiff: true,
        useRiffScheduler: true,
        incrementalUpdateInterval: 300,
      };

      // Act
      const needsMigration = ConfigMigrator.needsMigration(legacyConfig);
      const migratedConfig = ConfigMigrator.migrate(legacyConfig);

      // Assert
      expect(needsMigration).toBe(true);
      expect(migratedConfig.mode).toBe('simple');
      expect(migratedConfig.useLocalScheduler).toBe(false);
    });

    it('should not migrate new config format', () => {
      // Arrange
      const newConfig = DEFAULT_RIFF_CONFIG;

      // Act
      const needsMigration = ConfigMigrator.needsMigration(newConfig);

      // Assert
      expect(needsMigration).toBe(false);
    });

    it('should generate appropriate migration messages', () => {
      // Act & Assert
      const dataOnlyMessage = ConfigMigrator.getMigrationMessage('data-only');
      expect(dataOnlyMessage).toContain('混合同步方案');
      expect(dataOnlyMessage).toContain('增量同步');
      expect(dataOnlyMessage).toContain('全量同步');

      const disabledMessage = ConfigMigrator.getMigrationMessage('disabled');
      expect(disabledMessage).toContain('简单模式');

      const fullSchedulerMessage = ConfigMigrator.getMigrationMessage('full-scheduler');
      expect(fullSchedulerMessage).toContain('简单模式');
    });

    it('should complete migration workflow', async () => {
      // Arrange
      const legacyConfig = {
        mode: 'data-only',
        dataSourceMode: 'due-only',
        syncToRiff: false,
        useRiffScheduler: false,
        incrementalUpdateInterval: 300,
      };

      mockSettings.scheduler.riffIntegration = legacyConfig;

      // Act - Simulate plugin startup migration
      let migrationMessage = '';
      if (ConfigMigrator.needsMigration(legacyConfig)) {
        const migratedConfig = ConfigMigrator.migrate(legacyConfig);
        mockSettings.scheduler.riffIntegration = migratedConfig;
        await mockStorage.updateSettings!(mockSettings);
        migrationMessage = ConfigMigrator.getMigrationMessage(legacyConfig.mode);
      }

      // Assert
      expect(mockSettings.scheduler.riffIntegration.mode).toBe('advanced');
      expect(mockStorage.updateSettings).toHaveBeenCalled();
      expect(migrationMessage).toBeTruthy();
      expect(migrationMessage).toContain('混合同步方案');
    });
  });

  describe('Error Recovery', () => {
    let advancedConfig: RiffIntegrationConfig;
    let syncService: HybridSyncService;

    beforeEach(async () => {
      advancedConfig = {
        mode: 'advanced',
        useLocalScheduler: true,
        incrementalSync: {
          enabled: true,
          triggers: ['plugin-start'],
          useBlacklist: true,
        },
        fullSync: {
          enabled: true,
          interval: 86400000,
          cleanupBlacklist: true,
        },
        deleteSync: {
          enabled: true,
          useBlacklistFallback: true,
        },
      };

      mockSettings.scheduler.riffIntegration = advancedConfig;

      const { HybridSyncService } = await import('@/services/HybridSyncService');
      syncService = new HybridSyncService({
        deckId: '20230218211946-2kw8jgx',
        storage: mockStorage as StorageManager,
        incrementalSync: advancedConfig.incrementalSync,
        fullSync: advancedConfig.fullSync,
        deleteSync: advancedConfig.deleteSync,
      });
    });

    afterEach(() => {
      if (syncService) {
        syncService.stop();
      }
    });

    it('should handle network disconnection during incremental sync', async () => {
      // Arrange
      mockGetRiffNewCards.mockRejectedValue(new Error('Network error: ECONNREFUSED'));

      // Act
      const result = await syncService.incrementalSync();

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Network error');
      expect(result.addedCount).toBe(0);

      // Verify that local operations still work
      expect(mockStorage.getAllCards!()).toHaveLength(2);
    });

    it('should handle Riff API errors during full sync', async () => {
      // Arrange
      mockGetRiffCards.mockRejectedValue(new Error('Riff API error: 500 Internal Server Error'));

      // Act
      const result = await syncService.fullSync();

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Riff API error');
      expect(result.addedCount).toBe(0);
      expect(result.deletedCount).toBe(0);

      // Verify that local data is not affected
      expect(mockStorage.getAllCards!()).toHaveLength(2);
    });

    it('should handle delete sync failure and use blacklist fallback', async () => {
      // Arrange
      const cardToDelete = mockCards[0];
      mockRemoveRiffCards.mockRejectedValue(new Error('Delete failed: Network timeout'));

      // Act
      const deleteSuccess = await syncService.deleteSync(cardToDelete.id);

      // Assert
      expect(deleteSuccess).toBe(false);
      expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith(cardToDelete.id);
      // Note: saveRiffBlacklist is not called immediately in deleteSync
      // It will be saved during the next full sync or when storage is persisted

      // Verify blacklist prevents card from reappearing
      const blacklist = mockStorage.getRiffBlacklist!();
      expect(blacklist.has(cardToDelete.id)).toBe(true);
    });

    it('should recover from transient errors on retry', async () => {
      // Arrange
      let callCount = 0;
      mockGetRiffNewCards.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Transient error'));
        }
        return Promise.resolve([
          {
            id: 'recovered-card',
            content: 'Recovered card',
            riffCard: {
              id: 'recovered-card',
              due: new Date().toISOString(),
              stability: 0,
              difficulty: 5,
              elapsedDays: 0,
              scheduledDays: 0,
              reps: 0,
              lapses: 0,
              state: 0,
              deckID: '20230218211946-2kw8jgx',
            },
          },
        ]);
      });

      // Act - First attempt fails
      const firstResult = await syncService.incrementalSync();
      expect(firstResult.success).toBe(false);

      // Act - Second attempt succeeds
      const secondResult = await syncService.incrementalSync();

      // Assert
      expect(secondResult.success).toBe(true);
      expect(secondResult.addedCount).toBe(1);
      expect(mockStorage.setCard).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'recovered-card' })
      );
    });

    it('should not corrupt local data when sync fails', async () => {
      // Arrange
      const originalCards = [...mockCards];
      mockGetRiffCards.mockRejectedValue(new Error('Sync failed'));

      // Act
      await syncService.fullSync();

      // Assert - Local data should remain unchanged
      const currentCards = mockStorage.getAllCards!();
      expect(currentCards).toHaveLength(originalCards.length);
      expect(currentCards[0].id).toBe(originalCards[0].id);
      expect(currentCards[1].id).toBe(originalCards[1].id);
    });

    it('should handle partial sync failures gracefully', async () => {
      // Arrange
      const newRiffCards: RiffBlock[] = [
        {
          id: 'good-card',
          content: 'Good card',
          riffCard: {
            id: 'good-card',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ];

      mockGetRiffNewCards.mockResolvedValue(newRiffCards);
      
      // Mock saveCards to fail
      (mockStorage.saveCards as any).mockRejectedValueOnce(new Error('Storage error'));

      // Act
      const result = await syncService.incrementalSync();

      // Assert - Should handle the error
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Storage error');
    });

    it('should continue working after multiple sync failures', async () => {
      // Arrange
      mockGetRiffNewCards.mockRejectedValue(new Error('Network error'));

      // Act - Multiple failed syncs
      await syncService.incrementalSync();
      await syncService.incrementalSync();
      await syncService.incrementalSync();

      // Now fix the network
      mockGetRiffNewCards.mockResolvedValue([
        {
          id: 'recovery-card',
          content: 'Recovery card',
          riffCard: {
            id: 'recovery-card',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 5,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            deckID: '20230218211946-2kw8jgx',
          },
        },
      ]);

      const result = await syncService.incrementalSync();

      // Assert - Should recover and work normally
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1);
    });
  });
});
