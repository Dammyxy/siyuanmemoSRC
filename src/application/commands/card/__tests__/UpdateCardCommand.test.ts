/**
 * UpdateCardCommand 单元测试
 */

import { describe, it, expect } from 'vitest';
import { UpdateCardCommand, validateUpdateCardCommand } from '../UpdateCardCommand';
import { ScheduleInfo } from '../../../../core/xiuyuan/domain/ScheduleInfo';
import { CardState } from '../../../../types/card';

describe('UpdateCardCommand', () => {
  describe('validateUpdateCardCommand', () => {
    it('should pass validation for valid command with faceIndex', () => {
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 1
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation for valid command with scheduleInfo', () => {
      const scheduleInfo = ScheduleInfo.createDefault();
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        scheduleInfo
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should pass validation for valid command with both fields', () => {
      const scheduleInfo = ScheduleInfo.createDefault();
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 2,
        scheduleInfo
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBeNull();
    });

    it('should fail validation when cardId is empty', () => {
      const command: UpdateCardCommand = {
        cardId: '',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 1
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBe('cardId cannot be empty');
    });

    it('should fail validation when cardId is too long', () => {
      const command: UpdateCardCommand = {
        cardId: 'a'.repeat(101),
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 1
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBe('cardId cannot exceed 100 characters');
    });

    it('should fail validation when xiuyuanId is empty', () => {
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: '',
        faceIndex: 1
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBe('xiuyuanId cannot be empty');
    });

    it('should fail validation when xiuyuanId is too long', () => {
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'a'.repeat(101),
        faceIndex: 1
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBe('xiuyuanId cannot exceed 100 characters');
    });

    it('should fail validation when faceIndex is negative', () => {
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: -1
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBe('faceIndex must be >= 0');
    });

    it('should fail validation when no update fields are provided', () => {
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456'
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBe('At least one field must be provided for update');
    });

    it('should pass validation with faceIndex 0', () => {
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 0
      };

      const error = validateUpdateCardCommand(command);
      expect(error).toBeNull();
    });
  });
});
