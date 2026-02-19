/**
 * Card Entity Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { Card } from '../Card';
import { CardId } from '../CardId';
import { XiuyuanId } from '../XiuyuanId';
import { ScheduleInfo } from '../ScheduleInfo';
import { Rating, CardState } from '../../../../types/card';

describe('Card Entity', () => {
  describe('create', () => {
    it('should create a valid card', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');
      const scheduleInfo = ScheduleInfo.createDefault();
      const now = new Date();

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const result = Card.create({
        id: cardId.value,
        xiuyuanId: xiuyuanId.value,
        faceIndex: 0,
        scheduleInfo,
        createdAt: now,
        updatedAt: now
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const card = result.value;
      expect(card.getId().equals(cardId.value)).toBe(true);
      expect(card.getXiuyuanId().equals(xiuyuanId.value)).toBe(true);
      expect(card.getFaceIndex()).toBe(0);
      expect(card.getScheduleInfo()).toBe(scheduleInfo);
    });

    it('should reject negative faceIndex', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');
      const scheduleInfo = ScheduleInfo.createDefault();
      const now = new Date();

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const result = Card.create({
        id: cardId.value,
        xiuyuanId: xiuyuanId.value,
        faceIndex: -1,
        scheduleInfo,
        createdAt: now,
        updatedAt: now
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('FaceIndex must be >= 0');
    });
  });

  describe('createNew', () => {
    it('should create a new card with default schedule', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const result = Card.createNew(cardId.value, xiuyuanId.value, 0);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const card = result.value;
      expect(card.isNew()).toBe(true);
      expect(card.getScheduleInfo().state).toBe(CardState.New);
      expect(card.getScheduleInfo().reps).toBe(0);
      expect(card.getScheduleInfo().lapses).toBe(0);
    });

    it('should reject negative faceIndex', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const result = Card.createNew(cardId.value, xiuyuanId.value, -1);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('FaceIndex must be >= 0');
    });
  });

  describe('review', () => {
    it('should update card with new schedule info', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const cardResult = Card.createNew(cardId.value, xiuyuanId.value, 0);
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const oldUpdatedAt = card.getUpdatedAt();

      // Create new schedule info (simulating scheduler calculation)
      const newScheduleInfoResult = ScheduleInfo.create({
        due: new Date(Date.now() + 86400000), // +1 day
        stability: 1.5,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Learning,
        lastReview: new Date(),
        elapsedDays: 0,
        scheduledDays: 1,
        learning_step: 1
      });

      expect(newScheduleInfoResult.ok).toBe(true);
      if (!newScheduleInfoResult.ok) return;

      const reviewResult = card.review(Rating.Good, newScheduleInfoResult.value);

      expect(reviewResult.ok).toBe(true);
      if (!reviewResult.ok) return;

      const reviewedCard = reviewResult.value;
      expect(reviewedCard.getScheduleInfo().reps).toBe(1);
      expect(reviewedCard.getScheduleInfo().state).toBe(CardState.Learning);
      expect(reviewedCard.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(oldUpdatedAt.getTime());
      
      // Original card should be unchanged (immutability)
      expect(card.getScheduleInfo().reps).toBe(0);
      expect(card.getScheduleInfo().state).toBe(CardState.New);
    });

    it('should reject invalid rating', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const cardResult = Card.createNew(cardId.value, xiuyuanId.value, 0);
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const newScheduleInfo = ScheduleInfo.createDefault();

      const reviewResult = card.review(999 as Rating, newScheduleInfo);

      expect(reviewResult.ok).toBe(false);
      if (reviewResult.ok) return;
      expect(reviewResult.error.message).toContain('Invalid rating');
    });
  });

  describe('reschedule', () => {
    it('should update due date', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const cardResult = Card.createNew(cardId.value, xiuyuanId.value, 0);
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const newDue = new Date(Date.now() + 86400000 * 7); // +7 days

      const rescheduleResult = card.reschedule(newDue);

      expect(rescheduleResult.ok).toBe(true);
      if (!rescheduleResult.ok) return;

      const rescheduledCard = rescheduleResult.value;
      expect(rescheduledCard.getScheduleInfo().due.getTime()).toBe(newDue.getTime());
      
      // Original card should be unchanged (immutability)
      expect(card.getScheduleInfo().due.getTime()).not.toBe(newDue.getTime());
    });

    it('should reject due date earlier than creation date', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const cardResult = Card.createNew(cardId.value, xiuyuanId.value, 0);
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const pastDate = new Date(card.getCreatedAt().getTime() - 86400000); // -1 day

      const rescheduleResult = card.reschedule(pastDate);

      expect(rescheduleResult.ok).toBe(false);
      if (rescheduleResult.ok) return;
      expect(rescheduleResult.error.message).toContain('cannot be earlier than creation date');
    });
  });

  describe('isDue', () => {
    it('should return true when card is due', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const cardResult = Card.createNew(cardId.value, xiuyuanId.value, 0);
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      
      // New card should be due immediately
      expect(card.isDue()).toBe(true);
    });

    it('should return false when card is not due', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const cardResult = Card.createNew(cardId.value, xiuyuanId.value, 0);
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const futureDate = new Date(Date.now() + 86400000 * 7); // +7 days

      const rescheduledResult = card.reschedule(futureDate);
      expect(rescheduledResult.ok).toBe(true);
      if (!rescheduledResult.ok) return;

      const rescheduledCard = rescheduledResult.value;
      expect(rescheduledCard.isDue()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for cards with same ID', () => {
      const cardId = CardId.create('card-123');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId.ok || !xiuyuanId.ok) return;

      const card1Result = Card.createNew(cardId.value, xiuyuanId.value, 0);
      const card2Result = Card.createNew(cardId.value, xiuyuanId.value, 1);

      expect(card1Result.ok).toBe(true);
      expect(card2Result.ok).toBe(true);

      if (!card1Result.ok || !card2Result.ok) return;

      expect(card1Result.value.equals(card2Result.value)).toBe(true);
    });

    it('should return false for cards with different IDs', () => {
      const cardId1 = CardId.create('card-123');
      const cardId2 = CardId.create('card-456');
      const xiuyuanId = XiuyuanId.create('xiuyuan-123');

      expect(cardId1.ok).toBe(true);
      expect(cardId2.ok).toBe(true);
      expect(xiuyuanId.ok).toBe(true);

      if (!cardId1.ok || !cardId2.ok || !xiuyuanId.ok) return;

      const card1Result = Card.createNew(cardId1.value, xiuyuanId.value, 0);
      const card2Result = Card.createNew(cardId2.value, xiuyuanId.value, 0);

      expect(card1Result.ok).toBe(true);
      expect(card2Result.ok).toBe(true);

      if (!card1Result.ok || !card2Result.ok) return;

      expect(card1Result.value.equals(card2Result.value)).toBe(false);
    });
  });
});
