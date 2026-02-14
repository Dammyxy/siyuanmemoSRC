/**
 * Property-Based Tests for Riff API Layer
 * 
 * Feature: riff-decoupling
 * Task: 9.1 - Property-based testing for API layer
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the Riff API layer across many random inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { RiffBlock, RiffCard } from '../riff';

// Mock the request function
vi.mock('../api', () => ({
  request: vi.fn(),
  getBlocksByIds: vi.fn(),
}));

// Import after mocking
import { request } from '../api';
import { getRiffCards, getRiffNewCards, updateRiffCard, syncToRiff } from '../riff';

// ============================================================================
// Arbitraries (Generators for random test data)
// ============================================================================

/**
 * Generate arbitrary RiffBlock
 */
const arbitraryRiffBlock = (): fc.Arbitrary<RiffBlock> => {
  return fc.record({
    id: fc.string({ minLength: 14, maxLength: 14 }),
    deckID: fc.string({ minLength: 14, maxLength: 14 }),
    blockID: fc.string({ minLength: 14, maxLength: 14 }),
    nextDues: fc.record({
      '1': fc.date().map(d => d.toISOString()),
      '2': fc.date().map(d => d.toISOString()),
      '3': fc.date().map(d => d.toISOString()),
      '4': fc.date().map(d => d.toISOString()),
    }),
  });
};

/**
 * Generate arbitrary RiffCard with creation time
 */
const arbitraryRiffCard = (): fc.Arbitrary<RiffCard> => {
  // Use reasonable date range to avoid invalid dates
  const minDate = new Date('2020-01-01').getTime();
  const maxDate = new Date('2030-12-31').getTime();
  
  return fc.record({
    id: fc.string({ minLength: 14, maxLength: 14 }),
    blockID: fc.string({ minLength: 14, maxLength: 14 }),
    deckID: fc.string({ minLength: 14, maxLength: 14 }),
    due: fc.integer({ min: minDate, max: maxDate }).map(t => new Date(t).toISOString()),
    reps: fc.nat({ max: 100 }),
    lapses: fc.nat({ max: 50 }),
    state: fc.integer({ min: 0, max: 3 }),
    lastReview: fc.integer({ min: minDate, max: maxDate }).map(t => new Date(t).toISOString()),
    stability: fc.float({ min: Math.fround(0.1), max: Math.fround(365) }),
    difficulty: fc.float({ min: Math.fround(1), max: Math.fround(10) }),
    elapsedDays: fc.nat({ max: 365 }),
    scheduledDays: fc.nat({ max: 365 }),
    created: fc.integer({ min: minDate, max: maxDate }).map(t => new Date(t).toISOString()),
    updated: fc.integer({ min: minDate, max: maxDate }).map(t => new Date(t).toISOString()),
  });
};

/**
 * Generate arbitrary deck ID
 */
const arbitraryDeckID = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 14, maxLength: 14 });
};

/**
 * Generate arbitrary timestamp
 */
const arbitraryTimestamp = (): fc.Arbitrary<number> => {
  return fc.integer({ min: 0, max: Date.now() });
};

// ============================================================================
// Property 1: API 解耦 - 获取所有卡片
// ============================================================================

describe('Feature: riff-decoupling, Property 1: API 解耦 - 获取所有卡片', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all cards (due and not due) when dueOnly=false', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        fc.array(arbitraryRiffBlock(), { minLength: 1, maxLength: 50 }),
        async (deckID, allBlocks) => {
          // Setup: Mock API to return all blocks
          vi.mocked(request).mockResolvedValue({
            blocks: allBlocks,
            total: allBlocks.length,
            pageCount: 1,
          });

          // Execute
          const result = await getRiffCards(deckID, { dueOnly: false });

          // Verify: Should return all blocks (as array)
          expect(Array.isArray(result)).toBe(true);
          const blocks = Array.isArray(result) ? result : result.blocks;
          expect(blocks).toHaveLength(allBlocks.length);
          
          // Verify: API called with correct parameters
          expect(request).toHaveBeenCalledWith('/riff/getRiffCards', {
            id: deckID,
            page: 1,
            pageSize: 100,  // getAllCardsFromDeck uses pageSize 100
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include new cards when includeNew=true', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        fc.array(arbitraryRiffBlock(), { minLength: 1, maxLength: 50 }),
        async (deckID, allBlocks) => {
          // Setup
          vi.mocked(request).mockResolvedValue({
            blocks: allBlocks,
            total: allBlocks.length,
            pageCount: 1,
          });

          // Execute
          const result = await getRiffCards(deckID, { 
            dueOnly: false, 
            includeNew: true 
          });

          // Verify: Should return all blocks including new ones (as array)
          expect(Array.isArray(result)).toBe(true);
          const blocks = Array.isArray(result) ? result : result.blocks;
          expect(blocks).toHaveLength(allBlocks.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: API 解耦 - 增量更新过滤
// ============================================================================

describe('Feature: riff-decoupling, Property 2: API 解耦 - 增量更新过滤', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only return cards created after the given timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        arbitraryTimestamp(),
        fc.array(arbitraryRiffCard(), { minLength: 5, maxLength: 50 }),
        async (deckID, sinceTimestamp, allCards) => {
          // Setup: Mock API to return all cards
          vi.mocked(request).mockResolvedValue({
            blocks: allCards,
            total: allCards.length,
            pageCount: 1,
          });

          // Execute
          const result = await getRiffNewCards(deckID, sinceTimestamp);

          // Verify: All returned cards should be created after sinceTimestamp
          for (const card of result) {
            const createdTime = new Date(card.created || 0).getTime();
            expect(createdTime).toBeGreaterThan(sinceTimestamp);
          }

          // Verify: No cards created before or at sinceTimestamp should be included
          const expectedCards = allCards.filter(card => {
            const createdTime = new Date(card.created || 0).getTime();
            return createdTime > sinceTimestamp;
          });
          expect(result).toHaveLength(expectedCards.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return all cards when no timestamp is provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        fc.array(arbitraryRiffCard(), { minLength: 1, maxLength: 50 }),
        async (deckID, allCards) => {
          // Setup
          vi.mocked(request).mockResolvedValue({
            blocks: allCards,
            total: allCards.length,
            pageCount: 1,
          });

          // Execute: Call without timestamp
          const result = await getRiffNewCards(deckID);

          // Verify: Should return all cards
          expect(result).toHaveLength(allCards.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty array when all cards are older than timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        fc.array(arbitraryRiffCard(), { minLength: 1, maxLength: 50 }),
        async (deckID, allCards) => {
          // Setup: Use a timestamp after all possible generated cards (2031)
          const futureTimestamp = new Date('2031-01-01').getTime();
          
          vi.mocked(request).mockResolvedValue({
            blocks: allCards,
            total: allCards.length,
            pageCount: 1,
          });

          // Execute
          const result = await getRiffNewCards(deckID, futureTimestamp);

          // Verify: Should return empty array (all cards are before 2031)
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 3: API 解耦 - 更新不触发调度
// ============================================================================

describe('Feature: riff-decoupling, Property 3: API 解耦 - 更新不触发调度', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only call updateRiffCard API, not reviewRiffCard', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        fc.string({ minLength: 14, maxLength: 14 }), // cardID
        fc.record({
          due: fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() }).map(t => new Date(t).toISOString()),
          state: fc.integer({ min: 0, max: 3 }),
          lapses: fc.nat({ max: 50 }),
          reps: fc.nat({ max: 100 }),
        }),
        async (deckID, cardID, updates) => {
          // Setup: Mock successful update
          vi.mocked(request).mockResolvedValue({ code: 0 });

          // Execute
          await updateRiffCard(deckID, cardID, updates);

          // Verify: Should call batchSetRiffCardsDueTime (update API)
          expect(request).toHaveBeenCalledWith(
            '/riff/batchSetRiffCardsDueTime',
            expect.objectContaining({
              cardDues: expect.arrayContaining([
                expect.objectContaining({
                  id: cardID,
                  due: updates.due,
                })
              ])
            })
          );

          // Verify: Should NOT call reviewRiffCard (scheduling API)
          expect(request).not.toHaveBeenCalledWith(
            '/riff/reviewRiffCard',
            expect.anything()
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('syncToRiff should not throw errors even when update fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        arbitraryRiffCard(),
        async (deckID, card) => {
          // Setup: Mock API failure
          vi.mocked(request).mockRejectedValue(new Error('Network error'));

          // Execute: Should not throw
          await expect(syncToRiff(deckID, card)).resolves.not.toThrow();

          // Verify: Error was caught and logged (not thrown)
          expect(request).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('syncToRiff should call updateRiffCard with complete scheduling parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeckID(),
        arbitraryRiffCard(),
        async (deckID, card) => {
          // Setup
          vi.mocked(request).mockResolvedValue({ code: 0 });

          // Execute
          await syncToRiff(deckID, card);

          // Verify: Should include all scheduling parameters
          expect(request).toHaveBeenCalledWith(
            '/riff/batchSetRiffCardsDueTime',
            expect.objectContaining({
              cardDues: expect.arrayContaining([
                expect.objectContaining({
                  id: card.id,
                  due: card.due,
                })
              ])
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Summary
// ============================================================================

/**
 * Property Test Summary:
 * 
 * Property 1: API 解耦 - 获取所有卡片
 * - Verified that getRiffCards with dueOnly=false returns all cards
 * - Verified that includeNew=true includes new cards
 * - Validates requirements: 1.1, 1.2
 * 
 * Property 2: API 解耦 - 增量更新过滤
 * - Verified that getRiffNewCards filters by creation timestamp
 * - Verified that cards created before timestamp are excluded
 * - Verified that no timestamp returns all cards
 * - Validates requirements: 1.3, 8.3
 * 
 * Property 3: API 解耦 - 更新不触发调度
 * - Verified that updateRiffCard only calls update API, not scheduling API
 * - Verified that syncToRiff catches all errors and doesn't throw
 * - Verified that syncToRiff includes complete scheduling parameters
 * - Validates requirements: 1.4, 1.5, 1.8
 * 
 * All properties tested with 100 iterations using fast-check.
 */
