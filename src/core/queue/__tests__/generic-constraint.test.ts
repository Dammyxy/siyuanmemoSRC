/**
 * Generic Constraint Tests
 * 
 * Validates Requirement 6.2: WHEN defining IQueue interface, THE System SHALL
 * constrain TItem to extend QueueItem
 * 
 * These tests verify that the generic type constraints are properly enforced
 * at compile time, ensuring all queue items have the required blockID field.
 */

import { describe, it, expect } from 'vitest';
import type { QueueItem } from '../types';
import type { IQueueStrategy } from '../abstraction/Strategy';
import type { ISequencer } from '../abstraction/types';

describe('Generic Type Constraints', () => {
  describe('QueueItem interface', () => {
    it('should require blockID field', () => {
      // This should compile - has all required fields
      const validItem: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
      };
      
      expect(validItem.blockID).toBe('block-123');
    });
    
    it('should allow optional FSRS fields', () => {
      const itemWithFSRS: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
        state: 2,
        stability: 10.5,
        difficulty: 5.2,
        reps: 3,
        lapses: 0,
      };
      
      expect(itemWithFSRS.state).toBe(2);
      expect(itemWithFSRS.stability).toBe(10.5);
    });
  });
  
  describe('IQueueStrategy generic constraint', () => {
    it('should accept types that extend QueueItem', () => {
      // Define a custom item type that extends QueueItem
      interface CustomCard extends QueueItem {
        customField: string;
      }
      
      // This should compile - CustomCard extends QueueItem
      const mockQueue: IQueueStrategy<CustomCard> = {
        getUIConfig: () => ({
          statsType: 'queue-size',
          showRatingButtons: true,
          allowSkip: true,
        }),
        next: async () => null,
        onFeedback: async () => {},
      };
      
      expect(mockQueue).toBeDefined();
    });
  });
  
  describe('ISequencer generic constraint', () => {
    it('should accept types that extend QueueItem', () => {
      // Define a simple sequencer
      const mockSequencer: ISequencer<QueueItem> = {
        next: async () => null,
      };
      
      expect(mockSequencer).toBeDefined();
    });
  });
  
  describe('Type safety verification', () => {
    it('should ensure blockID is always present', () => {
      // Create a function that requires QueueItem
      function getBlockID(item: QueueItem): string {
        // blockID is guaranteed to exist due to the interface
        return item.blockID;
      }
      
      const item: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-456',
        deckID: 'deck-789',
        priority: 50,
      };
      
      expect(getBlockID(item)).toBe('block-456');
    });
    
    it('should work with arrays of QueueItems', () => {
      const items: QueueItem[] = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'deck-1',
          priority: 50,
        },
        {
          cardID: 'card-2',
          blockID: 'block-2',
          deckID: 'deck-1',
          priority: 60,
        },
      ];
      
      // Extract all blockIDs - guaranteed to exist
      const blockIDs = items.map(item => item.blockID);
      
      expect(blockIDs).toEqual(['block-1', 'block-2']);
    });
  });
  
  describe('Compile-time type checking', () => {
    it('should demonstrate that the constraint is enforced', () => {
      // This test documents the compile-time behavior
      // The following code would NOT compile (commented out to avoid errors):
      
      // ❌ This would fail: missing blockID
      // const invalidItem: QueueItem = {
      //   cardID: 'card-123',
      //   // blockID: missing!
      //   deckID: 'deck-123',
      //   priority: 50,
      // };
      
      // ❌ This would fail: wrong type for blockID
      // const wrongType: QueueItem = {
      //   cardID: 'card-123',
      //   blockID: 123, // Should be string!
      //   deckID: 'deck-123',
      //   priority: 50,
      // };
      
      // ✅ This compiles: all required fields present
      const validItem: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
      };
      
      expect(validItem.blockID).toBe('block-123');
    });
  });
});
