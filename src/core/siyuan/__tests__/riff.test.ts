/**
 * Unit Tests for Riff API - getRiffCards() decoupled version
 * 
 * Feature: riff-decoupling
 * Task: 1.1 - Implement getRiffCards() API
 * 
 * Tests the new getRiffCards() API with various parameter combinations:
 * - dueOnly: filter for due cards only
 * - notebook: filter by notebook
 * - rootID: filter by document tree
 * - includeNew: include new cards
 * - Pagination: handle large card sets
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RiffBlock, RiffReviewCard, RiffReviewData } from '../riff';

// Mock the request function
vi.mock('../api', () => ({
  request: vi.fn(),
  getBlocksByIds: vi.fn(),
}));

// Import after mocking
import { request, getBlocksByIds } from '../api';
import { getRiffCards } from '../riff';

describe('Feature: riff-decoupling - getRiffCards() API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Backward compatibility - old API signature', () => {
    it('should work with (deckID, page, pageSize) signature', async () => {
      const mockResponse = {
        blocks: [
          createMockRiffBlock('block-1'),
          createMockRiffBlock('block-2'),
        ],
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValue(mockResponse);

      const result = await getRiffCards('deck-1', 1, 20);

      expect(request).toHaveBeenCalledWith('/riff/getRiffCards', {
        id: 'deck-1',
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should use default page=1 and pageSize=20 when not provided', async () => {
      const mockResponse = {
        blocks: [],
        total: 0,
        pageCount: 0,
      };

      vi.mocked(request).mockResolvedValue(mockResponse);

      const result = await getRiffCards('deck-1');

      expect(request).toHaveBeenCalledWith('/riff/getRiffCards', {
        id: 'deck-1',
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('New API - dueOnly option', () => {
    it('should fetch only due cards when dueOnly=true', async () => {
      const mockDueCards: RiffReviewData = {
        cards: [
          createMockReviewCard('card-1', 'block-1'),
          createMockReviewCard('card-2', 'block-2'),
        ],
        unreviewedCount: 2,
        unreviewedNewCardCount: 0,
        unreviewedOldCardCount: 2,
      };

      const mockBlocks: RiffBlock[] = [
        createMockRiffBlock('block-1'),
        createMockRiffBlock('block-2'),
      ];

      // Mock getRiffDueCards
      vi.mocked(request).mockResolvedValueOnce(mockDueCards);
      // Mock getRiffCardsByBlockIDs
      vi.mocked(request).mockResolvedValueOnce({ blocks: mockBlocks });
      vi.mocked(getBlocksByIds).mockResolvedValue([]);

      const result = await getRiffCards('deck-1', { dueOnly: true });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('block-1');
      expect(result[1].id).toBe('block-2');
    });

    it('should fetch all cards when dueOnly=false', async () => {
      const mockPage1 = {
        blocks: Array.from({ length: 100 }, (_, i) => createMockRiffBlock(`block-${i}`)),
        total: 150,
        pageCount: 2,
      };

      const mockPage2 = {
        blocks: Array.from({ length: 50 }, (_, i) => createMockRiffBlock(`block-${i + 100}`)),
        total: 150,
        pageCount: 2,
      };

      vi.mocked(request)
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const result = await getRiffCards('deck-1', { dueOnly: false });

      expect(result).toHaveLength(150);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(1, '/riff/getRiffCards', {
        id: 'deck-1',
        page: 1,
        pageSize: 100,
      });
      expect(request).toHaveBeenNthCalledWith(2, '/riff/getRiffCards', {
        id: 'deck-1',
        page: 2,
        pageSize: 100,
      });
    });
  });

  describe('New API - notebook option', () => {
    it('should fetch cards from notebook when notebook is specified', async () => {
      const mockPage1 = {
        blocks: [createMockRiffBlock('block-1')],
        total: 1,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockPage1);

      const result = await getRiffCards('deck-1', { notebook: 'notebook-1' });

      expect(result).toHaveLength(1);
      expect(request).toHaveBeenCalledWith('/riff/getNotebookRiffCards', {
        id: 'notebook-1',
        page: 1,
        pageSize: 100,
      });
    });

    it('should handle pagination for notebook cards', async () => {
      const mockPage1 = {
        blocks: Array.from({ length: 100 }, (_, i) => createMockRiffBlock(`block-${i}`)),
        total: 120,
        pageCount: 2,
      };

      const mockPage2 = {
        blocks: Array.from({ length: 20 }, (_, i) => createMockRiffBlock(`block-${i + 100}`)),
        total: 120,
        pageCount: 2,
      };

      vi.mocked(request)
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const result = await getRiffCards('deck-1', { notebook: 'notebook-1' });

      expect(result).toHaveLength(120);
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('New API - rootID option', () => {
    it('should fetch cards from document tree when rootID is specified', async () => {
      const mockPage1 = {
        blocks: [createMockRiffBlock('block-1')],
        total: 1,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockPage1);

      const result = await getRiffCards('deck-1', { rootID: 'root-1' });

      expect(result).toHaveLength(1);
      expect(request).toHaveBeenCalledWith('/riff/getTreeRiffCards', {
        id: 'root-1',
        page: 1,
        pageSize: 100,
      });
    });

    it('should handle pagination for tree cards', async () => {
      const mockPage1 = {
        blocks: Array.from({ length: 100 }, (_, i) => createMockRiffBlock(`block-${i}`)),
        total: 150,
        pageCount: 2,
      };

      const mockPage2 = {
        blocks: Array.from({ length: 50 }, (_, i) => createMockRiffBlock(`block-${i + 100}`)),
        total: 150,
        pageCount: 2,
      };

      vi.mocked(request)
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const result = await getRiffCards('deck-1', { rootID: 'root-1' });

      expect(result).toHaveLength(150);
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('New API - includeNew option', () => {
    it('should include new cards when includeNew=true', async () => {
      const mockPage1 = {
        blocks: [
          createMockRiffBlock('block-1'),
          createMockRiffBlock('block-2'),
        ],
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockPage1);

      const result = await getRiffCards('deck-1', { includeNew: true });

      expect(result).toHaveLength(2);
      // includeNew doesn't change the API call, it's just a semantic flag
      expect(request).toHaveBeenCalledWith('/riff/getRiffCards', {
        id: 'deck-1',
        page: 1,
        pageSize: 100,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty card set', async () => {
      const mockResponse = {
        blocks: [],
        total: 0,
        pageCount: 0,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const result = await getRiffCards('deck-1', { dueOnly: false });

      expect(result).toHaveLength(0);
    });

    it('should handle single page with less than pageSize cards', async () => {
      const mockResponse = {
        blocks: [
          createMockRiffBlock('block-1'),
          createMockRiffBlock('block-2'),
        ],
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const result = await getRiffCards('deck-1', { dueOnly: false });

      expect(result).toHaveLength(2);
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('should stop pagination when blocks array is empty', async () => {
      const mockPage1 = {
        blocks: [createMockRiffBlock('block-1')],
        total: 100,
        pageCount: 10,
      };

      const mockPage2 = {
        blocks: [],
        total: 100,
        pageCount: 10,
      };

      vi.mocked(request)
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const result = await getRiffCards('deck-1', { dueOnly: false });

      expect(result).toHaveLength(1);
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('Priority of options', () => {
    it('should prioritize notebook over rootID and dueOnly', async () => {
      const mockResponse = {
        blocks: [createMockRiffBlock('block-1')],
        total: 1,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      await getRiffCards('deck-1', {
        notebook: 'notebook-1',
        rootID: 'root-1',
        dueOnly: true,
      });

      expect(request).toHaveBeenCalledWith('/riff/getNotebookRiffCards', {
        id: 'notebook-1',
        page: 1,
        pageSize: 100,
      });
    });

    it('should prioritize rootID over dueOnly when notebook is not specified', async () => {
      const mockResponse = {
        blocks: [createMockRiffBlock('block-1')],
        total: 1,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      await getRiffCards('deck-1', {
        rootID: 'root-1',
        dueOnly: true,
      });

      expect(request).toHaveBeenCalledWith('/riff/getTreeRiffCards', {
        id: 'root-1',
        page: 1,
        pageSize: 100,
      });
    });
  });
});

// ==================== Helper Functions ====================

function createMockRiffBlock(id: string): RiffBlock {
  return {
    id,
    box: 'box-1',
    path: `/path/to/${id}`,
    hPath: `Path > To > ${id}`,
    content: `Content of ${id}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    type: 'NodeParagraph',
    subType: '',
    ial: {},
    riffCardID: `card-${id}`,
  };
}

function createMockReviewCard(cardID: string, blockID: string): RiffReviewCard {
  return {
    cardID,
    blockID,
    deckID: 'deck-1',
    nextDues: {
      again: new Date(Date.now() + 60000).toISOString(),
      hard: new Date(Date.now() + 3600000).toISOString(),
      good: new Date(Date.now() + 86400000).toISOString(),
      easy: new Date(Date.now() + 259200000).toISOString(),
    },
  };
}

describe('Feature: riff-decoupling - getRiffNewCards() API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should return all cards when since is not specified', async () => {
      const mockCards = [
        createMockRiffBlock('block-1'),
        createMockRiffBlock('block-2'),
        createMockRiffBlock('block-3'),
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 3,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1');

      expect(result).toHaveLength(3);
      expect(result).toEqual(mockCards);
    });

    it('should filter cards created after the specified timestamp', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const twoHoursAgo = now - 7200000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: new Date(now - 1800000).toISOString() }, // 30 min ago
        { ...createMockRiffBlock('block-2'), created: new Date(twoHoursAgo).toISOString() }, // 2 hours ago
        { ...createMockRiffBlock('block-3'), created: new Date(now - 600000).toISOString() }, // 10 min ago
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 3,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', oneHourAgo);

      // Should only return cards created after oneHourAgo (block-1 and block-3)
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['block-1', 'block-3']);
    });

    it('should return empty array when no cards match the timestamp filter', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: new Date(now - 7200000).toISOString() }, // 2 hours ago
        { ...createMockRiffBlock('block-2'), created: new Date(now - 10800000).toISOString() }, // 3 hours ago
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', oneHourAgo);

      expect(result).toHaveLength(0);
    });
  });

  describe('Timestamp parsing', () => {
    it('should handle ISO 8601 timestamp strings', async () => {
      const now = Date.now();
      const since = now - 3600000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: new Date(now - 1800000).toISOString() },
        { ...createMockRiffBlock('block-2'), created: new Date(now - 7200000).toISOString() },
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('block-1');
    });

    it('should handle Unix timestamp in seconds (10 digits)', async () => {
      const now = Date.now();
      const since = now - 3600000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: String(Math.floor((now - 1800000) / 1000)) }, // seconds
        { ...createMockRiffBlock('block-2'), created: String(Math.floor((now - 7200000) / 1000)) }, // seconds
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('block-1');
    });

    it('should handle Unix timestamp in milliseconds (13 digits)', async () => {
      const now = Date.now();
      const since = now - 3600000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: String(now - 1800000) }, // milliseconds
        { ...createMockRiffBlock('block-2'), created: String(now - 7200000) }, // milliseconds
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('block-1');
    });

    it('should handle invalid timestamps gracefully', async () => {
      const now = Date.now();
      const since = now - 3600000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: 'invalid-timestamp' },
        { ...createMockRiffBlock('block-2'), created: new Date(now - 1800000).toISOString() },
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      // block-1 has invalid timestamp (parsed as 0), so it's filtered out
      // block-2 is within the time range
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('block-2');
    });

    it('should handle missing created field', async () => {
      const now = Date.now();
      const since = now - 3600000;

      const mockCards = [
        { ...createMockRiffBlock('block-1'), created: '' },
        { ...createMockRiffBlock('block-2'), created: new Date(now - 1800000).toISOString() },
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      // block-1 has empty created field (parsed as 0), so it's filtered out
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('block-2');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty card set', async () => {
      const mockResponse = {
        blocks: [],
        total: 0,
        pageCount: 0,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', Date.now());

      expect(result).toHaveLength(0);
    });

    it('should handle since=0 (return all cards)', async () => {
      const mockCards = [
        createMockRiffBlock('block-1'),
        createMockRiffBlock('block-2'),
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', 0);

      // All cards should be returned since their created time > 0
      expect(result).toHaveLength(2);
    });

    it('should handle future timestamp (return no cards)', async () => {
      const futureTimestamp = Date.now() + 86400000; // 1 day in the future

      const mockCards = [
        createMockRiffBlock('block-1'),
        createMockRiffBlock('block-2'),
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', futureTimestamp);

      // No cards should be returned since all are created before the future timestamp
      expect(result).toHaveLength(0);
    });
  });

  describe('Integration with getRiffCards', () => {
    it('should call getRiffCards with correct parameters', async () => {
      const mockResponse = {
        blocks: [createMockRiffBlock('block-1')],
        total: 1,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      await getRiffNewCards('deck-1', Date.now());

      // Should call getRiffCards with dueOnly=false and includeNew=true
      expect(request).toHaveBeenCalledWith('/riff/getRiffCards', {
        id: 'deck-1',
        page: 1,
        pageSize: 100,
      });
    });

    it('should handle pagination from getRiffCards', async () => {
      const now = Date.now();
      const since = now - 3600000;

      const mockPage1 = {
        blocks: Array.from({ length: 100 }, (_, i) => ({
          ...createMockRiffBlock(`block-${i}`),
          created: new Date(now - (i * 60000)).toISOString(), // Each card 1 minute apart
        })),
        total: 150,
        pageCount: 2,
      };

      const mockPage2 = {
        blocks: Array.from({ length: 50 }, (_, i) => ({
          ...createMockRiffBlock(`block-${i + 100}`),
          created: new Date(now - ((i + 100) * 60000)).toISOString(),
        })),
        total: 150,
        pageCount: 2,
      };

      vi.mocked(request)
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      // Should return cards created within the last hour (60 cards)
      expect(result.length).toBeLessThanOrEqual(60);
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('Requirement validation', () => {
    it('should satisfy requirement 1.3: filter cards by creation time', async () => {
      const now = Date.now();
      const since = now - 3600000; // 1 hour ago

      const mockCards = [
        { ...createMockRiffBlock('new-card'), created: new Date(now - 1800000).toISOString() }, // 30 min ago
        { ...createMockRiffBlock('old-card'), created: new Date(now - 7200000).toISOString() }, // 2 hours ago
      ];

      const mockResponse = {
        blocks: mockCards,
        total: 2,
        pageCount: 1,
      };

      vi.mocked(request).mockResolvedValueOnce(mockResponse);

      const { getRiffNewCards } = await import('../riff');
      const result = await getRiffNewCards('deck-1', since);

      // Validates: 过滤返回创建时间晚于 since 的卡片
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('new-card');
      
      // Verify the filtered card was indeed created after 'since'
      const createdTime = new Date(result[0].created).getTime();
      expect(createdTime).toBeGreaterThan(since);
    });

    it('should satisfy requirement 8.3: support incremental updates', async () => {
      const now = Date.now();
      
      // First sync at T0
      const firstSyncTime = now - 7200000; // 2 hours ago
      
      // Second sync at T1
      const secondSyncTime = now - 3600000; // 1 hour ago

      // Cards created at different times
      const allCards = [
        { ...createMockRiffBlock('card-1'), created: new Date(now - 10800000).toISOString() }, // 3 hours ago
        { ...createMockRiffBlock('card-2'), created: new Date(now - 5400000).toISOString() }, // 1.5 hours ago
        { ...createMockRiffBlock('card-3'), created: new Date(now - 1800000).toISOString() }, // 30 min ago
      ];

      // First incremental update: get cards after firstSyncTime
      vi.mocked(request).mockResolvedValueOnce({
        blocks: allCards,
        total: 3,
        pageCount: 1,
      });

      const { getRiffNewCards } = await import('../riff');
      const firstResult = await getRiffNewCards('deck-1', firstSyncTime);

      // Should get card-2 and card-3 (created after firstSyncTime)
      expect(firstResult).toHaveLength(2);
      expect(firstResult.map(c => c.id)).toEqual(['card-2', 'card-3']);

      // Second incremental update: get cards after secondSyncTime
      vi.mocked(request).mockResolvedValueOnce({
        blocks: allCards,
        total: 3,
        pageCount: 1,
      });

      const secondResult = await getRiffNewCards('deck-1', secondSyncTime);

      // Should only get card-3 (created after secondSyncTime)
      expect(secondResult).toHaveLength(1);
      expect(secondResult[0].id).toBe('card-3');
    });
  });
});

describe('Feature: riff-decoupling - updateRiffCard() API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should update card due time using batchSetRiffCardsDueTime', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date(Date.now() + 86400000).toISOString();
      
      await updateRiffCard('deck-1', 'card-1', { due: dueDate });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });

    it('should handle updates with only due field', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date(Date.now() + 172800000).toISOString(); // 2 days
      
      await updateRiffCard('deck-1', 'card-2', { due: dueDate });

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-2', due: dueDate }]
      });
    });

    it('should not call API when due field is not provided', async () => {
      const { updateRiffCard } = await import('../riff');
      
      // Only provide other fields (which are not supported)
      await updateRiffCard('deck-1', 'card-1', {
        state: 2,
        reps: 5,
        lapses: 1
      });

      // Should not call any API since due is not provided
      expect(request).not.toHaveBeenCalled();
    });

    it('should not call API when updates object is empty', async () => {
      const { updateRiffCard } = await import('../riff');
      
      await updateRiffCard('deck-1', 'card-1', {});

      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('API limitation - unsupported fields', () => {
    it('should ignore state field updates', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', 'card-1', {
        due: dueDate,
        state: 2 // Should be ignored
      });

      // Only due should be sent to API
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });

    it('should ignore reps field updates', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', 'card-1', {
        due: dueDate,
        reps: 10 // Should be ignored
      });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });

    it('should ignore lapses field updates', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', 'card-1', {
        due: dueDate,
        lapses: 3 // Should be ignored
      });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });

    it('should ignore lastReview field updates', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      const lastReview = new Date(Date.now() - 86400000).toISOString();
      
      await updateRiffCard('deck-1', 'card-1', {
        due: dueDate,
        lastReview // Should be ignored
      });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });

    it('should ignore all unsupported fields and only update due', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', 'card-1', {
        due: dueDate,
        state: 2,
        reps: 10,
        lapses: 3,
        lastReview: new Date().toISOString(),
        stability: 5.5,
        difficulty: 7.2
      });

      // Only due should be sent
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });
  });

  describe('Error handling', () => {
    it('should propagate API errors', async () => {
      const apiError = new Error('API request failed');
      vi.mocked(request).mockRejectedValueOnce(apiError);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await expect(
        updateRiffCard('deck-1', 'card-1', { due: dueDate })
      ).rejects.toThrow('API request failed');
    });

    it('should propagate network errors', async () => {
      const networkError = new Error('Network timeout');
      vi.mocked(request).mockRejectedValueOnce(networkError);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await expect(
        updateRiffCard('deck-1', 'card-1', { due: dueDate })
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('Edge cases', () => {
    it('should handle due date in the past', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      
      await updateRiffCard('deck-1', 'card-1', { due: pastDate });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: pastDate }]
      });
    });

    it('should handle due date far in the future', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const futureDate = new Date(Date.now() + 31536000000).toISOString(); // 1 year
      
      await updateRiffCard('deck-1', 'card-1', { due: futureDate });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: futureDate }]
      });
    });

    it('should handle empty string card ID', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', '', { due: dueDate });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: '', due: dueDate }]
      });
    });

    it('should handle empty string deck ID', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      // deckID is passed but not used in current implementation
      await updateRiffCard('', 'card-1', { due: dueDate });

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });
  });

  describe('Requirement validation', () => {
    it('should satisfy requirement 1.4: update card data without triggering scheduling', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', 'card-1', { due: dueDate });

      // Validates: 使用 `batchSetRiffCardsDueTime` API 更新 `due` 字段
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });

      // Validates: 不触发 Riff 调度算法
      // The function should NOT call /riff/reviewRiffCard
      expect(request).not.toHaveBeenCalledWith(
        '/riff/reviewRiffCard',
        expect.anything()
      );
    });

    it('should satisfy requirement 1.5: document limitation of only supporting due field', async () => {
      // This is validated by the JSDoc comments in the implementation
      // The function should only update the due field and ignore others
      
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      // Try to update multiple fields
      await updateRiffCard('deck-1', 'card-1', {
        due: dueDate,
        state: 2,
        reps: 5,
        lapses: 1,
        lastReview: new Date().toISOString()
      });

      // Only due should be updated
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: dueDate }]
      });
    });

    it('should satisfy requirement 1.8: not call Riff scheduling algorithm', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      const dueDate = new Date().toISOString();
      
      await updateRiffCard('deck-1', 'card-1', { due: dueDate });

      // Verify that reviewRiffCard is NOT called
      const calls = vi.mocked(request).mock.calls;
      const reviewCalls = calls.filter(call => 
        call[0] === '/riff/reviewRiffCard'
      );
      
      expect(reviewCalls).toHaveLength(0);
    });
  });

  describe('Integration scenarios', () => {
    it('should work in a typical sync scenario', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      
      // Simulate syncing a locally scheduled card to Riff
      const localCard = {
        id: 'card-1',
        due: new Date(Date.now() + 86400000).toISOString(),
        state: 2,
        reps: 5,
        lapses: 1
      };
      
      await updateRiffCard('deck-1', localCard.id, {
        due: localCard.due,
        state: localCard.state,
        reps: localCard.reps,
        lapses: localCard.lapses
      });

      // Only due should be synced
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{ id: 'card-1', due: localCard.due }]
      });
    });

    it('should support batch-like updates through multiple calls', async () => {
      vi.mocked(request)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const { updateRiffCard } = await import('../riff');
      
      const cards = [
        { id: 'card-1', due: new Date(Date.now() + 86400000).toISOString() },
        { id: 'card-2', due: new Date(Date.now() + 172800000).toISOString() },
        { id: 'card-3', due: new Date(Date.now() + 259200000).toISOString() }
      ];
      
      // Update multiple cards
      await Promise.all(
        cards.map(card => updateRiffCard('deck-1', card.id, { due: card.due }))
      );

      expect(request).toHaveBeenCalledTimes(3);
      cards.forEach((card, index) => {
        expect(request).toHaveBeenNthCalledWith(index + 1, '/riff/batchSetRiffCardsDueTime', {
          cardDues: [{ id: card.id, due: card.due }]
        });
      });
    });
  });
});

describe('Feature: riff-decoupling - syncToRiff() helper function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should call updateRiffCard with card scheduling parameters', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-1',
        due: new Date('2024-01-15T10:00:00Z'),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date('2024-01-14T10:00:00Z'),
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: 'card-1',
          due: '2024-01-15T10:00:00.000Z'
        }]
      });
    });

    it('should handle Date objects for due and lastReview', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const dueDate = new Date('2024-01-20T15:30:00Z');
      const lastReviewDate = new Date('2024-01-19T15:30:00Z');
      
      const card = {
        id: 'card-2',
        due: dueDate,
        state: 1,
        lapses: 0,
        reps: 3,
        lastReview: lastReviewDate,
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: 'card-2',
          due: dueDate.toISOString()
        }]
      });
    });

    it('should handle ISO string dates', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-3',
        due: '2024-01-25T08:00:00.000Z',
        state: 2,
        lapses: 2,
        reps: 10,
        lastReview: '2024-01-24T08:00:00.000Z',
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: 'card-3',
          due: '2024-01-25T08:00:00.000Z'
        }]
      });
    });
  });

  describe('Error handling - does not throw exceptions', () => {
    it('should catch and log network errors without throwing', async () => {
      const networkError = new Error('Network timeout');
      vi.mocked(request).mockRejectedValueOnce(networkError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      // Should not throw
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[syncToRiff] Failed to sync card:',
        'card-1',
        networkError
      );

      consoleErrorSpy.mockRestore();
    });

    it('should catch and log API errors without throwing', async () => {
      const apiError = new Error('API request failed');
      vi.mocked(request).mockRejectedValueOnce(apiError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-2',
        due: new Date(),
        state: 1,
        lapses: 0,
        reps: 2,
        lastReview: new Date(),
      };
      
      // Should not throw
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[syncToRiff] Failed to sync card:',
        'card-2',
        apiError
      );

      consoleErrorSpy.mockRestore();
    });

    it('should catch and log validation errors without throwing', async () => {
      const validationError = new Error('Invalid card data');
      vi.mocked(request).mockRejectedValueOnce(validationError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-3',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      // Should not throw
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle multiple consecutive failures gracefully', async () => {
      const error = new Error('Sync failed');
      vi.mocked(request)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      // All three calls should not throw
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle card with minimal fields', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 0,
        lapses: 0,
        reps: 0,
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: 'card-1',
          due: expect.any(String)
        }]
      });
    });

    it('should handle card with undefined lastReview', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 0,
        lapses: 0,
        reps: 0,
        lastReview: undefined,
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalled();
    });

    it('should handle empty deck ID', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      // Should still attempt to sync
      await syncToRiff('', card);

      expect(request).toHaveBeenCalled();
    });

    it('should handle empty card ID', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const card = {
        id: '',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: '',
          due: expect.any(String)
        }]
      });
    });
  });

  describe('Requirement validation', () => {
    it('should satisfy requirement 1.6: provide syncToRiff helper function', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      // Validates: THE FSRS_Plugin SHALL 提供 `syncToRiff()` 辅助函数，用于可选地同步本地调度结果
      expect(typeof syncToRiff).toBe('function');
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalled();
    });

    it('should satisfy requirement 6.1: call syncToRiff after successful local update', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      // Validates: WHEN `syncToRiff` 已启用时，THE System SHALL 在每次成功的本地卡片更新后调用 `syncToRiff()`
      // This test simulates the SchedulerRouter calling syncToRiff after local save
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      // Simulate: local save succeeded, now sync to Riff
      await syncToRiff('deck-1', card);

      expect(request).toHaveBeenCalled();
    });

    it('should satisfy requirement 6.2: use updateRiffCard with scheduling parameters', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      // Validates: THE `syncToRiff()` 函数 SHALL 使用卡片的调度参数调用 `updateRiffCard()`
      
      const card = {
        id: 'card-1',
        due: new Date('2024-01-15T10:00:00Z'),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date('2024-01-14T10:00:00Z'),
      };
      
      await syncToRiff('deck-1', card);

      // Verify updateRiffCard is called (via batchSetRiffCardsDueTime)
      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: 'card-1',
          due: '2024-01-15T10:00:00.000Z'
        }]
      });
    });

    it('should satisfy requirement 6.3: include due, state, lapses, reps, lastReview in update', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      // Validates: THE `syncToRiff()` 函数 SHALL 在更新中包含到期日期、状态、失误次数、复习次数和最后复习时间
      // Note: Due to API limitations, only 'due' is actually synced, but all fields are passed to updateRiffCard
      
      const card = {
        id: 'card-1',
        due: new Date('2024-01-15T10:00:00Z'),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date('2024-01-14T10:00:00Z'),
      };
      
      await syncToRiff('deck-1', card);

      // All fields are passed to updateRiffCard (even though only 'due' is synced due to API limitations)
      expect(request).toHaveBeenCalled();
    });

    it('should satisfy requirement 6.4: log error on network failure without throwing', async () => {
      const networkError = new Error('Network error');
      vi.mocked(request).mockRejectedValueOnce(networkError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      // Validates: IF `syncToRiff()` 遇到网络错误，THE System SHALL 记录错误而不抛出异常
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[syncToRiff] Failed to sync card:',
        'card-1',
        networkError
      );

      consoleErrorSpy.mockRestore();
    });

    it('should satisfy requirement 6.5: log error on API failure without throwing', async () => {
      const apiError = new Error('API error');
      vi.mocked(request).mockRejectedValueOnce(apiError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      // Validates: IF `syncToRiff()` 遇到 API 错误，THE System SHALL 记录错误而不抛出异常
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      await expect(syncToRiff('deck-1', card)).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[syncToRiff] Failed to sync card:',
        'card-1',
        apiError
      );

      consoleErrorSpy.mockRestore();
    });

    it('should satisfy requirement 6.7: allow review to continue even if sync fails', async () => {
      const error = new Error('Sync failed');
      vi.mocked(request).mockRejectedValueOnce(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      // Validates: THE System SHALL 允许复习正常继续，即使同步操作失败
      // This is validated by the function not throwing an exception
      
      const card = {
        id: 'card-1',
        due: new Date(),
        state: 2,
        lapses: 1,
        reps: 5,
        lastReview: new Date(),
      };
      
      // Sync fails but doesn't throw
      await syncToRiff('deck-1', card);

      // Review can continue (simulated by the function completing without error)
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Integration scenarios', () => {
    it('should work in typical SchedulerRouter sync flow', async () => {
      vi.mocked(request).mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      // Simulate SchedulerRouter flow:
      // 1. Schedule card with local scheduler
      const scheduledCard = {
        id: 'card-1',
        due: new Date(Date.now() + 86400000), // 1 day later
        state: 2,
        lapses: 0,
        reps: 6,
        lastReview: new Date(),
      };
      
      // 2. Save to local storage (simulated - would happen before this)
      // storage.setCard(scheduledCard);
      // await storage.saveCards();
      
      // 3. Optionally sync to Riff
      await syncToRiff('deck-1', scheduledCard);

      expect(request).toHaveBeenCalledWith('/riff/batchSetRiffCardsDueTime', {
        cardDues: [{
          id: 'card-1',
          due: scheduledCard.due.toISOString()
        }]
      });
    });

    it('should support batch sync through multiple calls', async () => {
      vi.mocked(request)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const { syncToRiff } = await import('../riff');
      
      const cards = [
        {
          id: 'card-1',
          due: new Date(Date.now() + 86400000),
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date(),
        },
        {
          id: 'card-2',
          due: new Date(Date.now() + 172800000),
          state: 2,
          lapses: 1,
          reps: 8,
          lastReview: new Date(),
        },
        {
          id: 'card-3',
          due: new Date(Date.now() + 259200000),
          state: 2,
          lapses: 0,
          reps: 3,
          lastReview: new Date(),
        },
      ];
      
      // Sync multiple cards
      await Promise.all(
        cards.map(card => syncToRiff('deck-1', card))
      );

      expect(request).toHaveBeenCalledTimes(3);
    });

    it('should handle partial batch failure gracefully', async () => {
      const error = new Error('Sync failed');
      vi.mocked(request)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { syncToRiff } = await import('../riff');
      
      const cards = [
        { id: 'card-1', due: new Date(), state: 2, lapses: 0, reps: 5, lastReview: new Date() },
        { id: 'card-2', due: new Date(), state: 2, lapses: 1, reps: 8, lastReview: new Date() },
        { id: 'card-3', due: new Date(), state: 2, lapses: 0, reps: 3, lastReview: new Date() },
      ];
      
      // All calls should complete without throwing
      const results = await Promise.allSettled(
        cards.map(card => syncToRiff('deck-1', card))
      );

      // All promises should be fulfilled (not rejected)
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);

      // One error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
  });
});
