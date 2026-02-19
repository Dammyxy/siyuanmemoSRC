/**
 * CardApplicationService 单元测试
 * 
 * @description
 * 测试 CardApplicationService 是否正确委托给各个用例。
 * 使用 mock 对象隔离测试，不依赖实际的用例实现。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardApplicationService } from '../CardApplicationService';
import { CreateCardUseCase } from '../../usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '../../usecases/card/DeleteCardUseCase';
import { UpdateCardUseCase } from '../../usecases/card/UpdateCardUseCase';
import { CreateCardCommand } from '../../commands/card/CreateCardCommand';
import { DeleteCardCommand } from '../../commands/card/DeleteCardCommand';
import { UpdateCardCommand } from '../../commands/card/UpdateCardCommand';
import { ok, err } from '@/types/result';
import { Card } from '@/core/xiuyuan/domain/Card';
import { CardId } from '@/core/xiuyuan/domain/CardId';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { ScheduleInfo } from '@/core/xiuyuan/domain/ScheduleInfo';

describe('CardApplicationService', () => {
  let service: CardApplicationService;
  let mockCreateCardUseCase: CreateCardUseCase;
  let mockDeleteCardUseCase: DeleteCardUseCase;
  let mockUpdateCardUseCase: UpdateCardUseCase;

  beforeEach(() => {
    // 创建 mock 用例
    mockCreateCardUseCase = {
      execute: vi.fn()
    } as any;

    mockDeleteCardUseCase = {
      execute: vi.fn()
    } as any;

    mockUpdateCardUseCase = {
      execute: vi.fn()
    } as any;

    // 创建服务实例
    service = new CardApplicationService(
      mockCreateCardUseCase,
      mockDeleteCardUseCase,
      mockUpdateCardUseCase
    );
  });

  describe('createCard', () => {
    it('应该委托给 CreateCardUseCase', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-abc123',
        templateId: 'basic',
        faces: [
          { question: 'Q1', answer: 'A1' }
        ]
      };

      const cardIdResult = CardId.create('card-123');
      const xiuyuanIdResult = XiuyuanId.create('xiuyuan-456');
      
      if (!cardIdResult.ok || !xiuyuanIdResult.ok) {
        throw new Error('Failed to create test IDs');
      }

      const cardResult = Card.create({
        id: cardIdResult.value,
        xiuyuanId: xiuyuanIdResult.value,
        faceIndex: 0,
        scheduleInfo: ScheduleInfo.createDefault(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      if (!cardResult.ok) {
        throw new Error('Failed to create test card');
      }

      const mockCard = cardResult.value;

      vi.mocked(mockCreateCardUseCase.execute).mockResolvedValue(ok(mockCard));

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(mockCreateCardUseCase.execute).toHaveBeenCalledWith(command);
      expect(mockCreateCardUseCase.execute).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockCard);
      }
    });

    it('应该返回用例的错误结果', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-abc123',
        templateId: 'basic',
        faces: [
          { question: 'Q1', answer: 'A1' }
        ]
      };

      const error = new Error('Failed to create card');
      vi.mocked(mockCreateCardUseCase.execute).mockResolvedValue(err(error));

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(mockCreateCardUseCase.execute).toHaveBeenCalledWith(command);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('deleteCard', () => {
    it('应该委托给 DeleteCardUseCase', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'card-123'
      };

      vi.mocked(mockDeleteCardUseCase.execute).mockResolvedValue(ok(undefined));

      // Act
      const result = await service.deleteCard(command);

      // Assert
      expect(mockDeleteCardUseCase.execute).toHaveBeenCalledWith(command);
      expect(mockDeleteCardUseCase.execute).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });

    it('应该返回用例的错误结果', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'card-123'
      };

      const error = new Error('Card not found');
      vi.mocked(mockDeleteCardUseCase.execute).mockResolvedValue(err(error));

      // Act
      const result = await service.deleteCard(command);

      // Assert
      expect(mockDeleteCardUseCase.execute).toHaveBeenCalledWith(command);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('updateCard', () => {
    it('应该委托给 UpdateCardUseCase', async () => {
      // Arrange
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 1
      };

      vi.mocked(mockUpdateCardUseCase.execute).mockResolvedValue(ok(undefined));

      // Act
      const result = await service.updateCard(command);

      // Assert
      expect(mockUpdateCardUseCase.execute).toHaveBeenCalledWith(command);
      expect(mockUpdateCardUseCase.execute).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });

    it('应该返回用例的错误结果', async () => {
      // Arrange
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'xiuyuan-456',
        faceIndex: 1
      };

      const error = new Error('Invalid faceIndex');
      vi.mocked(mockUpdateCardUseCase.execute).mockResolvedValue(err(error));

      // Act
      const result = await service.updateCard(command);

      // Assert
      expect(mockUpdateCardUseCase.execute).toHaveBeenCalledWith(command);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });
});
