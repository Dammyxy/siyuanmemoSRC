/**
 * CreateCardCommand 单元测试
 */

import { describe, it, expect } from 'vitest';
import { CreateCardCommand, validateCreateCardCommand } from '../CreateCardCommand';

describe('CreateCardCommand', () => {
  describe('validateCreateCardCommand', () => {
    it('should pass validation for valid command with blockId', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'basic',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design'
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation for valid command with blockIds', () => {
      const command: CreateCardCommand = {
        blockIds: ['20240101000000-abc1234', '20240101000001-def5678'],
        templateId: 'basic'
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation without templateId (auto-selection)', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        cardType: 'item'
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation with optional fields', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'basic',
        cardType: 'concept',
        schedulerType: 'fsrs-v6',
        priority: 50,
        metadata: { source: 'manual' }
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation with all supported cardTypes', () => {
      const cardTypes: Array<'item' | 'topic' | 'concept' | 'descriptor'> = ['item', 'topic', 'concept', 'descriptor'];
      
      for (const cardType of cardTypes) {
        const command: CreateCardCommand = {
          blockId: '20240101000000-abc1234',
          cardType
        };

        const error = validateCreateCardCommand(command);
        expect(error).toBeNull();
      }
    });

    it('should pass validation with all supported schedulerTypes', () => {
      const schedulerTypes: Array<'fsrs-v6' | 'a-factor' | 'sm2'> = ['fsrs-v6', 'a-factor', 'sm2'];
      
      for (const schedulerType of schedulerTypes) {
        const command: CreateCardCommand = {
          blockId: '20240101000000-abc1234',
          schedulerType
        };

        const error = validateCreateCardCommand(command);
        expect(error).toBeNull();
      }
    });

    it('should fail validation when both blockId and blockIds are missing', () => {
      const command: CreateCardCommand = {
        templateId: 'basic'
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('blockId or blockIds must be provided');
    });

    it('should fail validation when blockId is empty string', () => {
      const command: CreateCardCommand = {
        blockId: '',
        templateId: 'basic'
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('blockId or blockIds must be provided');
    });

    it('should fail validation when blockIds is empty array', () => {
      const command: CreateCardCommand = {
        blockIds: [],
        templateId: 'basic'
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('blockId or blockIds must be provided');
    });

    it('should fail validation when templateId is empty string', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: ''
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('templateId cannot be empty string');
    });

    it('should fail validation when cardType is invalid', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        cardType: 'invalid' as any
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('cardType must be one of: item, topic, concept, descriptor');
    });

    it('should fail validation when schedulerType is invalid', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        schedulerType: 'invalid' as any
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('schedulerType must be one of: fsrs-v6, a-factor, sm2');
    });

    it('should fail validation when faces is empty', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'basic',
        faces: []
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('faces must have at least one element');
    });

    it('should fail validation when face question is empty', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'basic',
        faces: [
          {
            question: '',
            answer: 'Domain-Driven Design'
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('faces[0].question cannot be empty');
    });

    it('should fail validation when face answer is empty', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'basic',
        faces: [
          {
            question: 'What is DDD?',
            answer: ''
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('faces[0].answer cannot be empty');
    });

    it('should fail validation when priority is negative', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        priority: -1
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('priority must be between 0 and 100');
    });

    it('should fail validation when priority is greater than 100', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        priority: 101
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('priority must be between 0 and 100');
    });

    it('should fail validation when priority is not a number', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        priority: 'high' as any
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('priority must be a number');
    });

    it('should validate multiple faces', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'cloze',
        faces: [
          {
            question: 'What is {{c1::DDD}}?',
            answer: 'Domain-Driven Design'
          },
          {
            question: 'DDD stands for {{c2::Domain-Driven Design}}',
            answer: 'Domain-Driven Design'
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should fail validation when second face is invalid', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'cloze',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design'
          },
          {
            question: 'DDD stands for...',
            answer: ''
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('faces[1].answer cannot be empty');
    });
  });
});
