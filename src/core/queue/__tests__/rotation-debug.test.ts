/**
 * Card Rotation Behavior Debug Tests
 * 
 * These tests help diagnose and verify the card rotation behavior,
 * specifically ensuring that failed cards (rating < 3) don't immediately
 * reappear at the front of the queue after being rotated to the end.
 * 
 * Feature: retrieval-practice-rating-fix
 * Task: 17.3 - Refactor rotation-debug tests with improved descriptions
 * 
 * Test Scenarios:
 * 1. Card rotation and sorting behavior - verifies cards appear in correct order
 * 2. PrioritySequencer sorting - verifies sequencer handles cards with same due times
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RetrievalPracticeQueue } from '../strategies/RetrievalPracticeQueue';
import type { QueueItem } from '../types';
import { CardStorage } from '../../scheduling/CardStorage';

describe('Card Rotation Behavior', () => {
  let queue: RetrievalPracticeQueue;
  
  beforeEach(async () => {
    // Given: A queue with mock API
    queue = await RetrievalPracticeQueue.create({
      api: {
        getRiffDueCards: async () => [],
        reviewRiffCard: async () => {},
        skipReviewRiffCard: async () => {},
      },
    });
  });

  describe('Scenario: Failed card rotation with multiple due cards', () => {
    it('should not immediately return a rotated card - it should appear after other due cards', async () => {
      console.log('\n========== CARD ROTATION TEST START ==========\n');
      
      // Given: Three cards with different due times (all in the past, so all are "due")
      // IMPORTANT: All cards must be "due" (dueTime <= now) to pass the Outstanding queue filter
      const now = Date.now();
      const nowISO = new Date(now).toISOString();
      const past1ISO = new Date(now - 60000).toISOString(); // 1 minute ago
      const past2ISO = new Date(now - 120000).toISOString(); // 2 minutes ago
      
      const card1: QueueItem = {
        cardID: 'card-1',
        blockID: 'block-1',
        deckID: 'deck-1',
        nextDues: {
          1: nowISO,
          2: nowISO,
          3: nowISO,
          4: nowISO,
        },
      };
      
      const card2: QueueItem = {
        cardID: 'card-2',
        blockID: 'block-2',
        deckID: 'deck-1',
        nextDues: {
          1: past1ISO,
          2: past1ISO,
          3: past1ISO,
          4: past1ISO,
        },
      };
      
      const card3: QueueItem = {
        cardID: 'card-3',
        blockID: 'block-3',
        deckID: 'deck-1',
        nextDues: {
          1: past2ISO,
          2: past2ISO,
          3: past2ISO,
          4: past2ISO,
        },
      };
      
      console.log('Initial card setup:');
      console.log('  card-1 dueTime:', CardStorage.getDueTime(card1), '(now)');
      console.log('  card-2 dueTime:', CardStorage.getDueTime(card2), '(-1 min, older)');
      console.log('  card-3 dueTime:', CardStorage.getDueTime(card3), '(-2 min, oldest)');
      console.log();
      
      // When: We add cards to the queue
      await queue.addItems([card1, card2, card3]);
      
      // Then: The first card should be card-3 (the oldest)
      const firstCard = await queue.next();
      console.log('First card from queue:', firstCard?.cardID);
      console.log('  dueTime:', firstCard ? CardStorage.getDueTime(firstCard) : 'N/A');
      console.log();
      
      expect(firstCard?.cardID).toBe('card-3'); // Oldest card should appear first
      
      // When: We rate card-3 with grade 2 (should rotate to end)
      console.log('Rating card-3 with grade 2 (should rotate to end)...');
      await queue.onFeedback(firstCard, { action: 'rate', rating: 2 });
      console.log();
      
      // Then: Check card-3's new dueTime after rotation
      const allItems = queue.getAllItems();
      const rotatedCard = allItems.find(c => c.cardID === 'card-3');
      console.log('After rotation, card-3 dueTime:', rotatedCard ? CardStorage.getDueTime(rotatedCard) : 'NOT FOUND');
      console.log('  nextDues:', rotatedCard?.nextDues);
      console.log();
      
      // Then: The next card should be card-2 (the next oldest), NOT card-3
      const secondCard = await queue.next();
      console.log('Second card from queue:', secondCard?.cardID);
      console.log('  dueTime:', secondCard ? CardStorage.getDueTime(secondCard) : 'N/A');
      console.log();
      
      // Then: The third card should be card-1
      const thirdCard = await queue.next();
      console.log('Third card from queue:', thirdCard?.cardID);
      console.log('  dueTime:', thirdCard ? CardStorage.getDueTime(thirdCard) : 'N/A');
      console.log();
      
      // Then: The fourth card should be card-3 (the rotated one)
      const fourthCard = await queue.next();
      console.log('Fourth card from queue:', fourthCard?.cardID);
      console.log('  dueTime:', fourthCard ? CardStorage.getDueTime(fourthCard) : 'N/A');
      console.log();
      
      // Print all cards in order for debugging
      console.log('All cards in queue after rotation:');
      for (const item of allItems) {
        console.log(`  ${item.cardID}: dueTime=${CardStorage.getDueTime(item)}`);
      }
      console.log();
      
      // Verify the bug is fixed: card-3 should NOT appear as secondCard
      if (secondCard?.cardID === 'card-3') {
        console.error('❌ BUG DETECTED: Rotated card still appears first!');
        console.error('Expected: card-2 or card-1');
        console.error('Actual: card-3');
        
        // Diagnostic information
        console.log('\nDiagnostic info:');
        console.log('  card-3 dueTime:', CardStorage.getDueTime(rotatedCard!));
        console.log('  card-2 dueTime:', CardStorage.getDueTime(card2));
        console.log('  card-1 dueTime:', CardStorage.getDueTime(card1));
        console.log('  now:', now);
        
        const card3Due = CardStorage.getDueTime(rotatedCard!);
        const card2Due = CardStorage.getDueTime(card2);
        const card1Due = CardStorage.getDueTime(card1);
        
        console.log('\nComparison:');
        console.log('  card-3 < card-2?', card3Due < card2Due);
        console.log('  card-3 < card-1?', card3Due < card1Due);
        console.log('  card-3 <= now?', card3Due <= now);
      } else {
        console.log('✅ SUCCESS: Rotated card did not appear immediately after rotation!');
        console.log(`   Expected order: card-2, card-1, then card-3`);
        console.log(`   Actual: ${secondCard?.cardID}, ${thirdCard?.cardID}, ${fourthCard?.cardID}`);
      }
      
      console.log('\n========== CARD ROTATION TEST END ==========\n');
      
      // Final assertions: Verify correct order
      expect(secondCard?.cardID).toBe('card-2');
      expect(thirdCard?.cardID).toBe('card-1');
      expect(fourthCard?.cardID).toBe('card-3');
    });
  });
  
  describe('Scenario: PrioritySequencer sorting with same due times', () => {
    it('should handle cards with identical or very close due times correctly', async () => {
      console.log('\n========== SEQUENCER SORTING TEST START ==========\n');
      
      // Given: Four cards with same or very close due times
      const now = Date.now();
      const nowISO = new Date(now).toISOString();
      const nowPlus1ISO = new Date(now + 1).toISOString();
      const nowPlus2ISO = new Date(now + 2).toISOString();
      
      const cards: QueueItem[] = [
        {
          cardID: 'card-A',
          blockID: 'block-A',
          deckID: 'deck-1',
          nextDues: { 1: nowISO, 2: nowISO, 3: nowISO, 4: nowISO },
        },
        {
          cardID: 'card-B',
          blockID: 'block-B',
          deckID: 'deck-1',
          nextDues: { 1: nowISO, 2: nowISO, 3: nowISO, 4: nowISO },
        },
        {
          cardID: 'card-C',
          blockID: 'block-C',
          deckID: 'deck-1',
          nextDues: { 1: nowPlus1ISO, 2: nowPlus1ISO, 3: nowPlus1ISO, 4: nowPlus1ISO },
        },
        {
          cardID: 'card-D',
          blockID: 'block-D',
          deckID: 'deck-1',
          nextDues: { 1: nowPlus2ISO, 2: nowPlus2ISO, 3: nowPlus2ISO, 4: nowPlus2ISO },
        },
      ];
      
      console.log('Cards with same/similar due times:');
      for (const card of cards) {
        console.log(`  ${card.cardID}: dueTime=${CardStorage.getDueTime(card)}`);
      }
      console.log();
      
      // When: We add cards to the queue
      await queue.addItems(cards);
      
      // Then: Cards should be returned in a stable, predictable order
      console.log('Order from queue:');
      const order: string[] = [];
      for (let i = 0; i < 4; i++) {
        const card = await queue.next();
        if (card) {
          order.push(card.cardID);
          console.log(`  ${i + 1}. ${card.cardID}`);
        }
      }
      console.log();
      
      console.log('Analysis:');
      console.log('  Cards A and B have same dueTime (now)');
      console.log('  Card C has dueTime = now + 1ms');
      console.log('  Card D has dueTime = now + 2ms');
      console.log('  Expected order: A or B first, then the other, then C, then D');
      console.log('  Actual order:', order.join(', '));
      console.log();
      
      console.log('========== SEQUENCER SORTING TEST END ==========\n');
      
      // Verify that cards with same due time appear before cards with later due times
      // We don't enforce a specific order for A and B since they have identical due times
      const indexC = order.indexOf('card-C');
      const indexD = order.indexOf('card-D');
      
      expect(indexC).toBeLessThan(indexD); // C should appear before D
      expect(indexC).toBeGreaterThanOrEqual(2); // C should appear after A and B
    });
  });
});
