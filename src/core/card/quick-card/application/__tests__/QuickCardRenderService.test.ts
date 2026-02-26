import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickCardRenderService } from '../QuickCardRenderService';
import type { QuickCardRepository } from '../../infrastructure/QuickCardRepository';
import { QuickCard } from '../../domain/QuickCard';
import { CardFace } from '../../domain/CardFace';

describe('QuickCardRenderService', () => {
  let service: QuickCardRenderService;
  let mockRepository: QuickCardRepository;

  beforeEach(() => {
    // 创建 mock repository
    mockRepository = {
      loadCard: vi.fn(),
    } as any;

    service = new QuickCardRenderService(mockRepository);
  });

  describe('render', () => {
    it('should render front face of basic card', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.render('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.html).toBe('Question');
      expect(result?.cardType).toBe('basic');
      expect(result?.cssClasses).toEqual([]);
    });

    it('should render back face of basic card', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.render('123', 'back');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.html).toBe('Answer');
      expect(result?.cardType).toBe('basic');
    });

    it('should return null when card not found', async () => {
      // Arrange
      vi.mocked(mockRepository.loadCard).mockResolvedValue(null);

      // Act
      const result = await service.render('nonexistent', 'front');

      // Assert
      expect(result).toBeNull();
    });

    it('should include CSS classes for concept card front', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'concept',
        frontContent: new CardFace({ html: 'Concept', hiddenTypes: ['mark'] }),
        backContent: new CardFace({ html: 'Definition', hiddenTypes: [] }),
        metadata: { symbol: '::' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.render('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.cssClasses).toContain('card__block--hidemark');
    });

    it('should include CSS classes for cloze card front', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'cloze',
        frontContent: new CardFace({ html: 'Text with [...]', hiddenTypes: ['mark'] }),
        backContent: new CardFace({ html: 'Text with <mark>answer</mark>', hiddenTypes: [] }),
        metadata: { symbol: '{{}}' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.render('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.cssClasses).toContain('card__block--hidemark');
    });

    it('should include metadata in result', async () => {
      // Arrange
      const metadata = {
        symbol: '>>',
        parentBlockId: 'parent-123',
      };

      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata,
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.render('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual(metadata);
    });
  });

  describe('toggleFace', () => {
    it('should toggle from front to back', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.toggleFace('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.html).toBe('Answer');
    });

    it('should toggle from back to front', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.toggleFace('123', 'back');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.html).toBe('Question');
    });

    it('should return null when card not found', async () => {
      // Arrange
      vi.mocked(mockRepository.loadCard).mockResolvedValue(null);

      // Act
      const result = await service.toggleFace('nonexistent', 'front');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiLine card with list hiding', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'multiLine',
        frontContent: new CardFace({ html: 'Parent content', hiddenTypes: ['list'] }),
        backContent: new CardFace({ html: 'Parent content\n- Item 1\n- Item 2', hiddenTypes: [] }),
        metadata: { symbol: '>>>' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const frontResult = await service.render('123', 'front');
      const backResult = await service.render('123', 'back');

      // Assert
      expect(frontResult?.cssClasses).toContain('card__block--hideli');
      expect(backResult?.cssClasses).toEqual([]);
    });

    it('should handle descriptor card with Xiuyuan template', async () => {
      // Arrange
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'descriptor',
        frontContent: new CardFace({ html: 'Descriptor (关于：Concept)', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Descriptor\nDescription', hiddenTypes: [] }),
        metadata: {
          symbol: ';;',
          parentBlockId: 'parent-123',
          isXiuyuanTemplate: true,
        },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      // Act
      const result = await service.render('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.metadata.isXiuyuanTemplate).toBe(true);
      expect(result?.html).toContain('关于：');
    });
  });

  describe('isQuickCard', () => {
    it('should pass cardId to repository when detecting quick card', async () => {
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });

      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      const isQuick = await service.isQuickCard('123', 'card-123');

      expect(isQuick).toBe(true);
      expect(mockRepository.loadCard).toHaveBeenCalledWith('123', 'card-123');
    });
  });
});
