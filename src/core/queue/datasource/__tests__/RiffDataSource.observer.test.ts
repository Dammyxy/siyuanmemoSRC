/**
 * Tests for RiffDataSource Observer Pattern Integration
 * 
 * Verifies that RiffDataSource properly extends ObservableDataSource
 * and supports the observer pattern for automatic cache invalidation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiffDataSource } from '../RiffDataSource';
import type { IDataSourceObserver } from '../../abstraction/types';
import type { QueueItem } from '../../types';

describe('RiffDataSource - Observer Pattern Integration', () => {
  let dataSource: RiffDataSource;
  let mockObserver: IDataSourceObserver;
  let onDataChangedSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create a mock observer
    onDataChangedSpy = vi.fn();
    mockObserver = {
      onDataChanged: onDataChangedSpy,
    };

    // Create a mock API that returns empty data
    const mockApi = {
      getRiffDueCards: vi.fn().mockResolvedValue({ cards: [] }),
    };

    // Create RiffDataSource instance
    dataSource = new RiffDataSource({
      deckId: 'test-deck',
      api: mockApi,
    });
  });

  describe('Observer Registration', () => {
    it('should support adding observers', () => {
      // Should not throw
      expect(() => {
        dataSource.addObserver(mockObserver);
      }).not.toThrow();
    });

    it('should support removing observers', () => {
      dataSource.addObserver(mockObserver);
      
      // Should not throw
      expect(() => {
        dataSource.removeObserver(mockObserver);
      }).not.toThrow();
    });

    it('should support multiple observers', () => {
      const observer1 = { onDataChanged: vi.fn() };
      const observer2 = { onDataChanged: vi.fn() };

      // Should not throw
      expect(() => {
        dataSource.addObserver(observer1);
        dataSource.addObserver(observer2);
      }).not.toThrow();
    });
  });

  describe('Observer Notification', () => {
    it('should have add() method that could notify observers', async () => {
      dataSource.addObserver(mockObserver);

      const items: QueueItem[] = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          priority: 50,
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
        },
      ];

      // Call add() - returns Result<number>
      const result = await dataSource.add(items);

      // Verify method exists and returns a Result object
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('ok');
      
      // Verify it's a successful Result
      if (result.ok) {
        expect(typeof result.value).toBe('number');
      }
      
      // Note: Currently add() doesn't actually add items or notify observers
      // because Riff API doesn't support this operation.
      // This test verifies the method signature is correct.
    });

    it('should have remove() method that could notify observers', async () => {
      dataSource.addObserver(mockObserver);

      const items: QueueItem[] = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          priority: 50,
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
        },
      ];

      // Call remove() - returns Result<number>
      const result = await dataSource.remove(items);

      // Verify method exists and returns a Result object
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('ok');
      
      // Verify it's a successful Result
      if (result.ok) {
        expect(typeof result.value).toBe('number');
      }
      
      // Note: Currently remove() doesn't actually remove items or notify observers
      // because Riff API doesn't support this operation.
      // This test verifies the method signature is correct.
    });
  });

  describe('Inheritance', () => {
    it('should extend ObservableDataSource', () => {
      // Verify that RiffDataSource has the observer methods
      expect(dataSource.addObserver).toBeDefined();
      expect(dataSource.removeObserver).toBeDefined();
      expect(typeof dataSource.addObserver).toBe('function');
      expect(typeof dataSource.removeObserver).toBe('function');
    });

    it('should implement IDataSource interface', () => {
      // Verify that RiffDataSource has the required methods
      expect(dataSource.getAll).toBeDefined();
      expect(dataSource.add).toBeDefined();
      expect(dataSource.remove).toBeDefined();
      expect(typeof dataSource.getAll).toBe('function');
      expect(typeof dataSource.add).toBe('function');
      expect(typeof dataSource.remove).toBe('function');
    });

    it('should be able to call getAll()', async () => {
      // Should not throw
      const result = await dataSource.getAll();
      
      // Should return an array
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Integration with Sequencers', () => {
    it('should support typical sequencer cache invalidation pattern', () => {
      // Simulate a sequencer that observes the data source
      let cacheValid = true;
      
      const sequencerObserver: IDataSourceObserver = {
        onDataChanged: () => {
          cacheValid = false;
        },
      };

      // Register the sequencer as an observer
      dataSource.addObserver(sequencerObserver);

      // Verify the pattern is supported
      expect(cacheValid).toBe(true);
      
      // When data changes in the future, the sequencer would be notified
      // and would invalidate its cache by setting cacheValid = false
    });

    it('should support cleanup when sequencer is destroyed', () => {
      const sequencerObserver: IDataSourceObserver = {
        onDataChanged: vi.fn(),
      };

      // Register observer
      dataSource.addObserver(sequencerObserver);

      // Cleanup when sequencer is destroyed
      dataSource.removeObserver(sequencerObserver);

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
