/**
 * Xiuyuan Aggregate Root - Unit Tests
 * 
 * @description
 * 测试 Xiuyuan 聚合根的所有功能。
 */

import { describe, it, expect } from 'vitest';
import { Xiuyuan, CreateXiuyuanProps } from '../Xiuyuan';
import { XiuyuanId } from '../XiuyuanId';
import { BlockId } from '../BlockId';
import { TemplateId } from '../TemplateId';
import { CardFace } from '../CardFace';
import { Priority } from '../Priority';
import { CardId } from '../CardId';

describe('Xiuyuan Aggregate Root', () => {
  // Helper function to create valid test data
  const createValidProps = (): CreateXiuyuanProps => {
    const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
    const templateIdResult = TemplateId.create('basic');
    const cardFaceResult = CardFace.create({
      question: 'What is DDD?',
      answer: 'Domain-Driven Design'
    });

    if (!blockIdResult.ok || !templateIdResult.ok || !cardFaceResult.ok) {
      throw new Error('Failed to create test data');
    }

    return {
      blockIDs: [blockIdResult.value],
      templateID: templateIdResult.value,
      faces: [cardFaceResult.value]
    };
  };

  describe('create', () => {
    it('should create a new Xiuyuan with valid props', () => {
      const props = createValidProps();
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getBlockIDs()).toHaveLength(1);
        expect(result.value.getFaces()).toHaveLength(1);
        expect(result.value.getCardCount()).toBe(0);
        expect(result.value.getPriority().getValue()).toBe(Priority.DEFAULT_PRIORITY);
      }
    });

    it('should create Xiuyuan with custom ID', () => {
      const props = createValidProps();
      const customIdResult = XiuyuanId.create('custom-xiuyuan-id');
      
      if (!customIdResult.ok) {
        throw new Error('Failed to create custom ID');
      }

      props.id = customIdResult.value;
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getId().getValue()).toBe('custom-xiuyuan-id');
      }
    });

    it('should create Xiuyuan with custom priority', () => {
      const props = createValidProps();
      const priorityResult = Priority.create(8);
      
      if (!priorityResult.ok) {
        throw new Error('Failed to create priority');
      }

      props.priority = priorityResult.value;
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getPriority().getValue()).toBe(8);
      }
    });

    it('should create Xiuyuan with custom meta', () => {
      const props = createValidProps();
      props.meta = { customField: 'customValue' };
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getMeta()).toEqual({ customField: 'customValue' });
      }
    });

    it('should fail when blockIDs is empty', () => {
      const props = createValidProps();
      props.blockIDs = [];
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('at least one BlockId');
      }
    });

    it('should fail when faces is empty', () => {
      const props = createValidProps();
      props.faces = [];
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('at least one CardFace');
      }
    });

    it('should publish XiuyuanCreatedEvent', () => {
      const props = createValidProps();
      const result = Xiuyuan.create(props);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const events = result.value.getDomainEvents();
        expect(events).toHaveLength(1);
        expect(events[0].getEventName()).toBe('XiuyuanCreated');
      }
    });
  });

  describe('createCard', () => {
    it('should create a card with valid faceIndex', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);

      expect(cardResult.ok).toBe(true);
      if (cardResult.ok) {
        expect(cardResult.value.getFaceIndex()).toBe(0);
        expect(xiuyuan.getCardCount()).toBe(1);
      }
    });

    it('should create card with custom CardId', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardIdResult = CardId.create('custom-card-id');
      
      if (!cardIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      const cardResult = xiuyuan.createCard(0, cardIdResult.value);

      expect(cardResult.ok).toBe(true);
      if (cardResult.ok) {
        expect(cardResult.value.getId().getValue()).toBe('custom-card-id');
      }
    });

    it('should fail with invalid faceIndex (negative)', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(-1);

      expect(cardResult.ok).toBe(false);
      if (!cardResult.ok) {
        expect(cardResult.error.message).toContain('Invalid faceIndex');
      }
    });

    it('should fail with invalid faceIndex (too large)', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(10);

      expect(cardResult.ok).toBe(false);
      if (!cardResult.ok) {
        expect(cardResult.error.message).toContain('Invalid faceIndex');
      }
    });

    it('should publish CardCreatedEvent', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      xiuyuan.clearDomainEvents(); // Clear creation event
      
      const cardResult = xiuyuan.createCard(0);

      expect(cardResult.ok).toBe(true);
      if (cardResult.ok) {
        const events = xiuyuan.getDomainEvents();
        expect(events).toHaveLength(1);
        expect(events[0].getEventName()).toBe('CardCreated');
      }
    });

    it('should update updatedAt timestamp', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const originalUpdatedAt = xiuyuan.getUpdatedAt();
      
      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        xiuyuan.createCard(0);
        expect(xiuyuan.getUpdatedAt().getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 10);
    });
  });

  describe('deleteCard', () => {
    it('should delete an existing card', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);

      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const deleteResult = xiuyuan.deleteCard(card.getId());

      expect(deleteResult.ok).toBe(true);
      expect(xiuyuan.getCardCount()).toBe(0);
      expect(xiuyuan.getCard(card.getId())).toBeNull();
    });

    it('should fail when deleting non-existent card', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardIdResult = CardId.create('non-existent-card');
      
      if (!cardIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      const deleteResult = xiuyuan.deleteCard(cardIdResult.value);

      expect(deleteResult.ok).toBe(false);
      if (!deleteResult.ok) {
        expect(deleteResult.error.message).toContain('Card not found');
      }
    });

    it('should publish CardDeletedEvent', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);

      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      xiuyuan.clearDomainEvents(); // Clear previous events
      
      xiuyuan.deleteCard(card.getId());

      const events = xiuyuan.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].getEventName()).toBe('CardDeleted');
    });
  });

  describe('updateCard', () => {
    it('should update an existing card', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);

      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const newDue = new Date(Date.now() + 86400000); // +1 day
      const rescheduleResult = card.reschedule(newDue);

      expect(rescheduleResult.ok).toBe(true);
      if (!rescheduleResult.ok) return;

      const updatedCard = rescheduleResult.value;
      const updateResult = xiuyuan.updateCard(card.getId(), updatedCard);

      expect(updateResult.ok).toBe(true);
      
      const retrievedCard = xiuyuan.getCard(card.getId());
      expect(retrievedCard).not.toBeNull();
      if (retrievedCard) {
        expect(retrievedCard.getScheduleInfo().due.getTime()).toBe(newDue.getTime());
      }
    });

    it('should fail when updating non-existent card', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);

      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;

      const card = cardResult.value;
      const cardIdResult = CardId.create('non-existent-card');
      
      if (!cardIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      const updateResult = xiuyuan.updateCard(cardIdResult.value, card);

      expect(updateResult.ok).toBe(false);
      if (!updateResult.ok) {
        expect(updateResult.error.message).toContain('Card not found');
      }
    });

    it('should fail when card belongs to different Xiuyuan', () => {
      const props1 = createValidProps();
      const xiuyuan1Result = Xiuyuan.create(props1);

      const props2 = createValidProps();
      const xiuyuan2Result = Xiuyuan.create(props2);

      expect(xiuyuan1Result.ok && xiuyuan2Result.ok).toBe(true);
      if (!xiuyuan1Result.ok || !xiuyuan2Result.ok) return;

      const xiuyuan1 = xiuyuan1Result.value;
      const xiuyuan2 = xiuyuan2Result.value;

      const card1Result = xiuyuan1.createCard(0);
      const card2Result = xiuyuan2.createCard(0);

      expect(card1Result.ok && card2Result.ok).toBe(true);
      if (!card1Result.ok || !card2Result.ok) return;

      const card1 = card1Result.value;
      const card2 = card2Result.value;

      // Try to update card1 in xiuyuan1 with card2 (which belongs to xiuyuan2)
      const updateResult = xiuyuan1.updateCard(card1.getId(), card2);

      expect(updateResult.ok).toBe(false);
      if (!updateResult.ok) {
        expect(updateResult.error.message).toContain('does not belong to this Xiuyuan');
      }
    });
  });

  describe('getters', () => {
    it('should return correct values from getters', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;

      expect(xiuyuan.getId()).toBeDefined();
      expect(xiuyuan.getBlockIDs()).toHaveLength(1);
      expect(xiuyuan.getTemplateID()).toBeDefined();
      expect(xiuyuan.getFaces()).toHaveLength(1);
      expect(xiuyuan.getPriority().getValue()).toBe(Priority.DEFAULT_PRIORITY);
      expect(xiuyuan.getMeta()).toEqual({});
      expect(xiuyuan.getCreatedAt()).toBeInstanceOf(Date);
      expect(xiuyuan.getUpdatedAt()).toBeInstanceOf(Date);
      expect(xiuyuan.getCards()).toEqual([]);
      expect(xiuyuan.getCardCount()).toBe(0);
    });

    it('should return null for non-existent card', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const cardIdResult = CardId.create('non-existent');
      
      if (!cardIdResult.ok) {
        throw new Error('Failed to create card ID');
      }

      expect(xiuyuan.getCard(cardIdResult.value)).toBeNull();
    });
  });

  describe('updatePriority', () => {
    it('should update priority', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const newPriorityResult = Priority.create(9);
      
      if (!newPriorityResult.ok) {
        throw new Error('Failed to create priority');
      }

      const updateResult = xiuyuan.updatePriority(newPriorityResult.value);

      expect(updateResult.ok).toBe(true);
      expect(xiuyuan.getPriority().getValue()).toBe(9);
    });
  });

  describe('updateMeta', () => {
    it('should update meta', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const updateResult = xiuyuan.updateMeta({ newField: 'newValue' });

      expect(updateResult.ok).toBe(true);
      expect(xiuyuan.getMeta()).toEqual({ newField: 'newValue' });
    });

    it('should merge meta', () => {
      const props = createValidProps();
      props.meta = { existingField: 'existingValue' };
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const updateResult = xiuyuan.updateMeta({ newField: 'newValue' });

      expect(updateResult.ok).toBe(true);
      expect(xiuyuan.getMeta()).toEqual({
        existingField: 'existingValue',
        newField: 'newValue'
      });
    });
  });

  describe('domain events', () => {
    it('should clear domain events', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      expect(xiuyuan.getDomainEvents()).toHaveLength(1);

      xiuyuan.clearDomainEvents();
      expect(xiuyuan.getDomainEvents()).toHaveLength(0);
    });

    it('should accumulate multiple events', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      xiuyuan.clearDomainEvents();

      xiuyuan.createCard(0);
      xiuyuan.createCard(0);

      const events = xiuyuan.getDomainEvents();
      expect(events).toHaveLength(2);
      expect(events[0].getEventName()).toBe('CardCreated');
      expect(events[1].getEventName()).toBe('CardCreated');
    });
  });

  describe('equals', () => {
    it('should return true for same Xiuyuan', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      expect(xiuyuan.equals(xiuyuan)).toBe(true);
    });

    it('should return false for different Xiuyuan', () => {
      const props1 = createValidProps();
      const xiuyuan1Result = Xiuyuan.create(props1);

      const props2 = createValidProps();
      const xiuyuan2Result = Xiuyuan.create(props2);

      expect(xiuyuan1Result.ok && xiuyuan2Result.ok).toBe(true);
      if (!xiuyuan1Result.ok || !xiuyuan2Result.ok) return;

      const xiuyuan1 = xiuyuan1Result.value;
      const xiuyuan2 = xiuyuan2Result.value;

      expect(xiuyuan1.equals(xiuyuan2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      const props = createValidProps();
      const xiuyuanResult = Xiuyuan.create(props);

      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const xiuyuan = xiuyuanResult.value;
      const str = xiuyuan.toString();

      expect(str).toContain('Xiuyuan');
      expect(str).toContain('cards: 0');
      expect(str).toContain('faces: 1');
    });
  });
});
