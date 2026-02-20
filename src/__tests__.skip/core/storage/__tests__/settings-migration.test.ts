/**
 * Unit Tests for Settings Migration
 * 
 * Feature: fsrs-v6-upgrade-and-settings-optimization
 * Task: 2.3 - Write unit tests for settings migration
 * 
 * This file contains unit tests to verify that settings migration works correctly
 * when upgrading from FSRS v5 to v6, SM-2 to v6, and removing topicScheduler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '../manager';
import type { PluginSettings } from '@/types';
import * as siyuanApi from '@/core/siyuan/api';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the siyuan API
vi.mock('@/core/siyuan/api', () => ({
  getPluginDataPath: vi.fn((pluginName: string) => `/data/plugins/${pluginName}`),
  getFile: vi.fn(),
  putFile: vi.fn(),
  sql: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock settings object with old scheduler values
 */
function createOldSettings(overrides: Partial<PluginSettings> = {}): Partial<PluginSettings> {
  return {
    fsrs: {
      w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
      requestRetention: 0.9,
      maximumInterval: 36500,
      enableFuzz: true,
      enableShortTerm: false,
    },
    scheduler: {
      defaultScheduler: 'fsrs-v5' as any,
      enableRiffSync: false,
      itemScheduler: 'fsrs-v5' as any,
      topicScheduler: 'a-factor-v2' as any,
    },
    queues: {
      defaultQueue: 'retrieval',
      filterGroup: {
        groups: [],
      },
    },
    ...overrides,
  };
}

/**
 * Setup storage manager with mocked file system
 */
async function setupStorageWithSettings(settings: any): Promise<StorageManager> {
  // Mock getFile to return the settings
  vi.mocked(siyuanApi.getFile).mockImplementation(async (path: string) => {
    if (path.includes('settings.json')) {
      return JSON.stringify(settings);
    }
    if (path.includes('cards.msgpack') || path.includes('cards.json')) {
      return null; // No cards
    }
    if (path.includes('practice-queue')) {
      return null; // No queue
    }
    if (path.includes('incremental-learning-queue')) {
      return null; // No incremental queue
    }
    if (path.includes('riff-blacklist')) {
      return null; // No blacklist
    }
    return null;
  });

  const storage = new StorageManager('test-plugin');
  await storage.init();
  return storage;
}

// ============================================================================
// Test Suite: Settings Migration
// ============================================================================

describe('Feature: fsrs-v6-upgrade, Settings Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Test: FSRS v5 → v6 Migration
  // ==========================================================================

  describe('FSRS v5 → v6 Migration', () => {
    it('should migrate defaultScheduler from fsrs-v5 to fsrs-v6', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: false,
          itemScheduler: 'riff',
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.defaultScheduler).not.toBe('fsrs-v5');
    });

    it('should migrate itemScheduler from fsrs-v5 to fsrs-v6', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'riff',
          enableRiffSync: false,
          itemScheduler: 'fsrs-v5' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.itemScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).not.toBe('fsrs-v5');
    });

    it('should migrate both defaultScheduler and itemScheduler when both are fsrs-v5', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: false,
          itemScheduler: 'fsrs-v5' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).toBe('fsrs-v6');
    });

    it('should not modify other scheduler types when migrating fsrs-v5', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: true,
          itemScheduler: 'sm15',
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).toBe('sm15'); // Should remain unchanged
      expect(settings.scheduler.enableRiffSync).toBe(true); // Should remain unchanged
    });
  });

  // ==========================================================================
  // Test: SM-2 → v6 Migration
  // ==========================================================================

  describe('SM-2 → v6 Migration', () => {
    it('should migrate defaultScheduler from sm2 to fsrs-v6', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'sm2' as any,
          enableRiffSync: false,
          itemScheduler: 'riff',
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.defaultScheduler).not.toBe('sm2');
    });

    it('should migrate itemScheduler from sm2 to fsrs-v6', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'riff',
          enableRiffSync: false,
          itemScheduler: 'sm2' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.itemScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).not.toBe('sm2');
    });

    it('should migrate both defaultScheduler and itemScheduler when both are sm2', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'sm2' as any,
          enableRiffSync: false,
          itemScheduler: 'sm2' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).toBe('fsrs-v6');
    });
  });

  // ==========================================================================
  // Test: topicScheduler Removal
  // ==========================================================================

  describe('topicScheduler Removal', () => {
    it('should remove topicScheduler field from settings', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v6',
          enableRiffSync: false,
          itemScheduler: 'fsrs-v6',
          topicScheduler: 'a-factor-v2' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler).not.toHaveProperty('topicScheduler');
      expect((settings.scheduler as any).topicScheduler).toBeUndefined();
    });

    it('should remove topicScheduler even when set to a-factor', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v6',
          enableRiffSync: false,
          itemScheduler: 'fsrs-v6',
          topicScheduler: 'a-factor' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler).not.toHaveProperty('topicScheduler');
    });

    it('should handle settings without topicScheduler field gracefully', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v6',
          enableRiffSync: false,
          itemScheduler: 'fsrs-v6',
          // No topicScheduler field
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler).not.toHaveProperty('topicScheduler');
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
    });
  });

  // ==========================================================================
  // Test: Unchanged Fields Remain Intact
  // ==========================================================================

  describe('Unchanged Fields Remain Intact', () => {
    it('should preserve enableRiffSync setting', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: true,
          itemScheduler: 'fsrs-v5' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.enableRiffSync).toBe(true);
    });

    it('should preserve FSRS parameters', async () => {
      // Arrange
      const customWeights = [0.5, 0.7, 2.5, 6.0, 5.0, 1.0, 0.9, 0.02, 1.5, 0.15, 0.95, 2.2, 0.06, 0.35, 1.3, 0.3, 2.7];
      const oldSettings = createOldSettings({
        fsrs: {
          w: customWeights,
          requestRetention: 0.85,
          maximumInterval: 30000,
          enableFuzz: false,
          enableShortTerm: true,
        },
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: false,
          itemScheduler: 'fsrs-v5' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.fsrs.w).toEqual(customWeights);
      expect(settings.fsrs.requestRetention).toBe(0.85);
      expect(settings.fsrs.maximumInterval).toBe(30000);
      expect(settings.fsrs.enableFuzz).toBe(false);
      expect(settings.fsrs.enableShortTerm).toBe(true);
    });

    it('should preserve queue settings', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        queues: {
          defaultQueue: 'final-drill',
          filterGroup: {
            groups: [
              { id: 'group1', weight: 1 },
              { id: 'group2', weight: 2 },
            ],
          },
        },
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: false,
          itemScheduler: 'sm2' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.queues.defaultQueue).toBe('final-drill');
      expect(settings.queues.filterGroup.groups).toHaveLength(2);
      expect(settings.queues.filterGroup.groups[0].id).toBe('group1');
      expect(settings.queues.filterGroup.groups[1].weight).toBe(2);
    });

    it('should preserve non-scheduler settings when migrating', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: false,
          itemScheduler: 'sm2' as any,
          topicScheduler: 'a-factor-v2' as any,
        },
        incremental: {
          autoCardEnabled: true,
          autoCardDelay: 5000,
        } as any,
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect((settings as any).incremental?.autoCardEnabled).toBe(true);
      expect((settings as any).incremental?.autoCardDelay).toBe(5000);
    });
  });

  // ==========================================================================
  // Test: Combined Migration Scenarios
  // ==========================================================================

  describe('Combined Migration Scenarios', () => {
    it('should handle migration of fsrs-v5, sm2, and topicScheduler removal together', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: true,
          itemScheduler: 'sm2' as any,
          topicScheduler: 'a-factor-v2' as any,
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).toBe('fsrs-v6');
      expect(settings.scheduler).not.toHaveProperty('topicScheduler');
      expect(settings.scheduler.enableRiffSync).toBe(true);
    });

    it('should handle settings with no migration needed', async () => {
      // Arrange
      const newSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v6',
          enableRiffSync: false,
          itemScheduler: 'riff',
          // No topicScheduler
        },
      });

      // Act
      const storage = await setupStorageWithSettings(newSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).toBe('riff');
      expect(settings.scheduler).not.toHaveProperty('topicScheduler');
    });

    it('should handle partial migration (only some fields need migration)', async () => {
      // Arrange
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v6', // Already migrated
          enableRiffSync: false,
          itemScheduler: 'sm2' as any, // Needs migration
          topicScheduler: 'a-factor-v2' as any, // Needs removal
        },
      });

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
      expect(settings.scheduler.itemScheduler).toBe('fsrs-v6');
      expect(settings.scheduler).not.toHaveProperty('topicScheduler');
    });
  });

  // ==========================================================================
  // Test: Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle missing scheduler config gracefully', async () => {
      // Arrange
      const oldSettings = {
        fsrs: {
          w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
          requestRetention: 0.9,
          maximumInterval: 36500,
          enableFuzz: true,
          enableShortTerm: false,
        },
        // No scheduler config
      };

      // Act
      const storage = await setupStorageWithSettings(oldSettings);
      const settings = storage.getSettings();

      // Assert
      expect(settings.scheduler).toBeDefined();
      expect(settings.scheduler.defaultScheduler).toBeDefined();
    });

    it('should handle empty settings file', async () => {
      // Arrange
      vi.mocked(siyuanApi.getFile).mockImplementation(async (path: string) => {
        if (path.includes('settings.json')) {
          return '{}';
        }
        return null;
      });

      // Act
      const storage = new StorageManager('test-plugin');
      await storage.init();
      const settings = storage.getSettings();

      // Assert
      expect(settings).toBeDefined();
      expect(settings.scheduler).toBeDefined();
      expect(settings.scheduler.defaultScheduler).toBeDefined();
    });

    it('should handle corrupted settings file', async () => {
      // Arrange
      vi.mocked(siyuanApi.getFile).mockImplementation(async (path: string) => {
        if (path.includes('settings.json')) {
          return 'invalid json {';
        }
        return null;
      });

      // Act
      const storage = new StorageManager('test-plugin');
      await storage.init();
      const settings = storage.getSettings();

      // Assert - Should fall back to default settings
      expect(settings).toBeDefined();
      expect(settings.scheduler).toBeDefined();
      expect(settings.scheduler.defaultScheduler).toBe('fsrs-v6');
    });
  });

  // ==========================================================================
  // Test: Migration Logging
  // ==========================================================================

  describe('Migration Logging', () => {
    it('should log migration of defaultScheduler', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log');
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v5' as any,
          enableRiffSync: false,
          itemScheduler: 'riff',
        },
      });

      // Act
      await setupStorageWithSettings(oldSettings);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrated defaultScheduler: fsrs-v5 → fsrs-v6')
      );

      consoleSpy.mockRestore();
    });

    it('should log migration of itemScheduler', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log');
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'riff',
          enableRiffSync: false,
          itemScheduler: 'sm2' as any,
        },
      });

      // Act
      await setupStorageWithSettings(oldSettings);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrated itemScheduler: sm2 → fsrs-v6')
      );

      consoleSpy.mockRestore();
    });

    it('should log removal of topicScheduler', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log');
      const oldSettings = createOldSettings({
        scheduler: {
          defaultScheduler: 'fsrs-v6',
          enableRiffSync: false,
          itemScheduler: 'fsrs-v6',
          topicScheduler: 'a-factor-v2' as any,
        },
      });

      // Act
      await setupStorageWithSettings(oldSettings);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Removed topicScheduler field')
      );

      consoleSpy.mockRestore();
    });
  });
});

// ============================================================================
// Summary
// ============================================================================

/**
 * Test Summary:
 * 
 * FSRS v5 → v6 Migration:
 * - ✅ Migrates defaultScheduler from fsrs-v5 to fsrs-v6
 * - ✅ Migrates itemScheduler from fsrs-v5 to fsrs-v6
 * - ✅ Migrates both fields when both are fsrs-v5
 * - ✅ Preserves other scheduler types
 * 
 * SM-2 → v6 Migration:
 * - ✅ Migrates defaultScheduler from sm2 to fsrs-v6
 * - ✅ Migrates itemScheduler from sm2 to fsrs-v6
 * - ✅ Migrates both fields when both are sm2
 * 
 * topicScheduler Removal:
 * - ✅ Removes topicScheduler field from settings
 * - ✅ Handles different topicScheduler values
 * - ✅ Handles missing topicScheduler gracefully
 * 
 * Unchanged Fields:
 * - ✅ Preserves enableRiffSync setting
 * - ✅ Preserves FSRS parameters
 * - ✅ Preserves queue settings
 * - ✅ Preserves other non-scheduler settings
 * 
 * Combined Scenarios:
 * - ✅ Handles multiple migrations together
 * - ✅ Handles settings with no migration needed
 * - ✅ Handles partial migration
 * 
 * Edge Cases:
 * - ✅ Handles missing scheduler config
 * - ✅ Handles empty settings file
 * - ✅ Handles corrupted settings file
 * 
 * Logging:
 * - ✅ Logs defaultScheduler migration
 * - ✅ Logs itemScheduler migration
 * - ✅ Logs topicScheduler removal
 * 
 * Validates Requirements: 2.4, 2.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
