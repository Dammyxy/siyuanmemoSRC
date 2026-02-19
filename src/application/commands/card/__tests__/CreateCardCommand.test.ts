/**
 * CreateCardCommand 单元测试
 */

import { describe, it, expect } from 'vitest';
import { CreateCardCommand, validateCreateCardCommand } from '../CreateCardCommand';

describe('CreateCardCommand', () => {
  describe('validateCreateCardCommand', () => {
    it('should pass validation for valid command', () => {
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

    it('should pass validation with optional fields', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: 'basic',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design',
            questionBlockId: '20240101000000-abc1234',
            answerBlockId: '20240101000001-def5678'
          }
        ],
        priority: 5,
        meta: { source: 'manual' }
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should fail validation when blockId is empty', () => {
      const command: CreateCardCommand = {
        blockId: '',
        templateId: 'basic',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design'
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('blockId cannot be empty');
    });

    it('should fail validation when templateId is empty', () => {
      const command: CreateCardCommand = {
        blockId: '20240101000000-abc1234',
        templateId: '',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design'
          }
        ]
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('templateId cannot be empty');
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
        templateId: 'basic',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design'
          }
        ],
        priority: -1
      };

      const error = validateCreateCardCommand(command);
      expect(error).toBe('priority must be >= 0');
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
