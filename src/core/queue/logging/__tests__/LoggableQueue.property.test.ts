/**
 * Property Tests for LoggableQueue
 * 
 * These tests verify universal properties that should hold for all
 * queue operations with logging enabled, using property-based testing
 * with fast-check to generate random test cases.
 * 
 * ## Test Strategy
 * 
 * Property-based testing complements example-based unit tests by:
 * - Testing with randomly generated inputs
 * - Discovering edge cases automatically
 * - Verifying properties hold across all valid inputs
 * - Running hundreds of test cases per property
 * 
 * ## Properties Tested
 * 
 * **Property 12: Operation Log Completeness**
 * - All operations are logged with required fields
 * - Log entries contain type, timestamp, and details
 * - Duration is recorded when enabled
 * 
 * **Property 13: Operation Log Size Limit**
 * - Log size never exceeds configured maximum
 * - Oldest entries are removed when limit is reached
 * - Log remains functional after many operations
 * 
 * @module LoggableQueue.property.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { LoggableQueue } from '../LoggableQueue';
import type { QueueItem } from '../../types';
import { createBlockID, createCardID } from '../../../../types/branded';

/**
 * Mock Queue Implementation
 * 
 * A simple queue implementation for testing purposes.
 * Provides basic queue operations without complex logic.
 */
class MockQueue<TItem extends QueueItem> {
  private items: TItem[] = [];
  
  constructor(items: TItem[] = []) {
    this.items = [...items];
  }
  
  async next(): Promise<TItem | null> {
    return this.items.shift() || null;
  }
  
  async insertAt(items: TItem[], index: number): Promise<void> {
    this.items.splice(index, 0, ...items);
  }
  
  async remove(items: TItem[]): Promise<number> {
    const idsToRemove = new Set(items.map(item => item.blockID));
    const initialLength = this.items.length;
    this.items = this.items.filter(item => !idsToRemove.has(item.blockID));
    return initialLength - this.items.length;
  }
  
  async rotateToEnd(item: TItem): Promise<void> {
    const index = this.items.findIndex(i => i.blockID === item.blockID);
    if (index !== -1) {
      const [removed] = this.items.splice(index, 1);
      this.items.push(removed);
    }
  }
  
  async reset(): Promise<void> {
    this.items = [];
  }
  
  async getAllCards(): Promise<TItem[]> {
    return [...this.items];
  }
}

/**
 * Generate a random queue item
 */
function generateQueueItem(id: number): QueueItem {
  return {
    blockID: createBlockID(`block-${id}`),
    cardID: createCardID(`card-${id}`),
    deckID: 'deck-test',
    priority: 50,
    state: 2,
    stability: 10,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    lastReview: Date.now(),
    elapsedDays: 1,
    scheduledDays: 1
  };
}

describe('LoggableQueue Property Tests', () => {
  describe('Property 12: Operation Log Completeness', () => {
    /**
     * Feature: architecture-optimization
     * Property 12: Operation Log Completeness
     * 
     * **Validates: Requirements 9.4, 11.1, 11.2**
     * - 9.4: THE System SHALL measure and report operation duration for key operations
     * - 11.1: THE System SHALL log all queue operations (next, insert, remove, rotate)
     * - 11.2: WHEN logging operations, THE System SHALL record operation type, timestamp, and relevant details
     * 
     * For any sequence of queue operations, all operations should be logged
     * with the required fields: type, timestamp, duration (if enabled), and details.
     */
    it('should log all operations with required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a random sequence of operations
          fc.array(
            fc.oneof(
              fc.constant('next'),
              fc.constant('insert'),
              fc.constant('remove'),
              fc.constant('rotate'),
              fc.constant('reset')
            ),
            { minLength: 1, maxLength: 20 }
          ),
          async (operations) => {
            // Given: A loggable queue with tracking enabled
            const items = Array.from({ length: 10 }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue, {
              maxSize: 1000,
              trackDuration: true,
              includeDetails: true
            });
            
            // When: Performing the sequence of operations
            let expectedLogCount = 0;
            for (const op of operations) {
              try {
                switch (op) {
                  case 'next':
                    await loggableQueue.next();
                    expectedLogCount++;
                    break;
                  case 'insert':
                    await loggableQueue.insertAt([generateQueueItem(999)], 0);
                    expectedLogCount++;
                    break;
                  case 'remove':
                    const allCards = await loggableQueue.getAllCards();
                    if (allCards.length > 0) {
                      await loggableQueue.remove([allCards[0]]);
                      expectedLogCount++;
                    }
                    break;
                  case 'rotate':
                    const cards = await loggableQueue.getAllCards();
                    if (cards.length > 0) {
                      await loggableQueue.rotateToEnd(cards[0]);
                      expectedLogCount++;
                    }
                    break;
                  case 'reset':
                    await loggableQueue.reset();
                    expectedLogCount++;
                    break;
                }
              } catch (error) {
                // Ignore errors - we're testing logging, not operation success
              }
            }
            
            // Then: All operations should be logged
            const log = loggableQueue.getOperationLog();
            expect(log.length).toBe(expectedLogCount);
            
            // And: Each log entry should have required fields
            for (const entry of log) {
              // Required fields
              expect(entry).toHaveProperty('type');
              expect(entry).toHaveProperty('timestamp');
              expect(entry).toHaveProperty('details');
              
              // Type should be valid
              expect(['next', 'insert', 'remove', 'rotate', 'reset']).toContain(entry.type);
              
              // Timestamp should be a valid number
              expect(typeof entry.timestamp).toBe('number');
              expect(entry.timestamp).toBeGreaterThan(0);
              
              // Duration should be present and valid (when tracking is enabled)
              expect(entry).toHaveProperty('duration');
              if (entry.duration !== undefined) {
                expect(typeof entry.duration).toBe('number');
                expect(entry.duration).toBeGreaterThanOrEqual(0);
              }
              
              // Details should be an object
              expect(typeof entry.details).toBe('object');
              expect(entry.details).not.toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should record operation duration when enabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          async (operationCount) => {
            // Given: A loggable queue with duration tracking enabled
            const items = Array.from({ length: 10 }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue, {
              maxSize: 1000,
              trackDuration: true
            });
            
            // When: Performing multiple operations
            for (let i = 0; i < operationCount; i++) {
              await loggableQueue.next();
            }
            
            // Then: All operations should have duration recorded
            const log = loggableQueue.getOperationLog();
            expect(log.length).toBe(operationCount);
            
            for (const entry of log) {
              expect(entry.duration).toBeDefined();
              expect(typeof entry.duration).toBe('number');
              expect(entry.duration).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('should include operation details when enabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (itemCount) => {
            // Given: A loggable queue with details tracking enabled
            const items = Array.from({ length: itemCount }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue, {
              maxSize: 1000,
              includeDetails: true
            });
            
            // When: Performing next() operations
            for (let i = 0; i < itemCount; i++) {
              await loggableQueue.next();
            }
            
            // Then: All operations should have details
            const log = loggableQueue.getOperationLog();
            
            for (const entry of log) {
              expect(entry.details).toBeDefined();
              expect(typeof entry.details).toBe('object');
              
              // next() operations should include itemReturned
              if (entry.type === 'next') {
                expect(entry.details).toHaveProperty('itemReturned');
                expect(typeof entry.details.itemReturned).toBe('boolean');
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  describe('Property 13: Operation Log Size Limit', () => {
    /**
     * Feature: architecture-optimization
     * Property 13: Operation Log Size Limit
     * 
     * **Validates: Requirement 11.5**
     * - 11.5: THE System SHALL limit log size to prevent memory issues with long-running sessions
     * 
     * For any number of operations, the log size should never exceed the
     * configured maximum, and the log should remain functional.
     */
    it('should never exceed configured maximum size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }),  // maxSize
          fc.integer({ min: 100, max: 500 }), // operationCount (much larger than maxSize)
          async (maxSize, operationCount) => {
            // Given: A loggable queue with a size limit
            const items = Array.from({ length: 50 }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue, {
              maxSize,
              trackDuration: true
            });
            
            // When: Performing many operations (more than maxSize)
            for (let i = 0; i < operationCount; i++) {
              await loggableQueue.next();
            }
            
            // Then: Log size should not exceed maxSize
            const log = loggableQueue.getOperationLog();
            expect(log.length).toBeLessThanOrEqual(maxSize);
            
            // And: Log should contain the most recent operations
            if (operationCount > maxSize) {
              expect(log.length).toBe(maxSize);
            } else {
              expect(log.length).toBe(operationCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should keep most recent operations when limit is reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          async (maxSize) => {
            // Given: A loggable queue with a small size limit
            const items = Array.from({ length: 100 }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue, {
              maxSize,
              trackDuration: true
            });
            
            // When: Performing operations beyond the limit
            const operationCount = maxSize * 3;
            
            for (let i = 0; i < operationCount; i++) {
              await loggableQueue.next();
            }
            
            // Then: Log should contain only the most recent operations
            const log = loggableQueue.getOperationLog();
            expect(log.length).toBe(maxSize);
            
            // And: Timestamps should be in ascending order
            for (let i = 1; i < log.length; i++) {
              expect(log[i].timestamp).toBeGreaterThanOrEqual(log[i - 1].timestamp);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('should remain functional after many operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1000, max: 5000 }),
          async (operationCount) => {
            // Given: A loggable queue with a reasonable size limit
            const maxSize = 100;
            const items = Array.from({ length: 50 }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue, {
              maxSize,
              trackDuration: true
            });
            
            // When: Performing a very large number of operations
            for (let i = 0; i < operationCount; i++) {
              // Mix different operation types
              if (i % 3 === 0) {
                await loggableQueue.insertAt([generateQueueItem(i)], 0);
              } else {
                await loggableQueue.next();
              }
            }
            
            // Then: Log should still be functional
            const log = loggableQueue.getOperationLog();
            expect(log.length).toBeLessThanOrEqual(maxSize);
            
            // And: Can retrieve limited log
            const recentLog = loggableQueue.getOperationLog(10);
            expect(recentLog.length).toBe(10);
            
            // And: Can clear log
            loggableQueue.clearOperationLog();
            const clearedLog = loggableQueue.getOperationLog();
            expect(clearedLog.length).toBe(0);
            
            // And: Can continue logging after clear
            await loggableQueue.next();
            const newLog = loggableQueue.getOperationLog();
            expect(newLog.length).toBe(1);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
  
  describe('Log Query Methods', () => {
    it('should return limited number of operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }),
          fc.integer({ min: 1, max: 10 }),
          async (totalOps, limit) => {
            // Given: A queue with multiple operations
            const items = Array.from({ length: totalOps }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue);
            
            // When: Performing operations
            for (let i = 0; i < totalOps; i++) {
              await loggableQueue.next();
            }
            
            // Then: getOperationLog(limit) should return at most 'limit' operations
            const limitedLog = loggableQueue.getOperationLog(limit);
            expect(limitedLog.length).toBeLessThanOrEqual(limit);
            expect(limitedLog.length).toBe(Math.min(limit, totalOps));
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('should clear all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 30 }),
          async (operationCount) => {
            // Given: A queue with operations
            const items = Array.from({ length: operationCount }, (_, i) => generateQueueItem(i));
            const mockQueue = new MockQueue(items);
            const loggableQueue = new LoggableQueue(mockQueue);
            
            for (let i = 0; i < operationCount; i++) {
              await loggableQueue.next();
            }
            
            // When: Clearing the log
            loggableQueue.clearOperationLog();
            
            // Then: Log should be empty
            const log = loggableQueue.getOperationLog();
            expect(log.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
