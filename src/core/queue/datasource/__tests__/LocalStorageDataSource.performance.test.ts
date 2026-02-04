/**
 * Performance tests for LocalStorageDataSource
 * 
 * Tests the performance characteristics of LocalStorageDataSource under various conditions:
 * - Basic read performance with different data volumes
 * - Filtering performance
 * - Sorting performance
 * - nextDues extraction performance
 * - msgpack serialization/deserialization performance
 * 
 * Performance Goals (from design document):
 * - Load 100 cards: < 10ms
 * - Load 1000 cards: < 100ms
 * - Direct memory access, no network requests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageDataSource } from '../LocalStorageDataSource';
import type { StorageManager } from '../../../storage/manager';
import type { SchedulerRouter } from '../../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types/card';
import { encode, decode } from '@msgpack/msgpack';

/**
 * Helper function to generate test cards
 */
function generateTestCards(count: number): FSRSCard[] {
  const now = Date.now();
  const cards: FSRSCard[] = [];
  
  for (let i = 0; i < count; i++) {
    cards.push({
      id: `card-${i}` as any,
      blockId: `block-${i}` as any,
      due: now + (i * 1000), // Stagger due times
      stability: Math.random() * 10,
      difficulty: Math.random() * 10,
      elapsedDays: Math.floor(Math.random() * 30),
      scheduledDays: Math.floor(Math.random() * 30),
      reps: Math.floor(Math.random() * 10),
      lapses: Math.floor(Math.random() * 3),
      state: Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3,
      lastReview: now - (Math.random() * 86400000),
      priority: Math.floor(Math.random() * 100),
    } as FSRSCard);
  }
  
  return cards;
}

/**
 * Helper function to create mock storage with test data
 */
function createMockStorage(cards: FSRSCard[]): StorageManager {
  return {
    getAllCards: vi.fn().mockReturnValue(cards),
    getCard: vi.fn(),
    setCard: vi.fn(),
    removeCard: vi.fn(),
    saveCards: vi.fn(),
  } as any;
}

/**
 * Helper function to create mock scheduler router
 */
function createMockSchedulerRouter(): SchedulerRouter {
  return {
    preview: vi.fn((card: FSRSCard) => {
      const now = card.due || Date.now();
      return new Map([
        [1, { ...card, due: now + 60000 } as FSRSCard],      // 1 minute
        [2, { ...card, due: now + 600000 } as FSRSCard],     // 10 minutes
        [3, { ...card, due: now + 86400000 } as FSRSCard],   // 1 day
        [4, { ...card, due: now + 259200000 } as FSRSCard],  // 3 days
      ]);
    }),
  } as any;
}

describe('LocalStorageDataSource - Performance Tests', () => {
  describe('Basic Read Performance', () => {
    it('should load 100 cards in < 10ms', async () => {
      const cards = generateTestCards(100);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(100);
      expect(duration).toBeLessThan(10);
      console.log(`[Performance] Loaded 100 cards in ${duration.toFixed(2)}ms`);
    });

    it('should load 1000 cards in < 100ms', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100);
      console.log(`[Performance] Loaded 1000 cards in ${duration.toFixed(2)}ms`);
    });

    it('should load 10000 cards efficiently', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(10000);
      // For 10000 cards, we expect < 1000ms (1 second)
      expect(duration).toBeLessThan(1000);
      console.log(`[Performance] Loaded 10000 cards in ${duration.toFixed(2)}ms`);
    });

    it('should have consistent performance across multiple calls', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const durations: number[] = [];
      
      // Run 5 times to check consistency
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await dataSource.getAll();
        const duration = performance.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`[Performance] Average: ${avgDuration.toFixed(2)}ms, Min: ${minDuration.toFixed(2)}ms, Max: ${maxDuration.toFixed(2)}ms`);
      
      // All calls should be fast
      expect(maxDuration).toBeLessThan(100);
      
      // Variance should be reasonable (max should not be more than 3x min)
      expect(maxDuration / minDuration).toBeLessThan(3);
    });
  });

  describe('Filtering Performance', () => {
    it('should filter due cards efficiently with 1000 cards', async () => {
      const now = Date.now();
      const cards = generateTestCards(1000);
      
      // Make half of them due
      cards.forEach((card, i) => {
        card.due = i < 500 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(500);
      expect(duration).toBeLessThan(100);
      console.log(`[Performance] Filtered 1000 cards to 500 in ${duration.toFixed(2)}ms`);
    });

    it('should filter by state efficiently', async () => {
      const cards = generateTestCards(1000);
      
      // Set specific states
      cards.forEach((card, i) => {
        card.state = (i % 4) as 0 | 1 | 2 | 3;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.state === 1 || card.state === 2,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
      console.log(`[Performance] Filtered by state in ${duration.toFixed(2)}ms`);
    });

    it('should handle complex filter conditions', async () => {
      const now = Date.now();
      const cards = generateTestCards(1000);

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => 
          card.due <= now && 
          card.state !== 0 && 
          (card.priority ?? 50) >= 50 &&
          card.lapses < 3,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100);
      console.log(`[Performance] Complex filter on 1000 cards in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Sorting Performance', () => {
    it('should sort by priority efficiently', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100);
      
      // Verify sorting is correct
      for (let i = 1; i < result.length; i++) {
        expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
      }
      
      console.log(`[Performance] Sorted 1000 cards by priority in ${duration.toFixed(2)}ms`);
    });

    it('should sort by due time efficiently', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        sort: (a, b) => a.due - b.due,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100);
      console.log(`[Performance] Sorted 1000 cards by due time in ${duration.toFixed(2)}ms`);
    });

    it('should handle filter + sort combination efficiently', async () => {
      const now = Date.now();
      const cards = generateTestCards(1000);
      
      // Make half of them due
      cards.forEach((card, i) => {
        card.due = i < 500 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(500);
      expect(duration).toBeLessThan(100);
      console.log(`[Performance] Filter + sort on 1000 cards in ${duration.toFixed(2)}ms`);
    });
  });

  describe('nextDues Extraction Performance', () => {
    it('should extract nextDues using SchedulerRouter efficiently', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const mockScheduler = createMockSchedulerRouter();
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(200); // Allow more time for scheduler calls
      
      // Verify nextDues are populated
      expect(result[0].nextDues).toBeDefined();
      expect(result[0].nextDues![1]).toBeDefined();
      expect(result[0].nextDues![2]).toBeDefined();
      expect(result[0].nextDues![3]).toBeDefined();
      expect(result[0].nextDues![4]).toBeDefined();
      
      console.log(`[Performance] Extracted nextDues for 1000 cards in ${duration.toFixed(2)}ms`);
    });

    it('should use fallback strategy efficiently when SchedulerRouter fails', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const mockScheduler = {
        preview: vi.fn(() => {
          throw new Error('Preview failed');
        }),
      } as any;
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(1000);
      // Error handling adds overhead, so allow more time (< 500ms is still acceptable)
      expect(duration).toBeLessThan(500);
      
      // Verify fallback nextDues are populated
      expect(result[0].nextDues).toBeDefined();
      
      console.log(`[Performance] Fallback nextDues for 1000 cards in ${duration.toFixed(2)}ms`);
    });

    it('should handle missing SchedulerRouter efficiently', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        // No schedulerRouter provided
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100);
      console.log(`[Performance] No scheduler, 1000 cards in ${duration.toFixed(2)}ms`);
    });
  });

  describe('msgpack Serialization Performance', () => {
    it('should serialize 100 cards to msgpack efficiently', () => {
      const cards = generateTestCards(100);

      const startTime = performance.now();
      const encoded = encode(cards);
      const duration = performance.now() - startTime;

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(duration).toBeLessThan(10);
      console.log(`[Performance] Serialized 100 cards to msgpack in ${duration.toFixed(2)}ms (${encoded.length} bytes)`);
    });

    it('should deserialize 100 cards from msgpack efficiently', () => {
      const cards = generateTestCards(100);
      const encoded = encode(cards);

      const startTime = performance.now();
      const decoded = decode(encoded);
      const duration = performance.now() - startTime;

      expect(decoded).toHaveLength(100);
      expect(duration).toBeLessThan(10);
      console.log(`[Performance] Deserialized 100 cards from msgpack in ${duration.toFixed(2)}ms`);
    });

    it('should serialize 1000 cards to msgpack efficiently', () => {
      const cards = generateTestCards(1000);

      const startTime = performance.now();
      const encoded = encode(cards);
      const duration = performance.now() - startTime;

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(duration).toBeLessThan(50);
      console.log(`[Performance] Serialized 1000 cards to msgpack in ${duration.toFixed(2)}ms (${encoded.length} bytes)`);
    });

    it('should deserialize 1000 cards from msgpack efficiently', () => {
      const cards = generateTestCards(1000);
      const encoded = encode(cards);

      const startTime = performance.now();
      const decoded = decode(encoded);
      const duration = performance.now() - startTime;

      expect(decoded).toHaveLength(1000);
      expect(duration).toBeLessThan(50);
      console.log(`[Performance] Deserialized 1000 cards from msgpack in ${duration.toFixed(2)}ms`);
    });

    it('should compare msgpack vs JSON performance', () => {
      const cards = generateTestCards(1000);

      // msgpack serialization
      const msgpackStartEncode = performance.now();
      const msgpackEncoded = encode(cards);
      const msgpackEncodeDuration = performance.now() - msgpackStartEncode;

      const msgpackStartDecode = performance.now();
      const msgpackDecoded = decode(msgpackEncoded);
      const msgpackDecodeDuration = performance.now() - msgpackStartDecode;

      // JSON serialization
      const jsonStartEncode = performance.now();
      const jsonEncoded = JSON.stringify(cards);
      const jsonEncodeDuration = performance.now() - jsonStartEncode;

      const jsonStartDecode = performance.now();
      const jsonDecoded = JSON.parse(jsonEncoded);
      const jsonDecodeDuration = performance.now() - jsonStartDecode;

      console.log(`[Performance Comparison] 1000 cards:`);
      console.log(`  msgpack: encode ${msgpackEncodeDuration.toFixed(2)}ms, decode ${msgpackDecodeDuration.toFixed(2)}ms, size ${msgpackEncoded.length} bytes`);
      console.log(`  JSON: encode ${jsonEncodeDuration.toFixed(2)}ms, decode ${jsonDecodeDuration.toFixed(2)}ms, size ${jsonEncoded.length} bytes`);
      console.log(`  Size reduction: ${((1 - msgpackEncoded.length / jsonEncoded.length) * 100).toFixed(1)}%`);

      expect(msgpackDecoded).toHaveLength(1000);
      expect(jsonDecoded).toHaveLength(1000);
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle 10000 cards with filter and sort', async () => {
      const now = Date.now();
      const cards = generateTestCards(10000);
      
      // Make 30% of them due
      cards.forEach((card, i) => {
        card.due = i < 3000 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(3000);
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
      console.log(`[Performance] Processed 10000 cards (filtered to 3000) in ${duration.toFixed(2)}ms`);
    });

    it('should handle 10000 cards with SchedulerRouter', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const mockScheduler = createMockSchedulerRouter();
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(duration).toBeLessThan(2000); // Allow 2 seconds for scheduler calls
      console.log(`[Performance] Processed 10000 cards with scheduler in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not create unnecessary copies of data', async () => {
      const cards = generateTestCards(1000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      // Call multiple times
      await dataSource.getAll();
      await dataSource.getAll();
      await dataSource.getAll();

      // Storage getAllCards is called twice per getAll (once for total count, once for filtering)
      // So 3 calls = 6 invocations
      expect(mockStorage.getAllCards).toHaveBeenCalled();
      expect(mockStorage.getAllCards).toHaveBeenCalledTimes(6);
    });

    it('should handle empty dataset efficiently', async () => {
      const mockStorage = createMockStorage([]);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(0);
      expect(duration).toBeLessThan(1);
      console.log(`[Performance] Empty dataset in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Performance Report', () => {
    it('should generate comprehensive performance report', async () => {
      const testSizes = [100, 1000, 10000];
      const report: any[] = [];

      for (const size of testSizes) {
        const cards = generateTestCards(size);
        const mockStorage = createMockStorage(cards);
        const mockScheduler = createMockSchedulerRouter();

        // Test 1: Basic read
        const ds1 = new LocalStorageDataSource({ storage: mockStorage });
        const t1 = performance.now();
        await ds1.getAll();
        const basicRead = performance.now() - t1;

        // Test 2: With filter
        const ds2 = new LocalStorageDataSource({
          storage: mockStorage,
          filter: (card) => card.due <= Date.now(),
        });
        const t2 = performance.now();
        await ds2.getAll();
        const withFilter = performance.now() - t2;

        // Test 3: With sort
        const ds3 = new LocalStorageDataSource({
          storage: mockStorage,
          sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
        });
        const t3 = performance.now();
        await ds3.getAll();
        const withSort = performance.now() - t3;

        // Test 4: With scheduler
        const ds4 = new LocalStorageDataSource({
          storage: mockStorage,
          schedulerRouter: mockScheduler,
        });
        const t4 = performance.now();
        await ds4.getAll();
        const withScheduler = performance.now() - t4;

        // Test 5: All features
        const ds5 = new LocalStorageDataSource({
          storage: mockStorage,
          filter: (card) => card.due <= Date.now(),
          sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
          schedulerRouter: mockScheduler,
        });
        const t5 = performance.now();
        await ds5.getAll();
        const allFeatures = performance.now() - t5;

        report.push({
          size,
          basicRead: basicRead.toFixed(2),
          withFilter: withFilter.toFixed(2),
          withSort: withSort.toFixed(2),
          withScheduler: withScheduler.toFixed(2),
          allFeatures: allFeatures.toFixed(2),
        });
      }

      console.log('\n=== LocalStorageDataSource Performance Report ===');
      console.table(report);
      console.log('All times in milliseconds (ms)');
      console.log('================================================\n');

      // Verify performance goals
      const report100 = report.find(r => r.size === 100);
      const report1000 = report.find(r => r.size === 1000);

      expect(parseFloat(report100.basicRead)).toBeLessThan(10);
      expect(parseFloat(report1000.basicRead)).toBeLessThan(100);
    });
  });
});
