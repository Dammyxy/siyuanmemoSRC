/**
 * Unit Tests for DataSourceFactory
 * 
 * Tests the factory's ability to create appropriate data sources based on configuration mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataSourceFactory } from '../DataSourceFactory';
import { LocalStorageDataSource } from '../LocalStorageDataSource';
import { RiffDataSource } from '../RiffDataSource';
import type { RiffIntegrationConfig } from '@/types/settings';
import type { StorageManager } from '../../../storage/manager';
import type { SchedulerRouter } from '../../../scheduler/SchedulerRouter';

// Mock the data source classes
vi.mock('../LocalStorageDataSource');
vi.mock('../RiffDataSource');

describe('DataSourceFactory', () => {
  let mockStorage: StorageManager;
  let mockSchedulerRouter: SchedulerRouter;
  let advancedConfig: RiffIntegrationConfig;
  let simpleConfig: RiffIntegrationConfig;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock storage
    mockStorage = {
      getAllCards: vi.fn().mockReturnValue([]),
      getCard: vi.fn(),
      setCard: vi.fn(),
      removeCard: vi.fn(),
      saveCards: vi.fn(),
    } as any;

    // Create mock scheduler router
    mockSchedulerRouter = {
      preview: vi.fn(),
      route: vi.fn(),
    } as any;

    // Create test configurations
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
        interval: 86400000,
        cleanupBlacklist: true,
      },
      deleteSync: {
        enabled: true,
        useBlacklistFallback: true,
      },
    };

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
  });

  describe('createDataSource', () => {
    describe('Advanced Mode', () => {
      it('should create LocalStorageDataSource for advanced mode', () => {
        const dataSource = DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(LocalStorageDataSource).toHaveBeenCalledTimes(1);
        expect(LocalStorageDataSource).toHaveBeenCalledWith({
          storage: mockStorage,
          filter: expect.any(Function),
          sort: expect.any(Function),
          schedulerRouter: mockSchedulerRouter,
        });
        expect(dataSource).toBeInstanceOf(LocalStorageDataSource);
      });

      it('should create LocalStorageDataSource without schedulerRouter', () => {
        const dataSource = DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage
        );

        expect(LocalStorageDataSource).toHaveBeenCalledTimes(1);
        expect(LocalStorageDataSource).toHaveBeenCalledWith({
          storage: mockStorage,
          filter: expect.any(Function),
          sort: expect.any(Function),
          schedulerRouter: undefined,
        });
        expect(dataSource).toBeInstanceOf(LocalStorageDataSource);
      });

      it('should configure filter to only include due cards', () => {
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (LocalStorageDataSource as any).mock.calls[0][0];
        const filterFn = callArgs.filter;

        const now = Date.now();
        
        // Card that is due (due time in the past)
        expect(filterFn({ due: now - 1000 })).toBe(true);
        
        // Card that is due now
        expect(filterFn({ due: now })).toBe(true);
        
        // Card that is not due yet (due time in the future)
        expect(filterFn({ due: now + 1000 })).toBe(false);
      });

      it('should configure sort by priority (ascending)', () => {
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (LocalStorageDataSource as any).mock.calls[0][0];
        const sortFn = callArgs.sort;

        // Lower priority should come first
        expect(sortFn({ priority: 10 }, { priority: 20 })).toBeLessThan(0);
        expect(sortFn({ priority: 50 }, { priority: 30 })).toBeGreaterThan(0);
        expect(sortFn({ priority: 40 }, { priority: 40 })).toBe(0);
      });

      it('should handle cards without priority (default to 50)', () => {
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (LocalStorageDataSource as any).mock.calls[0][0];
        const sortFn = callArgs.sort;

        // Card without priority should default to 50
        expect(sortFn({ priority: undefined }, { priority: 60 })).toBeLessThan(0);
        expect(sortFn({ priority: 40 }, { priority: undefined })).toBeLessThan(0);
        expect(sortFn({ priority: undefined }, { priority: undefined })).toBe(0);
      });

      it('should log creation message', () => {
        const consoleSpy = vi.spyOn(console, 'log');

        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          '[DataSourceFactory] Creating LocalStorageDataSource for advanced mode'
        );
      });
    });

    describe('Simple Mode', () => {
      it('should create RiffDataSource for simple mode', () => {
        const dataSource = DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(RiffDataSource).toHaveBeenCalledTimes(1);
        expect(RiffDataSource).toHaveBeenCalledWith({
          deckId: '20230218211946-2kw8jgx', // BUILTIN_DECK_ID
          mode: 'due-only',
          storage: mockStorage,
          schedulerRouter: mockSchedulerRouter,
        });
        expect(dataSource).toBeInstanceOf(RiffDataSource);
      });

      it('should create RiffDataSource without schedulerRouter', () => {
        const dataSource = DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage
        );

        expect(RiffDataSource).toHaveBeenCalledTimes(1);
        expect(RiffDataSource).toHaveBeenCalledWith({
          deckId: '20230218211946-2kw8jgx', // BUILTIN_DECK_ID
          mode: 'due-only',
          storage: mockStorage,
          schedulerRouter: undefined,
        });
        expect(dataSource).toBeInstanceOf(RiffDataSource);
      });

      it('should configure RiffDataSource with due-only mode', () => {
        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (RiffDataSource as any).mock.calls[0][0];
        expect(callArgs.mode).toBe('due-only');
      });

      it('should configure RiffDataSource with BUILTIN_DECK_ID', () => {
        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (RiffDataSource as any).mock.calls[0][0];
        expect(callArgs.deckId).toBe('20230218211946-2kw8jgx');
      });

      it('should log creation message', () => {
        const consoleSpy = vi.spyOn(console, 'log');

        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          '[DataSourceFactory] Creating RiffDataSource for simple mode'
        );
      });
    });

    describe('Mode Detection', () => {
      it('should correctly detect advanced mode', () => {
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(LocalStorageDataSource).toHaveBeenCalledTimes(1);
        expect(RiffDataSource).not.toHaveBeenCalled();
      });

      it('should correctly detect simple mode', () => {
        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(RiffDataSource).toHaveBeenCalledTimes(1);
        expect(LocalStorageDataSource).not.toHaveBeenCalled();
      });

      it('should handle mode switching', () => {
        // First create advanced mode
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(LocalStorageDataSource).toHaveBeenCalledTimes(1);
        expect(RiffDataSource).not.toHaveBeenCalled();

        vi.clearAllMocks();

        // Then switch to simple mode
        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        expect(RiffDataSource).toHaveBeenCalledTimes(1);
        expect(LocalStorageDataSource).not.toHaveBeenCalled();
      });
    });

    describe('Dependency Injection', () => {
      it('should pass storage to LocalStorageDataSource', () => {
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (LocalStorageDataSource as any).mock.calls[0][0];
        expect(callArgs.storage).toBe(mockStorage);
      });

      it('should pass storage to RiffDataSource', () => {
        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (RiffDataSource as any).mock.calls[0][0];
        expect(callArgs.storage).toBe(mockStorage);
      });

      it('should pass schedulerRouter to LocalStorageDataSource', () => {
        DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (LocalStorageDataSource as any).mock.calls[0][0];
        expect(callArgs.schedulerRouter).toBe(mockSchedulerRouter);
      });

      it('should pass schedulerRouter to RiffDataSource', () => {
        DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        const callArgs = (RiffDataSource as any).mock.calls[0][0];
        expect(callArgs.schedulerRouter).toBe(mockSchedulerRouter);
      });

      it('should handle missing schedulerRouter gracefully', () => {
        // Advanced mode without scheduler
        DataSourceFactory.createDataSource(advancedConfig, mockStorage);
        let callArgs = (LocalStorageDataSource as any).mock.calls[0][0];
        expect(callArgs.schedulerRouter).toBeUndefined();

        vi.clearAllMocks();

        // Simple mode without scheduler
        DataSourceFactory.createDataSource(simpleConfig, mockStorage);
        callArgs = (RiffDataSource as any).mock.calls[0][0];
        expect(callArgs.schedulerRouter).toBeUndefined();
      });
    });

    describe('Configuration Validation', () => {
      it('should work with minimal advanced config', () => {
        const minimalConfig: RiffIntegrationConfig = {
          mode: 'advanced',
          useLocalScheduler: true,
          incrementalSync: { enabled: false, triggers: [], useBlacklist: false },
          fullSync: { enabled: false, interval: 0, cleanupBlacklist: false },
          deleteSync: { enabled: false, useBlacklistFallback: false },
        };

        const dataSource = DataSourceFactory.createDataSource(
          minimalConfig,
          mockStorage
        );

        expect(dataSource).toBeInstanceOf(LocalStorageDataSource);
      });

      it('should work with minimal simple config', () => {
        const minimalConfig: RiffIntegrationConfig = {
          mode: 'simple',
          useLocalScheduler: false,
          incrementalSync: { enabled: false, triggers: [], useBlacklist: false },
          fullSync: { enabled: false, interval: 0, cleanupBlacklist: false },
          deleteSync: { enabled: false, useBlacklistFallback: false },
        };

        const dataSource = DataSourceFactory.createDataSource(
          minimalConfig,
          mockStorage
        );

        expect(dataSource).toBeInstanceOf(RiffDataSource);
      });
    });

    describe('Return Type', () => {
      it('should return IDataSource<QueueItem> for advanced mode', () => {
        const dataSource = DataSourceFactory.createDataSource(
          advancedConfig,
          mockStorage,
          mockSchedulerRouter
        );

        // Check that it has the IDataSource interface methods
        expect(dataSource).toHaveProperty('getAll');
        expect(dataSource).toHaveProperty('add');
        expect(dataSource).toHaveProperty('remove');
      });

      it('should return IDataSource<QueueItem> for simple mode', () => {
        const dataSource = DataSourceFactory.createDataSource(
          simpleConfig,
          mockStorage,
          mockSchedulerRouter
        );

        // Check that it has the IDataSource interface methods
        expect(dataSource).toHaveProperty('getAll');
        expect(dataSource).toHaveProperty('add');
        expect(dataSource).toHaveProperty('remove');
      });
    });
  });

  describe('Static Method', () => {
    it('should be a static method', () => {
      expect(typeof DataSourceFactory.createDataSource).toBe('function');
      expect(DataSourceFactory.createDataSource).toBe(DataSourceFactory.createDataSource);
    });

    it('should not require instantiation', () => {
      // Should be able to call directly without new
      const dataSource = DataSourceFactory.createDataSource(
        advancedConfig,
        mockStorage,
        mockSchedulerRouter
      );

      expect(dataSource).toBeDefined();
    });
  });
});
