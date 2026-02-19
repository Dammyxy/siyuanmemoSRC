/**
 * Value Objects Unit Tests
 * 
 * @description
 * 测试所有 Xiuyuan 领域层的值对象。
 */

import { describe, it, expect } from 'vitest';
import { XiuyuanId } from '../XiuyuanId';
import { BlockId } from '../BlockId';
import { TemplateId } from '../TemplateId';
import { CardFace } from '../CardFace';
import { Priority } from '../Priority';
import { CardId } from '../CardId';
import { ScheduleInfo } from '../ScheduleInfo';
import { CardState } from '../../../../types/card';

describe('XiuyuanId', () => {
  describe('create', () => {
    it('should create valid XiuyuanId', () => {
      const result = XiuyuanId.create('xy_123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getValue()).toBe('xy_123');
      }
    });

    it('should reject empty string', () => {
      const result = XiuyuanId.create('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cannot be empty');
      }
    });

    it('should reject whitespace-only string', () => {
      const result = XiuyuanId.create('   ');
      expect(result.ok).toBe(false);
    });

    it('should reject string exceeding 100 characters', () => {
      const longString = 'a'.repeat(101);
      const result = XiuyuanId.create(longString);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cannot exceed 100 characters');
      }
    });
  });

  describe('equals', () => {
    it('should return true for equal IDs', () => {
      const id1 = XiuyuanId.create('xy_123');
      const id2 = XiuyuanId.create('xy_123');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const id1 = XiuyuanId.create('xy_123');
      const id2 = XiuyuanId.create('xy_456');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the ID value', () => {
      const result = XiuyuanId.create('xy_123');
      expect(result.ok && result.value.toString()).toBe('xy_123');
    });
  });
});

describe('BlockId', () => {
  describe('create', () => {
    it('should create valid BlockId', () => {
      const result = BlockId.create('20210808180117-6v0mkxr');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getValue()).toBe('20210808180117-6v0mkxr');
      }
    });

    it('should reject empty string', () => {
      const result = BlockId.create('');
      expect(result.ok).toBe(false);
    });

    it('should reject invalid format - missing hyphen', () => {
      const result = BlockId.create('202108081801176v0mkxr');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid BlockId format');
      }
    });

    it('should reject invalid format - wrong timestamp length', () => {
      const result = BlockId.create('2021080818-6v0mkxr');
      expect(result.ok).toBe(false);
    });

    it('should reject invalid format - wrong suffix length', () => {
      const result = BlockId.create('20210808180117-6v0mk');
      expect(result.ok).toBe(false);
    });

    it('should reject invalid format - uppercase letters', () => {
      const result = BlockId.create('20210808180117-6V0MKXR');
      expect(result.ok).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal BlockIds', () => {
      const id1 = BlockId.create('20210808180117-6v0mkxr');
      const id2 = BlockId.create('20210808180117-6v0mkxr');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(true);
    });

    it('should return false for different BlockIds', () => {
      const id1 = BlockId.create('20210808180117-6v0mkxr');
      const id2 = BlockId.create('20210808180117-7w1nlys');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(false);
    });
  });
});

describe('TemplateId', () => {
  describe('create', () => {
    it('should create valid TemplateId', () => {
      const result = TemplateId.create('basic');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getValue()).toBe('basic');
      }
    });

    it('should accept alphanumeric with underscores and hyphens', () => {
      const result = TemplateId.create('my-template_v2');
      expect(result.ok).toBe(true);
    });

    it('should reject empty string', () => {
      const result = TemplateId.create('');
      expect(result.ok).toBe(false);
    });

    it('should reject string exceeding 50 characters', () => {
      const longString = 'a'.repeat(51);
      const result = TemplateId.create(longString);
      expect(result.ok).toBe(false);
    });

    it('should reject special characters', () => {
      const result = TemplateId.create('template@123');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('can only contain');
      }
    });

    it('should reject spaces', () => {
      const result = TemplateId.create('my template');
      expect(result.ok).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal TemplateIds', () => {
      const id1 = TemplateId.create('basic');
      const id2 = TemplateId.create('basic');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(true);
    });
  });
});

describe('CardFace', () => {
  describe('create', () => {
    it('should create valid CardFace', () => {
      const result = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.question).toBe('What is DDD?');
        expect(result.value.answer).toBe('Domain-Driven Design');
      }
    });

    it('should create CardFace with block IDs', () => {
      const result = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design',
        questionBlockId: '20210808180117-6v0mkxr',
        answerBlockId: '20210808180117-7w1nlys'
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.questionBlockId).toBe('20210808180117-6v0mkxr');
        expect(result.value.answerBlockId).toBe('20210808180117-7w1nlys');
      }
    });

    it('should trim whitespace from question and answer', () => {
      const result = CardFace.create({
        question: '  What is DDD?  ',
        answer: '  Domain-Driven Design  '
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.question).toBe('What is DDD?');
        expect(result.value.answer).toBe('Domain-Driven Design');
      }
    });

    it('should reject empty question', () => {
      const result = CardFace.create({
        question: '',
        answer: 'Domain-Driven Design'
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Question cannot be empty');
      }
    });

    it('should reject empty answer', () => {
      const result = CardFace.create({
        question: 'What is DDD?',
        answer: ''
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Answer cannot be empty');
      }
    });

    it('should reject invalid questionBlockId format', () => {
      const result = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design',
        questionBlockId: 'invalid-block-id'
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid questionBlockId format');
      }
    });

    it('should reject invalid answerBlockId format', () => {
      const result = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design',
        answerBlockId: 'invalid-block-id'
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid answerBlockId format');
      }
    });
  });

  describe('equals', () => {
    it('should return true for equal CardFaces', () => {
      const face1 = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });
      const face2 = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });
      expect(face1.ok && face2.ok && face1.value.equals(face2.value)).toBe(true);
    });

    it('should return false for different questions', () => {
      const face1 = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });
      const face2 = CardFace.create({
        question: 'What is TDD?',
        answer: 'Domain-Driven Design'
      });
      expect(face1.ok && face2.ok && face1.value.equals(face2.value)).toBe(false);
    });
  });
});

describe('Priority', () => {
  describe('create', () => {
    it('should create valid Priority', () => {
      const result = Priority.create(5);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getValue()).toBe(5);
      }
    });

    it('should accept minimum priority (0)', () => {
      const result = Priority.create(0);
      expect(result.ok).toBe(true);
    });

    it('should accept maximum priority (10)', () => {
      const result = Priority.create(10);
      expect(result.ok).toBe(true);
    });

    it('should reject negative priority', () => {
      const result = Priority.create(-1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('must be between');
      }
    });

    it('should reject priority above 10', () => {
      const result = Priority.create(11);
      expect(result.ok).toBe(false);
    });

    it('should reject non-integer priority', () => {
      const result = Priority.create(5.5);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('must be an integer');
      }
    });

    it('should reject NaN', () => {
      const result = Priority.create(NaN);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('must be a number');
      }
    });
  });

  describe('createDefault', () => {
    it('should create default priority (5)', () => {
      const priority = Priority.createDefault();
      expect(priority.getValue()).toBe(5);
    });
  });

  describe('equals', () => {
    it('should return true for equal priorities', () => {
      const p1 = Priority.create(5);
      const p2 = Priority.create(5);
      expect(p1.ok && p2.ok && p1.value.equals(p2.value)).toBe(true);
    });

    it('should return false for different priorities', () => {
      const p1 = Priority.create(5);
      const p2 = Priority.create(7);
      expect(p1.ok && p2.ok && p1.value.equals(p2.value)).toBe(false);
    });
  });

  describe('compareTo', () => {
    it('should return positive when current priority is higher', () => {
      const p1 = Priority.create(7);
      const p2 = Priority.create(5);
      expect(p1.ok && p2.ok && p1.value.compareTo(p2.value)).toBeGreaterThan(0);
    });

    it('should return negative when current priority is lower', () => {
      const p1 = Priority.create(3);
      const p2 = Priority.create(5);
      expect(p1.ok && p2.ok && p1.value.compareTo(p2.value)).toBeLessThan(0);
    });

    it('should return zero when priorities are equal', () => {
      const p1 = Priority.create(5);
      const p2 = Priority.create(5);
      expect(p1.ok && p2.ok && p1.value.compareTo(p2.value)).toBe(0);
    });
  });

  describe('isHigh', () => {
    it('should return true for priority >= 7', () => {
      const p1 = Priority.create(7);
      const p2 = Priority.create(10);
      expect(p1.ok && p1.value.isHigh()).toBe(true);
      expect(p2.ok && p2.value.isHigh()).toBe(true);
    });

    it('should return false for priority < 7', () => {
      const p = Priority.create(6);
      expect(p.ok && p.value.isHigh()).toBe(false);
    });
  });

  describe('isLow', () => {
    it('should return true for priority <= 3', () => {
      const p1 = Priority.create(0);
      const p2 = Priority.create(3);
      expect(p1.ok && p1.value.isLow()).toBe(true);
      expect(p2.ok && p2.value.isLow()).toBe(true);
    });

    it('should return false for priority > 3', () => {
      const p = Priority.create(4);
      expect(p.ok && p.value.isLow()).toBe(false);
    });
  });
});

describe('CardId', () => {
  describe('create', () => {
    it('should create valid CardId', () => {
      const result = CardId.create('card-123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getValue()).toBe('card-123');
      }
    });

    it('should reject empty string', () => {
      const result = CardId.create('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cannot be empty');
      }
    });

    it('should reject whitespace-only string', () => {
      const result = CardId.create('   ');
      expect(result.ok).toBe(false);
    });

    it('should reject string exceeding 100 characters', () => {
      const longString = 'a'.repeat(101);
      const result = CardId.create(longString);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cannot exceed 100 characters');
      }
    });
  });

  describe('equals', () => {
    it('should return true for equal IDs', () => {
      const id1 = CardId.create('card-123');
      const id2 = CardId.create('card-123');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const id1 = CardId.create('card-123');
      const id2 = CardId.create('card-456');
      expect(id1.ok && id2.ok && id1.value.equals(id2.value)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the ID value', () => {
      const result = CardId.create('card-123');
      expect(result.ok && result.value.toString()).toBe('card-123');
    });
  });
});

describe('ScheduleInfo', () => {
  describe('create', () => {
    it('should create valid ScheduleInfo', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: 1.5,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Learning,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 1,
        learning_step: 0
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stability).toBe(1.5);
        expect(result.value.difficulty).toBe(5);
        expect(result.value.reps).toBe(1);
      }
    });

    it('should reject negative stability', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: -1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 0
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Stability must be >= 0');
      }
    });

    it('should reject difficulty below 0', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: 1,
        difficulty: -1,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 0
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Difficulty must be between 0 and 10');
      }
    });

    it('should reject difficulty above 10', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: 1,
        difficulty: 11,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 0
      });
      expect(result.ok).toBe(false);
    });

    it('should reject negative reps', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: 1,
        difficulty: 5,
        reps: -1,
        lapses: 0,
        state: CardState.New,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 0
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Reps must be >= 0');
      }
    });

    it('should reject negative lapses', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: -1,
        state: CardState.New,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 0
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Lapses must be >= 0');
      }
    });

    it('should reject negative learning_step', () => {
      const now = new Date();
      const result = ScheduleInfo.create({
        due: now,
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 0,
        learning_step: -1
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Learning step must be >= 0');
      }
    });
  });

  describe('createDefault', () => {
    it('should create default ScheduleInfo for new card', () => {
      const scheduleInfo = ScheduleInfo.createDefault();
      expect(scheduleInfo.state).toBe(CardState.New);
      expect(scheduleInfo.stability).toBe(0);
      expect(scheduleInfo.difficulty).toBe(0);
      expect(scheduleInfo.reps).toBe(0);
      expect(scheduleInfo.lapses).toBe(0);
      expect(scheduleInfo.learning_step).toBe(0);
    });
  });

  describe('isDue', () => {
    it('should return true when due date is in the past', () => {
      const pastDate = new Date(Date.now() - 86400000); // -1 day
      const result = ScheduleInfo.create({
        due: pastDate,
        stability: 1,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Review,
        lastReview: new Date(),
        elapsedDays: 1,
        scheduledDays: 1
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isDue()).toBe(true);
      }
    });

    it('should return false when due date is in the future', () => {
      const futureDate = new Date(Date.now() + 86400000); // +1 day
      const result = ScheduleInfo.create({
        due: futureDate,
        stability: 1,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Review,
        lastReview: new Date(),
        elapsedDays: 1,
        scheduledDays: 1
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isDue()).toBe(false);
      }
    });
  });

  describe('state checks', () => {
    it('should correctly identify new card', () => {
      const scheduleInfo = ScheduleInfo.createDefault();
      expect(scheduleInfo.isNew()).toBe(true);
      expect(scheduleInfo.isLearning()).toBe(false);
      expect(scheduleInfo.isReview()).toBe(false);
      expect(scheduleInfo.isRelearning()).toBe(false);
    });

    it('should correctly identify learning card', () => {
      const result = ScheduleInfo.create({
        due: new Date(),
        stability: 1,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Learning,
        lastReview: new Date(),
        elapsedDays: 0,
        scheduledDays: 1
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isNew()).toBe(false);
        expect(result.value.isLearning()).toBe(true);
        expect(result.value.isReview()).toBe(false);
        expect(result.value.isRelearning()).toBe(false);
      }
    });

    it('should correctly identify review card', () => {
      const result = ScheduleInfo.create({
        due: new Date(),
        stability: 5,
        difficulty: 5,
        reps: 5,
        lapses: 0,
        state: CardState.Review,
        lastReview: new Date(),
        elapsedDays: 5,
        scheduledDays: 5
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isNew()).toBe(false);
        expect(result.value.isLearning()).toBe(false);
        expect(result.value.isReview()).toBe(true);
        expect(result.value.isRelearning()).toBe(false);
      }
    });

    it('should correctly identify relearning card', () => {
      const result = ScheduleInfo.create({
        due: new Date(),
        stability: 1,
        difficulty: 7,
        reps: 3,
        lapses: 1,
        state: CardState.Relearning,
        lastReview: new Date(),
        elapsedDays: 1,
        scheduledDays: 1
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isNew()).toBe(false);
        expect(result.value.isLearning()).toBe(false);
        expect(result.value.isReview()).toBe(false);
        expect(result.value.isRelearning()).toBe(true);
      }
    });
  });

  describe('equals', () => {
    it('should return true for equal ScheduleInfo', () => {
      const now = new Date();
      const props = {
        due: now,
        stability: 1.5,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Learning,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 1,
        learning_step: 0
      };
      const s1 = ScheduleInfo.create(props);
      const s2 = ScheduleInfo.create(props);
      expect(s1.ok && s2.ok && s1.value.equals(s2.value)).toBe(true);
    });

    it('should return false for different stability', () => {
      const now = new Date();
      const s1 = ScheduleInfo.create({
        due: now,
        stability: 1.5,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Learning,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 1
      });
      const s2 = ScheduleInfo.create({
        due: now,
        stability: 2.0,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Learning,
        lastReview: now,
        elapsedDays: 0,
        scheduledDays: 1
      });
      expect(s1.ok && s2.ok && s1.value.equals(s2.value)).toBe(false);
    });
  });
});
