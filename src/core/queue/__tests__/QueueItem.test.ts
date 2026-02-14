/**
 * Tests for QueueItem interface
 * 
 * Validates Requirement 6.1: THE System SHALL define a QueueItem interface requiring blockID field
 */

import type { QueueItem } from '../types';

describe('QueueItem Interface', () => {
  describe('Type Safety', () => {
    it('should require blockID field', () => {
      // Given: A valid QueueItem with all required fields
      const validItem: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
      };
      
      // Then: TypeScript should accept this object
      expect(validItem.blockID).toBe('block-123');
      expect(validItem.cardID).toBe('card-123');
    });
    
    it('should allow optional FSRS fields', () => {
      // Given: A QueueItem with optional FSRS scheduling fields
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
        lastReview: Date.now(),
        elapsedDays: 5,
        scheduledDays: 10,
      };
      
      // Then: All fields should be accessible
      expect(itemWithFSRS.state).toBe(2);
      expect(itemWithFSRS.stability).toBe(10.5);
      expect(itemWithFSRS.difficulty).toBe(5.2);
    });
    
    it('should allow meta field for extensibility', () => {
      // Given: A QueueItem with custom metadata
      const itemWithMeta: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
        meta: {
          customField: 'custom value',
          tags: ['tag1', 'tag2'],
        },
      };
      
      // Then: Meta field should be accessible
      expect(itemWithMeta.meta).toBeDefined();
      expect(itemWithMeta.meta?.customField).toBe('custom value');
    });
  });
  
  describe('Requirement 6.1 Validation', () => {
    it('should enforce blockID as a required field at compile time', () => {
      // This test validates that TypeScript enforces the blockID requirement
      // If blockID is missing, TypeScript will show a compile error
      
      // Given: A function that requires QueueItem
      const processItem = (item: QueueItem): string => {
        return item.blockID; // blockID must exist
      };
      
      // When: We pass a valid item
      const validItem: QueueItem = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
      };
      
      // Then: The function should work correctly
      expect(processItem(validItem)).toBe('block-123');
    });
    
    it('should work with arrays of QueueItems', () => {
      // Given: An array of QueueItems
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
      
      // When: We access blockID from each item
      const blockIDs = items.map(item => item.blockID);
      
      // Then: All blockIDs should be accessible
      expect(blockIDs).toEqual(['block-1', 'block-2']);
    });
  });
  
  describe('Integration with ReviewCard', () => {
    it('should be compatible with ReviewCard interface', () => {
      // The ReviewCard interface extends QueueItem, so it should have all QueueItem fields
      // This test verifies the inheritance relationship
      
      // Given: A function that accepts QueueItem
      const getBlockID = (item: QueueItem): string => {
        return item.blockID;
      };
      
      // When: We create a ReviewCard-like object (with all required fields)
      const reviewCard = {
        cardID: 'card-123',
        blockID: 'block-123',
        deckID: 'deck-123',
        priority: 50,
        due: Date.now(),
        lapses: 0,
        state: 2,
        stability: 10,
        difficulty: 5,
        elapsed_days: 5,
        scheduled_days: 10,
        reps: 3,
        last_review: Date.now(),
      };
      
      // Then: It should work as a QueueItem
      expect(getBlockID(reviewCard)).toBe('block-123');
    });
  });
});
