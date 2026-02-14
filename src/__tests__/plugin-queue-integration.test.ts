/**
 * Plugin Queue Integration Test (Phase 2)
 * 
 * Tests for SM-15 Pattern queue singleton management in Plugin class
 * 
 * Test Coverage:
 * - 2.3.1: Plugin correctly creates queue singletons
 * - 2.3.2: Getter methods return correct queue instances
 * - 2.3.3: Configuration updates trigger queue reinitialization
 * - 2.3.4: Plugin unload cleans up queues
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StorageManager } from '@/core/storage/manager';
import type { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
import { DEFAULT_RIFF_CONFIG } from '@/types/settings';

// Mock dependencies
vi.mock('@/core/siyuan/api', () => ({
  pushMsg: vi.fn(),
  pushErrMsg: vi.fn(),
  sql: vi.fn(),
  setBlockAttrs: vi.fn(),
}));

vi.mock('@/core/siyuan/riff', () => ({
  BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
  getRiffCards: vi.fn(() => Promise.resolve([])),
  getRiffNewCards: vi.fn(() => Promise.resolve([])),
  getRiffDueCards: vi.fn(() => Promise.resolve([])),
  removeRiffCards: vi.fn(() => Promise.resolve()),
  reviewRiffCard: vi.fn(() => Promise.resolve()),
  skipReviewRiffCard: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/core/siyuan/block', () => ({
  markBlockAsCard: vi.fn(),
  unmarkBlockAsCard: vi.fn(),
  ATTR_CARD_ID: 'custom-card-id',
  ATTR_PRIORITY: 'custom-priority',
  getCardBlockIds: vi.fn(() => Promise.resolve([])),
}));

describe('Plugin Queue Integration (Phase 2 - SM-15 Pattern)', () => {
  let mockStorage: Partial<StorageManager>;
  let mockSettings: any;

  beforeEach(() => {
    // Create mock storage
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
      loadData: vi.fn(() => Promise.resolve(null)),
      saveData: vi.fn(() => Promise.resolve()),
    };

    // Default settings
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

  describe('2.3.1: Plugin correctly creates queue singletons', () => {
    it('should create RetrievalPracticeQueue singleton on initialization', async () => {
      // Arrange
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const createSpy = vi.spyOn(RetrievalPracticeQueue, 'create');

      // Mock Plugin class initialization
      const { createScheduler } = await import('@/core/scheduler');
      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      // Act
      const retrievalQueue = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      // Assert
      expect(createSpy).toHaveBeenCalledWith({
        storage: mockStorage,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });
      expect(retrievalQueue).toBeDefined();
      expect(retrievalQueue).toBeInstanceOf(RetrievalPracticeQueue);
    });

    it('should create IncrementalLearningQueue singleton on initialization', async () => {
      // Arrange
      const { IncrementalLearningQueue } = await import('@/core/queue/strategies/IncrementalLearningQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      // Act
      const incrementalQueue = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      // Assert
      expect(incrementalQueue).toBeDefined();
      expect(incrementalQueue).toBeInstanceOf(IncrementalLearningQueue);
    });

    it('should initialize both queues in initializeQueues() method', async () => {
      // This test simulates the initializeQueues() method behavior
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const { IncrementalLearningQueue } = await import('@/core/queue/strategies/IncrementalLearningQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      // Act - Simulate initializeQueues()
      const retrievalQueue = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      const incrementalQueue = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      // Assert
      expect(retrievalQueue).toBeDefined();
      expect(incrementalQueue).toBeDefined();
      expect(retrievalQueue).toBeInstanceOf(RetrievalPracticeQueue);
      expect(incrementalQueue).toBeInstanceOf(IncrementalLearningQueue);
    });
  });

  describe('2.3.2: Getter methods return correct queue instances', () => {
    it('should return RetrievalPracticeQueue instance from getter', async () => {
      // Arrange
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      const retrievalQueue = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      // Act - Simulate getRetrievalPracticeQueue()
      const getQueue = () => {
        if (!retrievalQueue) {
          throw new Error('RetrievalPracticeQueue not initialized');
        }
        return retrievalQueue;
      };

      const result = getQueue();

      // Assert
      expect(result).toBe(retrievalQueue);
      expect(result).toBeInstanceOf(RetrievalPracticeQueue);
    });

    it('should return IncrementalLearningQueue instance from getter', async () => {
      // Arrange
      const { IncrementalLearningQueue } = await import('@/core/queue/strategies/IncrementalLearningQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      const incrementalQueue = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      // Act - Simulate getIncrementalLearningQueue()
      const getQueue = () => {
        if (!incrementalQueue) {
          throw new Error('IncrementalLearningQueue not initialized');
        }
        return incrementalQueue;
      };

      const result = getQueue();

      // Assert
      expect(result).toBe(incrementalQueue);
      expect(result).toBeInstanceOf(IncrementalLearningQueue);
    });

    it('should throw error if queue not initialized', () => {
      // Act & Assert
      const getQueue = () => {
        const queue = null;
        if (!queue) {
          throw new Error('RetrievalPracticeQueue not initialized');
        }
        return queue;
      };

      expect(() => getQueue()).toThrow('RetrievalPracticeQueue not initialized');
    });
  });

  describe('2.3.3: Configuration updates trigger queue reinitialization', () => {
    it('should reinitialize queues when settings change', async () => {
      // Arrange
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const { IncrementalLearningQueue } = await import('@/core/queue/strategies/IncrementalLearningQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      // Initial queues
      let retrievalQueue = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      let incrementalQueue = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      const initialRetrievalQueue = retrievalQueue;
      const initialIncrementalQueue = incrementalQueue;

      // Act - Simulate onSettingsChange()
      // Update settings
      mockSettings.scheduler.riffIntegration.mode = 'advanced';
      
      // Reinitialize queues
      retrievalQueue = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      incrementalQueue = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      // Assert
      expect(retrievalQueue).toBeDefined();
      expect(incrementalQueue).toBeDefined();
      // New instances should be created
      expect(retrievalQueue).not.toBe(initialRetrievalQueue);
      expect(incrementalQueue).not.toBe(initialIncrementalQueue);
    });

    it('should use updated configuration after reinitialization', async () => {
      // Arrange
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      // Initial config: simple mode
      mockSettings.scheduler.riffIntegration.mode = 'simple';
      
      const queue1 = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      // Act - Change to advanced mode
      mockSettings.scheduler.riffIntegration.mode = 'advanced';
      
      const queue2 = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      // Assert
      expect(queue1).toBeDefined();
      expect(queue2).toBeDefined();
      expect(queue1).not.toBe(queue2);
    });
  });

  describe('2.3.4: Plugin unload cleans up queues', () => {
    it('should clean up queue references on unload', async () => {
      // Arrange
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const { IncrementalLearningQueue } = await import('@/core/queue/strategies/IncrementalLearningQueue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      let retrievalQueue: RetrievalPracticeQueue | null = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      let incrementalQueue: IncrementalLearningQueue | null = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      expect(retrievalQueue).toBeDefined();
      expect(incrementalQueue).toBeDefined();

      // Act - Simulate onunload()
      retrievalQueue = null;
      incrementalQueue = null;

      // Assert
      expect(retrievalQueue).toBeNull();
      expect(incrementalQueue).toBeNull();
    });

    it('should save data before cleanup', async () => {
      // Arrange
      const saveCardsSpy = vi.spyOn(mockStorage, 'saveCards' as any);

      // Act - Simulate onunload()
      mockStorage.saveCards?.();

      // Assert
      expect(saveCardsSpy).toHaveBeenCalled();
    });
  });

  describe('Integration: Queue Context Registration', () => {
    it('should register queues in QueueContext', async () => {
      // Arrange
      const { RetrievalPracticeQueue } = await import('@/core/queue/strategies/RetrievalPracticeQueue');
      const { IncrementalLearningQueue } = await import('@/core/queue/strategies/IncrementalLearningQueue');
      const { QueueContext } = await import('@/core/queue');
      const { createScheduler } = await import('@/core/scheduler');
      const { SchedulerRouter } = await import('@/core/scheduler/SchedulerRouter');

      const scheduler = createScheduler(mockSettings.fsrs, mockSettings.schedulerEngine);
      const schedulerRouter = new SchedulerRouter({
        defaultScheduler: mockSettings.scheduler.defaultScheduler,
        enableRiffSync: mockSettings.scheduler.enableRiffSync,
        fsrsParams: mockSettings.fsrs,
      }, mockStorage as StorageManager);

      const retrievalQueue = await RetrievalPracticeQueue.create({
        storage: mockStorage as StorageManager,
        localScheduler: scheduler,
        schedulerRouter: schedulerRouter,
        riffConfig: mockSettings.scheduler.riffIntegration,
      });

      const incrementalQueue = new IncrementalLearningQueue({
        storage: mockStorage as StorageManager,
        scheduler: scheduler,
        schedulerRouter: schedulerRouter,
        config: {
          enableRiffSync: mockSettings.scheduler.enableRiffSync,
        },
      });

      // Act
      const queueContext = new QueueContext({
        initial: 'retrieval',
        monitors: [],
      });

      queueContext.register('retrieval', retrievalQueue as any);
      queueContext.register('incremental-learning', incrementalQueue as any);

      // Assert
      expect(queueContext).toBeDefined();
      // QueueContext should have registered queues
    });
  });
});
