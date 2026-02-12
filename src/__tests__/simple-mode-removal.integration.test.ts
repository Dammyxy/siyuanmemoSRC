/**
 * Simple Mode Removal Integration Tests
 * 
 * 测试移除简单模式后的插件初始化、配置迁移和数据访问
 * 
 * @see .kiro/specs/remove-simple-mode/requirements.md
 * @see .kiro/specs/remove-simple-mode/design.md
 * @see .kiro/specs/remove-simple-mode/tasks.md - Task 12
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { AdvancedDataRouter } from '@/routers/AdvancedDataRouter';
import { SimpleModeRemovalMigrator } from '@/utils/simpleModeRemovalMigrator';
import { QueueType } from '@/types/unified-data-source';
import type { StorageManager } from '@/core/storage/manager';
import type { RiffIntegrationConfig } from '@/types/settings';
import { DEFAULT_RIFF_CONFIG } from '@/types/settings';

// Mock dependencies
vi.mock('@/core/siyuan/api', () => ({
  pushMsg: vi.fn(),
  pushErrMsg: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/core/siyuan/riff', () => ({
  BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
  getRiffCards: vi.fn(() => Promise.resolve([])),
  getRiffNewCards: vi.fn(() => Promise.resolve([])),
  removeRiffCards: vi.fn(() => Promise.resolve()),
  batchSetRiffCardsDueTime: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/core/siyuan/block', () => ({
  getBlockText: vi.fn(() => Promise.resolve('Mock block content')),
}));

describe('Simple Mode Removal Integration Tests', () => {
  let mockStorage: Partial<StorageManager>;
  let manager: UnifiedDataSourceManager;

  beforeEach(() => {
    // Reset singleton instance before each test
    UnifiedDataSourceManager.resetInstance();
    manager = UnifiedDataSourceManager.getInstance();

    // Create mock storage
    mockStorage = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      getAllCards: vi.fn(() => []),
      getCard: vi.fn(),
      setCard: vi.fn(),
      removeCard: vi.fn(),
      saveCards: vi.fn(() => Promise.resolve()),
      getRiffBlacklist: vi.fn(() => new Set()),
      addToRiffBlacklist: vi.fn(),
      removeFromRiffBlacklist: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    UnifiedDataSourceManager.resetInstance();
  });

  describe('Task 12.1: 测试插件初始化（无现有配置）', () => {
    it('should initialize with AdvancedDataRouter only', () => {
      // Arrange
      const advancedRouter = new AdvancedDataRouter(mockStorage as StorageManager);

      // Act
      manager.setAdvancedRouter(advancedRouter);
      const router = manager.getRouter();

      // Assert
      expect(router).toBe(advancedRouter);
      expect(router).toBeInstanceOf(AdvancedDataRouter);
    });

    it('should throw error if router not initialized', () => {
      // Act & Assert
      expect(() => manager.getRouter()).toThrow('AdvancedDataRouter not initialized');
    });

    it('should provide all 5 advanced mode queue types', () => {
      // Arrange
      const advancedRouter = new AdvancedDataRouter(mockStorage as StorageManager);
      manager.setAdvancedRouter(advancedRouter);

      // Act
      const queueTypes = manager.getAvailableQueueTypes();

      // Assert
      expect(queueTypes).toHaveLength(5);
      expect(queueTypes).toContain(QueueType.RetrievalPractice);
      expect(queueTypes).toContain(QueueType.FinalDrill);
      expect(queueTypes).toContain(QueueType.IncrementalLearning);
      expect(queueTypes).toContain(QueueType.FilterGroup);
      expect(queueTypes).toContain(QueueType.NeuralRoam);
    });

    it('should create all queue types successfully', () => {
      // Arrange
      const advancedRouter = new AdvancedDataRouter(mockStorage as StorageManager);
      manager.setAdvancedRouter(advancedRouter);

      // Act & Assert - Create each queue type
      const retrievalQueue = manager.getQueue(QueueType.RetrievalPractice);
      expect(retrievalQueue).toBeDefined();

      const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);
      expect(finalDrillQueue).toBeDefined();

      const incrementalQueue = manager.getQueue(QueueType.IncrementalLearning);
      expect(incrementalQueue).toBeDefined();

      const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
      expect(filterGroupQueue).toBeDefined();

      const neuralRoamQueue = manager.getQueue(QueueType.NeuralRoam);
      expect(neuralRoamQueue).toBeDefined();
    });
  });

  describe('Task 12.2: 测试配置迁移（简单模式配置）', () => {
    it('should detect simple mode configuration', () => {
      // Arrange
      const simpleConfig: RiffIntegrationConfig = {
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

      // Act
      const needsMigration = SimpleModeRemovalMigrator.needsMigration(simpleConfig);

      // Assert
      expect(needsMigration).toBe(true);
    });

    it('should migrate simple mode config to advanced mode', () => {
      // Arrange
      const simpleConfig: RiffIntegrationConfig = {
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

      // Act
      const migratedConfig = SimpleModeRemovalMigrator.migrate(simpleConfig);

      // Assert
      expect(migratedConfig).not.toHaveProperty('mode');
      expect(migratedConfig.useLocalScheduler).toBe(true);
      expect(migratedConfig.incrementalSync.enabled).toBe(true);
      expect(migratedConfig.incrementalSync.triggers).toContain('plugin-start');
    });

    it('should show migration notification', async () => {
      // Arrange
      const { pushMsg } = await import('@/core/siyuan/api');
      const pushMsgSpy = vi.mocked(pushMsg);

      // Act
      await SimpleModeRemovalMigrator.showMigrationNotification(true);

      // Assert
      expect(pushMsgSpy).toHaveBeenCalled();
      const callArgs = pushMsgSpy.mock.calls[0];
      expect(callArgs[0]).toContain('数据源模式已自动升级');
      expect(callArgs[0]).toContain('高级模式');
    });

    it('should trigger incremental sync during migration', async () => {
      // Arrange
      const mockSyncService = {
        incrementalSync: vi.fn(() => Promise.resolve({ success: true, syncedCount: 10 })),
      };

      // Act
      const result = await SimpleModeRemovalMigrator.triggerMigrationSync(mockSyncService);

      // Assert
      expect(result).toBe(true);
      expect(mockSyncService.incrementalSync).toHaveBeenCalled();
    });

    it('should handle sync failure gracefully', async () => {
      // Arrange
      const mockSyncService = {
        incrementalSync: vi.fn(() => Promise.resolve({ success: false, error: 'Network error' })),
      };
      const { pushErrMsg } = await import('@/core/siyuan/api');
      const pushErrMsgSpy = vi.mocked(pushErrMsg);

      // Act
      const result = await SimpleModeRemovalMigrator.triggerMigrationSync(mockSyncService);

      // Assert
      expect(result).toBe(false);
      expect(mockSyncService.incrementalSync).toHaveBeenCalled();
    });

    it('should perform complete migration workflow', async () => {
      // Arrange
      const simpleConfig: RiffIntegrationConfig = {
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

      const mockSyncService = {
        incrementalSync: vi.fn(() => Promise.resolve({ success: true, syncedCount: 5 })),
      };

      // Act
      const result = await SimpleModeRemovalMigrator.performMigration(simpleConfig, mockSyncService);

      // Assert
      expect(result.success).toBe(true);
      expect(result.syncTriggered).toBe(true);
      expect(result.migratedConfig).not.toHaveProperty('mode');
      expect(result.migratedConfig.useLocalScheduler).toBe(true);
      expect(mockSyncService.incrementalSync).toHaveBeenCalled();
    });
  });

  describe('Task 12.3: 测试配置迁移（高级模式配置）', () => {
    it('should not detect migration need for advanced mode', () => {
      // Arrange
      const advancedConfig: RiffIntegrationConfig = {
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

      // Act
      const needsMigration = SimpleModeRemovalMigrator.needsMigration(advancedConfig);

      // Assert
      expect(needsMigration).toBe(false);
    });

    it('should remove mode field from advanced config', async () => {
      // Arrange
      const advancedConfig: RiffIntegrationConfig = {
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

      // Act
      const result = await SimpleModeRemovalMigrator.performMigration(advancedConfig);

      // Assert
      expect(result.migratedConfig).not.toHaveProperty('mode');
      expect(result.success).toBe(true);
      expect(result.syncTriggered).toBe(false); // No sync needed for advanced mode
    });

    it('should preserve all other config fields', async () => {
      // Arrange
      const advancedConfig: RiffIntegrationConfig = {
        mode: 'advanced',
        useLocalScheduler: true,
        incrementalSync: {
          enabled: true,
          triggers: ['plugin-start', 'browser-open'],
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

      // Act
      const result = await SimpleModeRemovalMigrator.performMigration(advancedConfig);

      // Assert
      expect(result.migratedConfig.useLocalScheduler).toBe(true);
      expect(result.migratedConfig.incrementalSync.enabled).toBe(true);
      expect(result.migratedConfig.incrementalSync.triggers).toEqual(['plugin-start', 'browser-open']);
      expect(result.migratedConfig.fullSync.enabled).toBe(true);
      expect(result.migratedConfig.deleteSync.enabled).toBe(true);
    });
  });

  describe('Task 12.4: 测试数据访问', () => {
    let advancedRouter: AdvancedDataRouter;

    beforeEach(() => {
      advancedRouter = new AdvancedDataRouter(mockStorage as StorageManager);
      manager.setAdvancedRouter(advancedRouter);
    });

    it('should get single card successfully', async () => {
      // Arrange
      const mockCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'topic',
        state: 0,
        due: Date.now(),
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (mockStorage.getCard as any).mockReturnValue(mockCard);

      // Act
      const card = await manager.getCard('card-1');

      // Assert
      expect(card).toBeDefined();
      expect(card.id).toBe('card-1');
      expect(mockStorage.getCard).toHaveBeenCalledWith('card-1');
    });

    it('should get cards list successfully', async () => {
      // Arrange
      const mockCards = [
        {
          id: 'card-1',
          blockId: 'block-1',
          type: 'topic',
          state: 0,
          due: Date.now(),
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          state: 2,
          due: Date.now(),
          stability: 10,
          difficulty: 3,
          reps: 5,
          lapses: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      (mockStorage.getAllCards as any).mockReturnValue(mockCards);

      // Act
      const cards = await manager.getCards();

      // Assert
      expect(cards).toHaveLength(2);
      expect(mockStorage.getAllCards).toHaveBeenCalled();
    });

    it('should update card successfully', async () => {
      // Arrange
      const mockCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'topic',
        state: 2,
        due: Date.now() + 86400000,
        stability: 5,
        difficulty: 4,
        reps: 1,
        lapses: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Act
      await manager.updateCard(mockCard);

      // Assert
      expect(mockStorage.setCard).toHaveBeenCalledWith(mockCard);
      expect(mockStorage.saveCards).toHaveBeenCalled();
    });

    it('should delete card successfully', async () => {
      // Arrange
      const cardId = 'card-1';

      // Act
      await manager.deleteCard(cardId);

      // Assert
      expect(mockStorage.removeCard).toHaveBeenCalledWith(cardId);
      expect(mockStorage.saveCards).toHaveBeenCalled();
    });

    it('should handle card not found error', async () => {
      // Arrange
      (mockStorage.getCard as any).mockReturnValue(null);

      // Act & Assert
      await expect(manager.getCard('non-existent')).rejects.toThrow('Card not found');
    });
  });

  describe('Task 12.5: 测试队列创建', () => {
    beforeEach(() => {
      const advancedRouter = new AdvancedDataRouter(mockStorage as StorageManager);
      manager.setAdvancedRouter(advancedRouter);
    });

    it('should create RetrievalPractice queue', () => {
      // Act
      const queue = manager.getQueue(QueueType.RetrievalPractice);

      // Assert
      expect(queue).toBeDefined();
      expect(queue.getType()).toBe(QueueType.RetrievalPractice);
    });

    it('should create FinalDrill queue', () => {
      // Act
      const queue = manager.getQueue(QueueType.FinalDrill);

      // Assert
      expect(queue).toBeDefined();
      expect(queue.getType()).toBe(QueueType.FinalDrill);
    });

    it('should create IncrementalLearning queue', () => {
      // Act
      const queue = manager.getQueue(QueueType.IncrementalLearning);

      // Assert
      expect(queue).toBeDefined();
      expect(queue.getType()).toBe(QueueType.IncrementalLearning);
    });

    it('should create FilterGroup queue', () => {
      // Act
      const queue = manager.getQueue(QueueType.FilterGroup);

      // Assert
      expect(queue).toBeDefined();
      expect(queue.getType()).toBe(QueueType.FilterGroup);
    });

    it('should create NeuralRoam queue', () => {
      // Act
      const queue = manager.getQueue(QueueType.NeuralRoam);

      // Assert
      expect(queue).toBeDefined();
      expect(queue.getType()).toBe(QueueType.NeuralRoam);
    });

    it('should cache queue instances', () => {
      // Act
      const queue1 = manager.getQueue(QueueType.RetrievalPractice);
      const queue2 = manager.getQueue(QueueType.RetrievalPractice);

      // Assert
      expect(queue1).toBe(queue2); // Same instance
    });

    it('should access queue data correctly', async () => {
      // Arrange
      const mockCards = [
        {
          id: 'card-1',
          blockId: 'block-1',
          type: 'topic',
          state: 0,
          due: Date.now() - 1000,
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      (mockStorage.getAllCards as any).mockReturnValue(mockCards);

      // Act
      const queue = manager.getQueue(QueueType.RetrievalPractice);
      const cards = await queue.getCards();

      // Assert
      expect(cards).toBeDefined();
      expect(Array.isArray(cards)).toBe(true);
    });
  });

  describe('Integration: Complete Workflow', () => {
    it('should handle complete plugin initialization workflow', async () => {
      // Arrange
      const simpleConfig: RiffIntegrationConfig = {
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

      const mockSyncService = {
        incrementalSync: vi.fn(() => Promise.resolve({ success: true, syncedCount: 3 })),
      };

      // Step 1: Migrate configuration
      const migrationResult = await SimpleModeRemovalMigrator.performMigration(
        simpleConfig,
        mockSyncService
      );

      expect(migrationResult.success).toBe(true);
      expect(migrationResult.migratedConfig).not.toHaveProperty('mode');

      // Step 2: Initialize UnifiedDataSourceManager
      const advancedRouter = new AdvancedDataRouter(mockStorage as StorageManager);
      manager.setAdvancedRouter(advancedRouter);

      // Step 3: Verify router is accessible
      const router = manager.getRouter();
      expect(router).toBeInstanceOf(AdvancedDataRouter);

      // Step 4: Verify queue types are available
      const queueTypes = manager.getAvailableQueueTypes();
      expect(queueTypes).toHaveLength(5);

      // Step 5: Verify queues can be created
      const retrievalQueue = manager.getQueue(QueueType.RetrievalPractice);
      expect(retrievalQueue).toBeDefined();

      // Step 6: Verify data access works
      const mockCards = [
        {
          id: 'card-1',
          blockId: 'block-1',
          type: 'topic',
          state: 0,
          due: Date.now(),
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      (mockStorage.getAllCards as any).mockReturnValue(mockCards);

      const cards = await manager.getCards();
      expect(cards).toHaveLength(1);
    });
  });
});
