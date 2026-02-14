/**
 * Type checking test for ReviewCard interface and CardState enum
 * 
 * This test verifies that the new types are correctly defined and can be used.
 */

import { describe, it, expect } from 'vitest';
import { ReviewCard, CardState, QueueItem } from '../types';

describe('ReviewCard and CardState Type Definitions', () => {
  describe('CardState enum', () => {
    it('should have correct enum values', () => {
      expect(CardState.New).toBe(0);
      expect(CardState.Learning).toBe(1);
      expect(CardState.Review).toBe(2);
      expect(CardState.Relearning).toBe(3);
    });
  });

  describe('ReviewCard interface', () => {
    it('should accept a valid ReviewCard object', () => {
      const card: ReviewCard = {
        blockID: '20230101120000-abc123',
        cardID: '20230101120000-abc123',
        deckID: '20230101000000-deck01',
        priority: 50,
        due: Date.now(),
        lapses: 0,
        state: CardState.New,
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 0,
        last_review: Date.now()
      };

      expect(card).toBeDefined();
      expect(card.state).toBe(CardState.New);
      expect(card.blockID).toBe('20230101120000-abc123');
    });

    it('should extend QueueItem', () => {
      const card: ReviewCard = {
        blockID: '20230101120000-abc123',
        cardID: '20230101120000-abc123',
        deckID: '20230101000000-deck01',
        priority: 50,
        due: Date.now(),
        lapses: 0,
        state: CardState.Review,
        stability: 2.5,
        difficulty: 6,
        elapsed_days: 3,
        scheduled_days: 7,
        reps: 5,
        last_review: Date.now() - 3 * 24 * 60 * 60 * 1000
      };

      // ReviewCard should be assignable to QueueItem
      const queueItem: QueueItem = card;
      expect(queueItem).toBeDefined();
      expect(queueItem.blockID).toBe(card.blockID);
    });

    it('should work with all CardState values', () => {
      const states = [
        CardState.New,
        CardState.Learning,
        CardState.Review,
        CardState.Relearning
      ];

      states.forEach((state) => {
        const card: ReviewCard = {
          blockID: '20230101120000-abc123',
          cardID: '20230101120000-abc123',
          deckID: '20230101000000-deck01',
          priority: 50,
          due: Date.now(),
          lapses: 0,
          state: state,
          stability: 1,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 1,
          reps: 0,
          last_review: Date.now()
        };

        expect(card.state).toBe(state);
      });
    });

    it('should support optional meta field from QueueItem', () => {
      const card: ReviewCard = {
        blockID: '20230101120000-abc123',
        cardID: '20230101120000-abc123',
        deckID: '20230101000000-deck01',
        priority: 50,
        due: Date.now(),
        lapses: 0,
        state: CardState.New,
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 0,
        last_review: Date.now(),
        meta: {
          customField: 'test',
          answerBlockID: '20230101120000-xyz789'
        }
      };

      expect(card.meta).toBeDefined();
      expect(card.meta?.customField).toBe('test');
    });
  });
});
