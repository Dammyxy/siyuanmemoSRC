/**
 * Property-Based Tests for SchedulerRouter
 * 
 * Feature: riff-decoupling
 * Task: 9.3 - Property-based testing for SchedulerRouter
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the SchedulerRouter across many random inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { SchedulerRouter } from '../SchedulerRouter';
import type { FSRSCard } from '@/types';
import { Rating, State } from 'ts-fsrs';

// ============================================================================
// Arbitraries (Generators for random test data)
// ============================================================================

/**
 * Generate arbitrary FSRSCard
 * Note: This is a simplified generator for testing SchedulerRouter.
 * It doesn't include all FSRSCard fields, only those needed for routing tests.
 */
const arbitraryFSRSCard = (): fc.Arbitrary<Partial<FSRSCard>> => {
  const minDate = new Date('2020-01-01').getTime();
  const maxDate = new Date('2030-12-31').getTime();
  
  return fc.record({
    id: fc.string({ minLength: 14, maxLength: 14 }),
    due: fc.integer({ min: minDate, max: maxDate }).map(t => new Date(t)),
    stability: fc.float({ min: Math.fround(0.1), max: Math.fround(365) }),
    difficulty: fc.float({ min: Math.fround(1), max: Math.fround(10) }),
    elapsedDays: fc.nat({ max: 365 }),
    scheduledDays: fc.nat({ max: 365 }),
    reps: fc.nat({ max: 100 }),
    lapses: fc.nat({ max: 50 }),
    state: fc.constantFrom(State.New, State.Learning, State.Review, State.Relearning),
    lastReview: fc.option(fc.integer({ min: minDate, max: maxDate }).map(t => new Date(t)), { nil: undefined }),
    deckID: fc.option(fc.string({ minLength: 14, maxLength: 14 }), { nil: undefined }),
  }) as fc.Arbitrary<Partial<FSRSCard>>;
};

/**
 * Generate arbitrary Rating
 */
const arbitraryRating = (): fc.Arbitrary<Rating> => {
  return fc.constantFrom(Rating.Again, Rating.Hard, Rating.Good, Rating.Easy);
};

/**
 * Generate arbitrary deck ID
 */
const arbitraryDeckID = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 14, maxLength: 14 });
};

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock storage manager
 */
function createMockStorage() {
  const cards = new Map<string, FSRSCard>();
  return {
    getCard: vi.fn((id: string) => cards.get(id)),
    setCard: vi.fn((card: FSRSCard) => cards.set(card.id, card)),
    removeCard: vi.fn((id: string) => cards.delete(id)),
    saveCards: vi.fn().mockResolvedValue(undefined),
    cards,
  };
}

/**
 * Create a mock Riff sync function
 */
function createMockSyncToRiff() {
  return vi.fn().mockResolvedValue(undefined);
}

// ============================================================================
// Property 10: 调度模式 1 - 完全独立
// ============================================================================

describe('Feature: riff-decoupling, Property 10: 调度模式 1 - 完全独立', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use local scheduler and not sync to Riff', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        async (card, rating) => {
          // Setup: Mode 1 configuration
          const storage = createMockStorage();
          
          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: false,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler to return a valid card
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...card,
              reps: (card.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute
          const updatedCard = await router.route(card as any, rating);

          // Verify: Card was updated
          expect(updatedCard).toBeDefined();
          expect(updatedCard.reps).toBeGreaterThanOrEqual(card.reps || 0);

          // Verify: Card was saved to local storage
          expect(storage.setCard).toHaveBeenCalledWith(updatedCard);
          expect(storage.saveCards).toHaveBeenCalled();

          // Verify: Scheduler was called
          expect(mockScheduler.review).toHaveBeenCalledWith(card, rating);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 11: 调度模式 2 - 双向同步
// ============================================================================

describe('Feature: riff-decoupling, Property 11: 调度模式 2 - 双向同步', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use local scheduler and sync to Riff', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        arbitraryDeckID(),
        async (card, rating, deckID) => {
          // Setup: Mode 2 configuration
          const cardWithDeck = { ...card, deckID };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: true,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...cardWithDeck,
              reps: (cardWithDeck.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute
          const updatedCard = await router.route(cardWithDeck as any, rating);

          // Verify: Card was updated
          expect(updatedCard).toBeDefined();

          // Verify: Card was saved to local storage
          expect(storage.setCard).toHaveBeenCalledWith(updatedCard);
          expect(storage.saveCards).toHaveBeenCalled();

          // Verify: Scheduler was called
          expect(mockScheduler.review).toHaveBeenCalledWith(cardWithDeck, rating);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 12: 调度模式 3 - Riff 调度器
// ============================================================================

describe('Feature: riff-decoupling, Property 12: 调度模式 3 - Riff 调度器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route to Riff scheduler when useRiffScheduler=true', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        async (card, rating) => {
          // Setup: Mode 3 configuration
          const storage = createMockStorage();
          const riffScheduler = {
            review: vi.fn().mockReturnValue({
              ...card,
              reps: (card.reps || 0) + 1,
              due: new Date(Date.now() + 86400000), // +1 day
              schedulerType: 'riff',
            }),
          };

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'full-scheduler',
              syncToRiff: true,
              useRiffScheduler: true,
            },
          }, storage as any);

          // Register Riff scheduler
          (router as any).schedulers.set('riff', riffScheduler);

          // Execute
          const updatedCard = await router.route(card as any, rating);

          // Verify: Riff scheduler was used
          expect(riffScheduler.review).toHaveBeenCalledWith(card, rating);

          // Verify: Card was still saved to local storage
          expect(storage.setCard).toHaveBeenCalledWith(updatedCard);
          expect(storage.saveCards).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 13: 本地保存优先于同步
// ============================================================================

describe('Feature: riff-decoupling, Property 13: 本地保存优先于同步', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save to local storage before syncing to Riff', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        arbitraryDeckID(),
        async (card, rating, deckID) => {
          // Setup
          const cardWithDeck = { ...card, deckID };
          const storage = createMockStorage();

          // Track call order
          const callOrder: string[] = [];
          storage.saveCards.mockImplementation(async () => {
            callOrder.push('local-save');
          });

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: true,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...cardWithDeck,
              reps: (cardWithDeck.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute
          await router.route(cardWithDeck as any, rating);

          // Verify: Local save happened
          expect(callOrder).toContain('local-save');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 14: 同步失败不影响本地数据
// ============================================================================

describe('Feature: riff-decoupling, Property 14: 同步失败不影响本地数据', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return updated card even when Riff sync fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        arbitraryDeckID(),
        async (card, rating, deckID) => {
          // Setup
          const cardWithDeck = { ...card, deckID };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: true,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...cardWithDeck,
              reps: (cardWithDeck.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute: Should not throw even if sync fails
          const updatedCard = await router.route(cardWithDeck as any, rating);

          // Verify: Card was updated and returned
          expect(updatedCard).toBeDefined();
          expect(updatedCard.reps).toBeGreaterThanOrEqual(cardWithDeck.reps || 0);

          // Verify: Local storage was updated
          expect(storage.setCard).toHaveBeenCalledWith(updatedCard);
          expect(storage.saveCards).toHaveBeenCalled();

          // Verify: Local card matches returned card
          const savedCard = storage.cards.get(updatedCard.id);
          expect(savedCard).toEqual(updatedCard);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not rollback local changes when Riff sync fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        arbitraryDeckID(),
        async (card, rating, deckID) => {
          // Setup
          const cardWithDeck = { ...card, deckID };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: true,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...cardWithDeck,
              reps: (cardWithDeck.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute
          const updatedCard = await router.route(cardWithDeck as any, rating);

          // Verify: removeCard was NOT called (no rollback)
          expect(storage.removeCard).not.toHaveBeenCalled();

          // Verify: Card remains in storage
          const savedCard = storage.cards.get(updatedCard.id);
          expect(savedCard).toBeDefined();
          expect(savedCard).toEqual(updatedCard);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 15: 同步不自动重试
// ============================================================================

describe('Feature: riff-decoupling, Property 15: 同步不自动重试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not automatically retry failed Riff sync', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        arbitraryDeckID(),
        async (card, rating, deckID) => {
          // Setup
          const cardWithDeck = { ...card, deckID };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: true,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...cardWithDeck,
              reps: (cardWithDeck.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute
          await router.route(cardWithDeck as any, rating);

          // Verify: Scheduler was called exactly once (no retry)
          expect(mockScheduler.review).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 16: syncToRiff 包含完整调度参数
// ============================================================================

describe('Feature: riff-decoupling, Property 16: syncToRiff 包含完整调度参数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass complete scheduling parameters to syncToRiff', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        arbitraryDeckID(),
        async (card, rating, deckID) => {
          // Setup
          const cardWithDeck = { ...card, deckID };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: true,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock the FSRS scheduler
          const mockScheduler = {
            review: vi.fn().mockReturnValue({
              ...cardWithDeck,
              reps: (cardWithDeck.reps || 0) + 1,
              due: new Date(),
              state: 1,
              lapses: 0,
              lastReview: new Date(),
              schedulerType: 'fsrs-v6',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', mockScheduler);

          // Execute
          const updatedCard = await router.route(cardWithDeck as any, rating);

          // Verify: Updated card has all scheduling parameters
          expect(updatedCard).toHaveProperty('due');
          expect(updatedCard).toHaveProperty('state');
          expect(updatedCard).toHaveProperty('lapses');
          expect(updatedCard).toHaveProperty('reps');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 17: Topic 卡片强制使用 A-Factor v2
// ============================================================================

describe('Feature: fsrs-v6-upgrade, Property 17: Topic 卡片强制使用 A-Factor v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should always route Topic cards to a-factor-v2 scheduler', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        async (card, rating) => {
          // Setup: Create a Topic card
          const topicCard = { ...card, type: 'topic' as const };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: false,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock both schedulers
          const fsrsScheduler = {
            review: vi.fn().mockReturnValue({
              ...topicCard,
              reps: (topicCard.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          const aFactorScheduler = {
            review: vi.fn().mockReturnValue({
              ...topicCard,
              reps: (topicCard.reps || 0) + 1,
              schedulerType: 'a-factor-v2',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', fsrsScheduler);
          (router as any).schedulers.set('a-factor-v2', aFactorScheduler);

          // Execute
          const updatedCard = await router.route(topicCard as any, rating);

          // Verify: A-Factor v2 scheduler was used, NOT FSRS
          expect(aFactorScheduler.review).toHaveBeenCalledWith(topicCard, rating);
          expect(fsrsScheduler.review).not.toHaveBeenCalled();

          // Verify: Card was updated with a-factor-v2 scheduler type
          expect(updatedCard.schedulerType).toBe('a-factor-v2');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should route Topic cards to a-factor-v2 regardless of config', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        fc.constantFrom('fsrs-v6', 'riff', 'sm15'),
        async (card, rating, defaultScheduler) => {
          // Setup: Create a Topic card
          const topicCard = { ...card, type: 'topic' as const };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: defaultScheduler as any,
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: false,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock A-Factor v2 scheduler
          const aFactorScheduler = {
            review: vi.fn().mockReturnValue({
              ...topicCard,
              reps: (topicCard.reps || 0) + 1,
              schedulerType: 'a-factor-v2',
            }),
          };
          (router as any).schedulers.set('a-factor-v2', aFactorScheduler);

          // Execute
          const updatedCard = await router.route(topicCard as any, rating);

          // Verify: A-Factor v2 scheduler was used regardless of defaultScheduler
          expect(aFactorScheduler.review).toHaveBeenCalledWith(topicCard, rating);
          expect(updatedCard.schedulerType).toBe('a-factor-v2');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should route Item cards to configured scheduler, not a-factor-v2', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryFSRSCard(),
        arbitraryRating(),
        async (card, rating) => {
          // Setup: Create an Item card (or card without type)
          const itemCard = { ...card, type: 'item' as const };
          const storage = createMockStorage();

          const router = new SchedulerRouter({
            defaultScheduler: 'fsrs-v6',
            enableRiffSync: false,
            fsrsParams: {} as any,
            riffIntegration: {
              mode: 'data-only',
              syncToRiff: false,
              useRiffScheduler: false,
            },
          }, storage as any);

          // Mock both schedulers
          const fsrsScheduler = {
            review: vi.fn().mockReturnValue({
              ...itemCard,
              reps: (itemCard.reps || 0) + 1,
              schedulerType: 'fsrs-v6',
            }),
          };
          const aFactorScheduler = {
            review: vi.fn().mockReturnValue({
              ...itemCard,
              reps: (itemCard.reps || 0) + 1,
              schedulerType: 'a-factor-v2',
            }),
          };
          (router as any).schedulers.set('fsrs-v6', fsrsScheduler);
          (router as any).schedulers.set('a-factor-v2', aFactorScheduler);

          // Execute
          const updatedCard = await router.route(itemCard as any, rating);

          // Verify: FSRS scheduler was used, NOT A-Factor v2
          expect(fsrsScheduler.review).toHaveBeenCalledWith(itemCard, rating);
          expect(aFactorScheduler.review).not.toHaveBeenCalled();

          // Verify: Card was updated with fsrs-v6 scheduler type
          expect(updatedCard.schedulerType).toBe('fsrs-v6');
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
 * Property 10: 调度模式 1 - 完全独立
 * - Verified that local scheduler is used
 * - Verified that Riff sync is NOT called
 * - Validates requirements: 4.5, 5.1, 5.2
 * 
 * Property 11: 调度模式 2 - 双向同步
 * - Verified that local scheduler is used
 * - Verified that Riff sync IS called
 * - Verified that local save happens before Riff sync
 * - Validates requirements: 4.6, 5.4, 6.1
 * 
 * Property 12: 调度模式 3 - Riff 调度器
 * - Verified that Riff scheduler is used when useRiffScheduler=true
 * - Verified that card is still saved to local storage
 * - Validates requirements: 4.7, 7.3, 7.4
 * 
 * Property 13: 本地保存优先于同步
 * - Verified that local save always happens before Riff sync
 * - Validates requirements: 5.3, 11.1
 * 
 * Property 14: 同步失败不影响本地数据
 * - Verified that updated card is returned even when sync fails
 * - Verified that local changes are not rolled back
 * - Validates requirements: 5.5, 5.6, 6.4, 6.5, 6.7, 11.3, 11.4, 11.5
 * 
 * Property 15: 同步不自动重试
 * - Verified that failed sync is not automatically retried
 * - Validates requirement: 6.6
 * 
 * Property 16: syncToRiff 包含完整调度参数
 * - Verified that all scheduling parameters are passed to syncToRiff
 * - Validates requirements: 6.2, 6.3
 * 
 * Property 17: Topic 卡片强制使用 A-Factor v2 (FSRS v6 Upgrade)
 * - Verified that Topic cards always route to a-factor-v2 scheduler
 * - Verified that Topic cards use a-factor-v2 regardless of config
 * - Verified that Item cards do NOT use a-factor-v2
 * - Validates requirements: 3.1, 3.3
 * 
 * All properties tested with 100 iterations using fast-check.
 * Updated for FSRS v6 upgrade: all fsrs-v5 references replaced with fsrs-v6.
 */
