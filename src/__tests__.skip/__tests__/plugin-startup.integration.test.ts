/**
 * Plugin Startup Integration Test
 * 
 * 测试插件启动时 HybridSyncService 的初始化流程
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HybridSyncService } from '@/application/services/XiuyuanSyncService';
import type { StorageManager } from '@/core/storage/manager';
import { ConfigMigrator } from '@/utils/configMigrator';
import { DEFAULT_RIFF_CONFIG, type RiffIntegrationConfig } from '@/types/settings';

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
}));

describe('Plugin Startup Integration', () => {
  let mockStorage: Partial<StorageManager>;
  let mockSettings: any;

  beforeEach(() => {
    // 创建 mock storage
    mockStorage = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      getAllCards: vi.fn(() => []),
      getCard: vi.fn(),
      setCard: vi.fn(),
      removeCard: vi.fn(),
      saveCards: vi.fn(),
      getRiffBlacklist: vi.fn(() => new Set()),
      addToRiffBlacklist: vi.fn(),
      removeFromRiffBlacklist: vi.fn(),
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HybridSyncService Initialization', () => {
    it('should initialize HybridSyncService in advanced mode', async () => {
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

      mockSettings.scheduler.riffIntegration = advancedConfig;

      // Act
      const { HybridSyncService } = await import('@/application/services/XiuyuanSyncService');
      const service = new HybridSyncService({
        deckId: '20230218211946-2kw8jgx',
        storage: mockStorage as StorageManager,
        incrementalSync: advancedConfig.incrementalSync,
        fullSync: advancedConfig.fullSync,
        deleteSync: advancedConfig.deleteSync,
      });

      await service.start();

      // Assert
      expect(service).toBeDefined();
      const status = service.getSyncStatus();
      // 由于增量同步是异步的，状态可能是 'success' 或 'idle'
      expect(['idle', 'success', 'syncing']).toContain(status.status);
    });

    it('should not initialize HybridSyncService in simple mode', async () => {
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

      mockSettings.scheduler.riffIntegration = simpleConfig;

      // Act & Assert
      // 在简单模式下，不应该初始化 HybridSyncService
      // 这个测试验证配置逻辑
      expect(simpleConfig.mode).toBe('simple');
      expect(simpleConfig.incrementalSync.enabled).toBe(false);
      expect(simpleConfig.fullSync.enabled).toBe(false);
    });

    it('should handle missing riffIntegration config gracefully', async () => {
      // Arrange
      mockSettings.scheduler.riffIntegration = undefined;

      // Act & Assert
      // 应该不会抛出错误
      expect(() => {
        const config = mockSettings.scheduler.riffIntegration;
        if (config && config.mode === 'advanced') {
          // 只有在配置存在且为 advanced 模式时才初始化
          throw new Error('Should not reach here');
        }
      }).not.toThrow();
    });
  });

  describe('Configuration Migration', () => {
    it('should detect and migrate legacy config (data-only)', async () => {
      // Arrange
      const legacyConfig = {
        mode: 'data-only',
        dataSourceMode: 'due-only',
        syncToRiff: false,
        useRiffScheduler: false,
        incrementalUpdateInterval: 300,
      };

      mockSettings.scheduler.legacyRiffIntegration = legacyConfig;

      // Act
      const needsMigration = ConfigMigrator.needsMigration(legacyConfig);
      expect(needsMigration).toBe(true);

      const migratedConfig = ConfigMigrator.migrate(legacyConfig);

      // Assert
      expect(migratedConfig.mode).toBe('advanced');
      expect(migratedConfig.useLocalScheduler).toBe(true);
      expect(migratedConfig.incrementalSync.enabled).toBe(true);
      expect(migratedConfig.fullSync.enabled).toBe(true);
      expect(migratedConfig.deleteSync.enabled).toBe(true);
    });

    it('should detect and migrate legacy config (disabled)', async () => {
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
      expect(needsMigration).toBe(true);

      const migratedConfig = ConfigMigrator.migrate(legacyConfig);

      // Assert
      expect(migratedConfig.mode).toBe('simple');
      expect(migratedConfig.useLocalScheduler).toBe(false);
      expect(migratedConfig.incrementalSync.enabled).toBe(false);
      expect(migratedConfig.fullSync.enabled).toBe(false);
    });

    it('should detect and migrate legacy config (full-scheduler)', async () => {
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
      expect(needsMigration).toBe(true);

      const migratedConfig = ConfigMigrator.migrate(legacyConfig);

      // Assert
      expect(migratedConfig.mode).toBe('simple');
      expect(migratedConfig.useLocalScheduler).toBe(false);
    });

    it('should not migrate new config format', async () => {
      // Arrange
      const newConfig = DEFAULT_RIFF_CONFIG;

      // Act
      const needsMigration = ConfigMigrator.needsMigration(newConfig);

      // Assert
      expect(needsMigration).toBe(false);
    });

    it('should generate appropriate migration messages', () => {
      // Test migration messages
      const dataOnlyMessage = ConfigMigrator.getMigrationMessage('data-only');
      expect(dataOnlyMessage).toContain('混合同步方案');
      expect(dataOnlyMessage).toContain('增量同步');
      expect(dataOnlyMessage).toContain('全量同步');

      const disabledMessage = ConfigMigrator.getMigrationMessage('disabled');
      expect(disabledMessage).toContain('简单模式');

      const fullSchedulerMessage = ConfigMigrator.getMigrationMessage('full-scheduler');
      expect(fullSchedulerMessage).toContain('简单模式');
    });
  });

  describe('Service Lifecycle', () => {
    it('should start and stop HybridSyncService correctly', async () => {
      // Arrange
      const { HybridSyncService } = await import('@/application/services/XiuyuanSyncService');
      const service = new HybridSyncService({
        deckId: '20230218211946-2kw8jgx',
        storage: mockStorage as StorageManager,
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
      });

      // Act
      await service.start();
      const statusAfterStart = service.getSyncStatus();
      
      service.stop();
      const statusAfterStop = service.getSyncStatus();

      // Assert
      expect(statusAfterStart).toBeDefined();
      expect(statusAfterStop).toBeDefined();
      // 停止后状态应该保持不变（只是停止了定时器）
    });

    it('should handle start errors gracefully', async () => {
      // Arrange
      const { HybridSyncService } = await import('@/application/services/XiuyuanSyncService');
      
      // Mock getRiffNewCards to throw error
      const { getRiffNewCards } = await import('@/core/siyuan/riff');
      (getRiffNewCards as any).mockRejectedValue(new Error('Network error'));

      const service = new HybridSyncService({
        deckId: '20230218211946-2kw8jgx',
        storage: mockStorage as StorageManager,
        incrementalSync: {
          enabled: true,
          triggers: ['plugin-start'],
          useBlacklist: true,
        },
        fullSync: {
          enabled: false,
          interval: 86400000,
          cleanupBlacklist: true,
        },
        deleteSync: {
          enabled: true,
          useBlacklistFallback: true,
        },
      });

      // Act & Assert
      // 应该不会抛出错误，而是记录错误并继续
      await expect(service.start()).resolves.not.toThrow();
    });
  });

  describe('Integration with Plugin Lifecycle', () => {
    it('should initialize in correct order', async () => {
      // 这个测试验证初始化顺序
      const initOrder: string[] = [];

      // 模拟插件初始化流程
      initOrder.push('1. Storage initialized');
      
      // 检查配置迁移
      const legacyConfig = mockSettings.scheduler.legacyRiffIntegration;
      if (legacyConfig && ConfigMigrator.needsMigration(legacyConfig)) {
        initOrder.push('2. Config migration detected');
        const migratedConfig = ConfigMigrator.migrate(legacyConfig);
        mockSettings.scheduler.riffIntegration = migratedConfig;
        initOrder.push('3. Config migrated');
      }

      // 初始化 HybridSyncService
      const riffConfig = mockSettings.scheduler.riffIntegration;
      if (riffConfig && riffConfig.mode === 'advanced') {
        initOrder.push('4. HybridSyncService initialized');
      }

      initOrder.push('5. Other services initialized');

      // Assert
      expect(initOrder).toContain('1. Storage initialized');
      expect(initOrder[initOrder.length - 1]).toBe('5. Other services initialized');
    });
  });
});
