import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopicFilter } from '../TopicFilter';
import type { QueueItem } from '../../types';
import * as api from '@/core/siyuan/api';

// Mock the sql function
vi.mock('@/core/siyuan/api', () => ({
  sql: vi.fn(),
}));

describe('TopicFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockQueueItem = (blockID: string): QueueItem => ({
    cardID: blockID,
    blockID,
    deckID: 'test-deck',
    priority: 50,
    nextDues: null,
    state: 0,
    lapses: 0,
    reps: 0,
  });

  describe('filterItemsOnly', () => {
    it('should return empty array for empty input', async () => {
      const result = await TopicFilter.filterItemsOnly([]);
      expect(result).toEqual([]);
    });

    it('should filter out topic cards', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
        createMockQueueItem('block-3'),
      ];

      // Mock SQL response: block-2 is a topic
      vi.mocked(api.sql).mockResolvedValue([
        { block_id: 'block-2', value: 'topic' },
      ]);

      const result = await TopicFilter.filterItemsOnly(items);

      expect(result).toHaveLength(2);
      expect(result.map(item => item.blockID)).toEqual(['block-1', 'block-3']);
    });

    it('should treat cards without type attribute as items', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
      ];

      // Mock SQL response: no cards have the attribute
      vi.mocked(api.sql).mockResolvedValue([]);

      const result = await TopicFilter.filterItemsOnly(items);

      expect(result).toHaveLength(2);
      expect(result).toEqual(items);
    });

    it('should return all cards on error (backward compatible)', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
      ];

      // Mock SQL error
      vi.mocked(api.sql).mockRejectedValue(new Error('Database error'));

      const result = await TopicFilter.filterItemsOnly(items);

      expect(result).toEqual(items);
    });
  });

  describe('filterTopicsOnly', () => {
    it('should return empty array for empty input', async () => {
      const result = await TopicFilter.filterTopicsOnly([]);
      expect(result).toEqual([]);
    });

    it('should filter out item cards', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
        createMockQueueItem('block-3'),
      ];

      // Mock SQL response: block-2 is a topic
      vi.mocked(api.sql).mockResolvedValue([
        { block_id: 'block-2', value: 'topic' },
      ]);

      const result = await TopicFilter.filterTopicsOnly(items);

      expect(result).toHaveLength(1);
      expect(result[0].blockID).toBe('block-2');
    });

    it('should return empty array on error (safer for topics)', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
      ];

      // Mock SQL error
      vi.mocked(api.sql).mockRejectedValue(new Error('Database error'));

      const result = await TopicFilter.filterTopicsOnly(items);

      expect(result).toEqual([]);
    });
  });

  describe('separateTopicAndItem', () => {
    it('should return empty arrays for empty input', async () => {
      const result = await TopicFilter.separateTopicAndItem([]);
      expect(result).toEqual({ topics: [], items: [] });
    });

    it('should separate topics and items correctly', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
        createMockQueueItem('block-3'),
        createMockQueueItem('block-4'),
      ];

      // Mock SQL response: block-2 and block-4 are topics
      vi.mocked(api.sql).mockResolvedValue([
        { block_id: 'block-2', value: 'topic' },
        { block_id: 'block-4', value: 'topic' },
      ]);

      const result = await TopicFilter.separateTopicAndItem(items);

      expect(result.topics).toHaveLength(2);
      expect(result.topics.map(item => item.blockID)).toEqual(['block-2', 'block-4']);
      expect(result.items).toHaveLength(2);
      expect(result.items.map(item => item.blockID)).toEqual(['block-1', 'block-3']);
    });

    it('should treat all cards as items on error', async () => {
      const items = [
        createMockQueueItem('block-1'),
        createMockQueueItem('block-2'),
      ];

      // Mock SQL error
      vi.mocked(api.sql).mockRejectedValue(new Error('Database error'));

      const result = await TopicFilter.separateTopicAndItem(items);

      expect(result.topics).toEqual([]);
      expect(result.items).toEqual(items);
    });
  });

  describe('batch processing', () => {
    it('should handle large number of cards in batches', async () => {
      // Create 500 cards (should be processed in 3 batches: 200, 200, 100)
      const items = Array.from({ length: 500 }, (_, i) => 
        createMockQueueItem(`block-${i}`)
      );

      vi.mocked(api.sql).mockResolvedValue([]);

      await TopicFilter.filterItemsOnly(items);

      // Should call sql 3 times (500 cards / 200 per batch = 3 batches)
      expect(api.sql).toHaveBeenCalledTimes(3);
    });
  });
});
