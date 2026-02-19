/**
 * CardDeletionService - Unit Tests
 * 
 * @description
 * 测试 CardDeletionService 领域服务的所有功能。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CardDeletionService } from '../CardDeletionService';
import { CardCreationService } from '../CardCreationService';
import { Xiuyuan, CreateXiuyuanProps } from '../../Xiuyuan';
import { BlockId } from '../../BlockId';
import { TemplateId } from '../../TemplateId';
import { CardFace } from '../../CardFace';
import { CardId } from '../../CardId';
import { isErr } from '../../../../../types/result';

describe('CardDeletionService', () => {
  let service: CardDeletionService;
  let creationService: CardCreationService;

  beforeEach(() => {
    service = new CardDeletionService();
    creationService = new CardCreationService();
  });

  // Helper function to create valid Xiuyuan
  const createValidXiuyuan = (): Xiuyuan => {
    const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
    const templateIdResult = TemplateId.create('basic');
    const cardFaceResult = CardFace.create({
      question: 'What is DDD?',
      answer: 'Domain-Driven Design'
    });

    if (!blockIdResult.ok || !templateIdResult.ok || !cardFaceResult.ok) {
      throw new Error('Failed to create test data');
    }

    const props: CreateXiuyuanProps = {
      blockIDs: [blockIdResult.value],
      templateID: templateIdResult.value,
      faces: [cardFaceResult.value]
    };

    const xiuyuanResult = Xiuyuan.create(props);
    if (!xiuyuanResult.ok) {
      throw new Error('Failed to create Xiuyuan');
    }

    return xiuyuanResult.value;
  };

  // Helper function to create Xiuyuan with multiple faces
  const createMultiFaceXiuyuan = (): Xiuyuan => {
    const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
    const templateIdResult = TemplateId.create('cloze');
    const face1Result = CardFace.create({
      question: 'Question 1',
      answer: 'Answer 1'
    });
    const face2Result = CardFace.create({
      question: 'Question 2',
      answer: 'Answer 2'
    });
    const face3Result = CardFace.create({
      question: 'Question 3',
      answer: 'Answer 3'
    });

    if (!blockIdResult.ok || !templateIdResult.ok || !face1Result.ok || !face2Result.ok || !face3Result.ok) {
      throw new Error('Failed to create test data');
    }

    const props: CreateXiuyuanProps = {
      blockIDs: [blockIdResult.value],
      templateID: templateIdResult.value,
      faces: [face1Result.value, face2Result.value, face3Result.value]
    };

    const xiuyuanResult = Xiuyuan.create(props);
    if (!xiuyuanResult.ok) {
      throw new Error('Failed to create Xiuyuan');
    }

    return xiuyuanResult.value;
  };

  describe('deleteCard', () => {
    it('should delete an existing card', () => {
      const xiuyuan = createValidXiuyuan();
      const cardResult = creationService.createCard(xiuyuan, 0);

      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const deleteResult = service.deleteCard(xiuyuan, card.getId());

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
      expect(xiuyuan.getCard(card.getId())).toBeNull();
    });

    it('should fail when deleting non-existent card', () => {
      const xiuyuan = createValidXiuyuan();
      const cardIdResult = CardId.create('non-existent-card');

      if (!cardIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      const deleteResult = service.deleteCard(xiuyuan, cardIdResult.value);

      expect(deleteResult.ok).toBe(false);
      if (isErr(deleteResult)) {
        expect(deleteResult.error.message).toContain('not found');
      } else {
        throw new Error('Expected result to be an error');
      }
    });

    it('should fail when card belongs to different Xiuyuan', () => {
      const xiuyuan1 = createValidXiuyuan();
      const xiuyuan2 = createValidXiuyuan();

      const card1Result = creationService.createCard(xiuyuan1, 0);
      const card2Result = creationService.createCard(xiuyuan2, 0);

      expect(card1Result.ok && card2Result.ok).toBe(true);
      if (!card1Result.ok || !card2Result.ok) return;

      const card2 = card2Result.value;

      // Try to delete card2 from xiuyuan1
      const deleteResult = service.deleteCard(xiuyuan1, card2.getId());

      expect(deleteResult.ok).toBe(false);
      if (isErr(deleteResult)) {
        expect(deleteResult.error.message).toContain('not found');
      } else {
        throw new Error('Expected result to be an error');
      }
    });

    it('should delete one card and leave others', () => {
      const xiuyuan = createMultiFaceXiuyuan();
      const card1Result = creationService.createCard(xiuyuan, 0);
      const card2Result = creationService.createCard(xiuyuan, 1);
      const card3Result = creationService.createCard(xiuyuan, 2);

      expect(card1Result.ok && card2Result.ok && card3Result.ok).toBe(true);
      if (!card1Result.ok || !card2Result.ok || !card3Result.ok) return;

      const card2 = card2Result.value;

      // Delete card2
      const deleteResult = service.deleteCard(xiuyuan, card2.getId());

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(2);
      expect(xiuyuan.getCard(card2.getId())).toBeNull();
    });
  });

  describe('deleteCards', () => {
    it('should delete multiple cards', () => {
      const xiuyuan = createMultiFaceXiuyuan();
      const card1Result = creationService.createCard(xiuyuan, 0);
      const card2Result = creationService.createCard(xiuyuan, 1);
      const card3Result = creationService.createCard(xiuyuan, 2);

      expect(card1Result.ok && card2Result.ok && card3Result.ok).toBe(true);
      if (!card1Result.ok || !card2Result.ok || !card3Result.ok) return;

      const cardIds = [
        card1Result.value.getId(),
        card2Result.value.getId()
      ];

      const deleteResult = service.deleteCards(xiuyuan, cardIds);

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(1);
    });

    it('should delete empty array successfully', () => {
      const xiuyuan = createValidXiuyuan();
      const deleteResult = service.deleteCards(xiuyuan, []);

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
    });

    it('should fail if any card does not exist', () => {
      const xiuyuan = createMultiFaceXiuyuan();
      const card1Result = creationService.createCard(xiuyuan, 0);

      expect(card1Result.ok).toBe(true);
      if (!card1Result.ok) return;

      const nonExistentIdResult = CardId.create('non-existent');
      if (!nonExistentIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      const cardIds = [
        card1Result.value.getId(),
        nonExistentIdResult.value
      ];

      const deleteResult = service.deleteCards(xiuyuan, cardIds);

      expect(deleteResult.ok).toBe(false);
      if (isErr(deleteResult)) {
        expect(deleteResult.error.message).toContain('not found');
      } else {
        throw new Error('Expected result to be an error');
      }

      // First card should not be deleted due to validation failure
      expect(xiuyuan.getCardCount()).toBe(1);
    });

    it('should delete all specified cards', () => {
      const xiuyuan = createMultiFaceXiuyuan();
      const cardsResult = creationService.createCardsForAllFaces(xiuyuan);

      expect(cardsResult.ok).toBe(true);
      if (!cardsResult.ok) return;

      const cardIds = cardsResult.value.map(card => card.getId());
      const deleteResult = service.deleteCards(xiuyuan, cardIds);

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
    });
  });

  describe('deleteAllCards', () => {
    it('should delete all cards from Xiuyuan', () => {
      const xiuyuan = createMultiFaceXiuyuan();
      const cardsResult = creationService.createCardsForAllFaces(xiuyuan);

      expect(cardsResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(3);

      const deleteResult = service.deleteAllCards(xiuyuan);

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
    });

    it('should succeed when Xiuyuan has no cards', () => {
      const xiuyuan = createValidXiuyuan();
      const deleteResult = service.deleteAllCards(xiuyuan);

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
    });

    it('should delete all cards even with many cards', () => {
      const xiuyuan = createValidXiuyuan();

      // Create many cards
      for (let i = 0; i < 50; i++) {
        creationService.createCard(xiuyuan, 0);
      }

      expect(xiuyuan.getCardCount()).toBe(50);

      const deleteResult = service.deleteAllCards(xiuyuan);

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
    });
  });

  describe('validateCardDeletion', () => {
    it('should validate successful card deletion', () => {
      const xiuyuan = createValidXiuyuan();
      const cardResult = creationService.createCard(xiuyuan, 0);

      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const validateResult = service.validateCardDeletion(xiuyuan, card.getId());

      expect(validateResult.ok).toBe(true);
    });

    it('should fail validation for non-existent card', () => {
      const xiuyuan = createValidXiuyuan();
      const cardIdResult = CardId.create('non-existent');

      if (!cardIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      const validateResult = service.validateCardDeletion(xiuyuan, cardIdResult.value);

      expect(validateResult.ok).toBe(false);
      if (isErr(validateResult)) {
        expect(validateResult.error.message).toContain('not found');
      } else {
        throw new Error('Expected result to be an error');
      }
    });

    it('should fail validation when card belongs to different Xiuyuan', () => {
      const xiuyuan1 = createValidXiuyuan();
      const xiuyuan2 = createValidXiuyuan();

      const card2Result = creationService.createCard(xiuyuan2, 0);

      expect(card2Result.ok).toBe(true);
      if (!card2Result.ok) return;

      const card2 = card2Result.value;

      // Try to validate deletion of card2 from xiuyuan1
      const validateResult = service.validateCardDeletion(xiuyuan1, card2.getId());

      expect(validateResult.ok).toBe(false);
      if (isErr(validateResult)) {
        expect(validateResult.error.message).toContain('not found');
      } else {
        throw new Error('Expected result to be an error');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle deleting and re-creating cards', () => {
      const xiuyuan = createValidXiuyuan();
      const cardResult1 = creationService.createCard(xiuyuan, 0);

      expect(cardResult1.ok).toBe(true);
      if (!cardResult1.ok) return;

      const card1 = cardResult1.value;

      // Delete the card
      const deleteResult = service.deleteCard(xiuyuan, card1.getId());
      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);

      // Create a new card
      const cardResult2 = creationService.createCard(xiuyuan, 0);
      expect(cardResult2.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(1);
    });

    it('should handle deleting cards in different orders', () => {
      const xiuyuan = createMultiFaceXiuyuan();
      const card1Result = creationService.createCard(xiuyuan, 0);
      const card2Result = creationService.createCard(xiuyuan, 1);
      const card3Result = creationService.createCard(xiuyuan, 2);

      expect(card1Result.ok && card2Result.ok && card3Result.ok).toBe(true);
      if (!card1Result.ok || !card2Result.ok || !card3Result.ok) return;

      // Delete in reverse order
      service.deleteCard(xiuyuan, card3Result.value.getId());
      service.deleteCard(xiuyuan, card1Result.value.getId());
      service.deleteCard(xiuyuan, card2Result.value.getId());

      expect(xiuyuan.getCardCount()).toBe(0);
    });

    it('should not affect other Xiuyuan when deleting cards', () => {
      const xiuyuan1 = createValidXiuyuan();
      const xiuyuan2 = createValidXiuyuan();

      const card1Result = creationService.createCard(xiuyuan1, 0);
      const card2Result = creationService.createCard(xiuyuan2, 0);

      expect(card1Result.ok && card2Result.ok).toBe(true);
      if (!card1Result.ok || !card2Result.ok) return;

      // Delete card from xiuyuan1
      service.deleteCard(xiuyuan1, card1Result.value.getId());

      // xiuyuan2 should still have its card
      expect(xiuyuan1.getCardCount()).toBe(0);
      expect(xiuyuan2.getCardCount()).toBe(1);
    });
  });
});
