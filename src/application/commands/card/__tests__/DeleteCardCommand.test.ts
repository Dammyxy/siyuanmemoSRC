/**
 * DeleteCardCommand 单元测试
 */

import { describe, it, expect } from 'vitest';
import { DeleteCardCommand, validateDeleteCardCommand } from '../DeleteCardCommand';

describe('DeleteCardCommand', () => {
  describe('validateDeleteCardCommand', () => {
    it('should pass validation for valid command', () => {
      const command: DeleteCardCommand = {
        cardId: '20240101000000-abc1234'
      };

      const error = validateDeleteCardCommand(command);
      expect(error).toBeNull();
    });

    it('should fail validation when cardId is empty', () => {
      const command: DeleteCardCommand = {
        cardId: ''
      };

      const error = validateDeleteCardCommand(command);
      expect(error).toBe('cardId cannot be empty');
    });

    it('should fail validation when cardId is whitespace only', () => {
      const command: DeleteCardCommand = {
        cardId: '   '
      };

      const error = validateDeleteCardCommand(command);
      expect(error).toBe('cardId cannot be empty');
    });

    it('should fail validation when cardId exceeds 100 characters', () => {
      const command: DeleteCardCommand = {
        cardId: 'a'.repeat(101)
      };

      const error = validateDeleteCardCommand(command);
      expect(error).toBe('cardId cannot exceed 100 characters');
    });

    it('should pass validation when cardId is exactly 100 characters', () => {
      const command: DeleteCardCommand = {
        cardId: 'a'.repeat(100)
      };

      const error = validateDeleteCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation for various valid cardId formats', () => {
      const validCardIds = [
        '20240101000000-abc1234',
        'card-123',
        'simple-id',
        '12345',
        'card_with_underscore',
        'card.with.dots'
      ];

      validCardIds.forEach(cardId => {
        const command: DeleteCardCommand = { cardId };
        const error = validateDeleteCardCommand(command);
        expect(error).toBeNull();
      });
    });
  });
});
