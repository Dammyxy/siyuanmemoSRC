/**
 * CardCreationHelper 单元测试
 * 
 * @description
 * 测试 CardCreationHelper 的各个便捷方法是否正确构造 CreateCardCommand
 * 并调用 CardApplicationService。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardCreationHelper } from '../CardCreationHelper';
import { CardApplicationService } from '../../services/CardApplicationService';
import { ok } from '@/types/result';
import { Card } from '@/core/xiuyuan/domain/Card';

describe('CardCreationHelper', () => {
  let helper: CardCreationHelper;
  let mockCardService: CardApplicationService;

  beforeEach(() => {
    // 创建 mock CardApplicationService
    mockCardService = {
      createCard: vi.fn(),
    } as any;

    helper = new CardCreationHelper(mockCardService);
  });

  describe('createConceptCard', () => {
    it('should create single-block concept card with A-Factor scheduler', async () => {
      // Arrange
      const blockId = 'block-1';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createConceptCard(blockId);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId],
        cardType: 'concept',
        schedulerType: 'a-factor',
        priority: 50,
        metadata: {
          source: 'auto',
        },
      });
    });

    it('should create concept-descriptor card with FSRS v6 scheduler', async () => {
      // Arrange
      const blockId = 'block-1';
      const descriptorBlockId = 'block-2';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createConceptCard(blockId, {
        descriptorBlockId,
        priority: 80,
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId, descriptorBlockId],
        cardType: 'concept',
        schedulerType: 'fsrs-v6',
        priority: 80,
        metadata: {
          source: 'auto',
        },
      });
    });

    it('should allow overriding scheduler type with useAFactor option', async () => {
      // Arrange
      const blockId = 'block-1';
      const descriptorBlockId = 'block-2';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createConceptCard(blockId, {
        descriptorBlockId,
        useAFactor: true,
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId, descriptorBlockId],
        cardType: 'concept',
        schedulerType: 'a-factor',
        priority: 50,
        metadata: {
          source: 'auto',
        },
      });
    });

    it('should pass custom metadata', async () => {
      // Arrange
      const blockId = 'block-1';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createConceptCard(blockId, {
        metadata: {
          customField: 'customValue',
        },
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId],
        cardType: 'concept',
        schedulerType: 'a-factor',
        priority: 50,
        metadata: {
          source: 'auto',
          customField: 'customValue',
        },
      });
    });
  });

  describe('createSymbolCard', () => {
    it('should create symbol card with builtin-symbol-qa template', async () => {
      // Arrange
      const blockId = 'block-1';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createSymbolCard(blockId, {
        priority: 70,
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId],
        templateId: 'builtin-symbol-qa',
        cardType: 'item',
        priority: 70,
        metadata: {
          source: 'symbol',
          symbolDetected: true,
        },
      });
    });

    it('should use default priority 50 when not specified', async () => {
      // Arrange
      const blockId = 'block-1';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createSymbolCard(blockId);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId],
        templateId: 'builtin-symbol-qa',
        cardType: 'item',
        priority: 50,
        metadata: {
          source: 'symbol',
          symbolDetected: true,
        },
      });
    });
  });

  describe('createQuickCard', () => {
    it('should create quick card with item type', async () => {
      // Arrange
      const blockId = 'block-1';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createQuickCard(blockId, {
        priority: 60,
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [blockId],
        cardType: 'item',
        priority: 60,
        metadata: {
          source: 'quick',
        },
      });
    });
  });

  describe('createBidirectionalCard', () => {
    it('should create bidirectional card with builtin-bidirectional template', async () => {
      // Arrange
      const termBlockId = 'term-block';
      const definitionBlockId = 'definition-block';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createBidirectionalCard(
        termBlockId,
        definitionBlockId,
        { priority: 75 }
      );

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [termBlockId, definitionBlockId],
        templateId: 'builtin-bidirectional',
        cardType: 'item',
        priority: 75,
        metadata: {
          source: 'manual',
        },
      });
    });
  });

  describe('createListTemplateCard', () => {
    it('should create list template card with builtin-list-item template', async () => {
      // Arrange
      const parentBlockId = 'parent-block';
      const mockCard = { id: 'card-1' } as Card;
      vi.mocked(mockCardService.createCard).mockResolvedValue(ok(mockCard));

      // Act
      const result = await helper.createListTemplateCard(parentBlockId, {
        priority: 65,
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(mockCardService.createCard).toHaveBeenCalledWith({
        blockIds: [parentBlockId],
        templateId: 'builtin-list-item',
        cardType: 'item',
        priority: 65,
        metadata: {
          source: 'manual',
        },
      });
    });
  });
});
