import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickCardRenderService } from '../QuickCardRenderService';
import type { QuickCardRepository } from '../../infrastructure/QuickCardRepository';
import { QuickCard } from '../../domain/QuickCard';
import { CardFace } from '../../domain/CardFace';
import { QuickCardRenderError } from '../../domain/types';

describe('QuickCardRenderService', () => {
  let service: QuickCardRenderService;
  let mockRepository: QuickCardRepository;

  beforeEach(() => {
    // 创建 mock repository
    mockRepository = {
      loadCard: vi.fn(),
    } as any;

    service = new QuickCardRenderService(mockRepository);
    vi.spyOn(service as unknown as { loadBreadcrumbs: (blockId: string) => Promise<unknown[]> }, 'loadBreadcrumbs')
      .mockResolvedValue([]);
  });

  describe('prepareViewModel', () => {
    it('should prepare front face of basic card as rich content', async () => {
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
      const result = await service.prepareViewModel('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.content.html).toBe('Question');
      expect(result?.content.source).toMatchObject({
        id: '123:front',
        kind: 'quick',
        field: 'front',
      });
      expect(result?.cardType).toBe('basic');
      expect(result?.cssClasses).toEqual([]);
    });

    it('should prepare back face of basic card as rich content', async () => {
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
      const result = await service.prepareViewModel('123', 'back');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.content.html).toBe('Answer');
      expect(result?.cardType).toBe('basic');
    });

    it('should fail closed with diagnostics when card not found', async () => {
      // Arrange
      vi.mocked(mockRepository.loadCard).mockResolvedValue(null);

      await expect(service.prepareViewModel('nonexistent', 'front'))
        .rejects
        .toMatchObject({
          name: 'QuickCardRenderError',
          code: 'quick-source-block-missing',
          diagnostics: ['quick-source-block-missing'],
          context: { blockId: 'nonexistent' },
        });
    });

    it('should fail closed with diagnostics when native cloze belongs to Protyle', async () => {
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'cloze',
        frontContent: new CardFace({ html: 'Question', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '==' },
      });
      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      await expect(service.prepareViewModel('123', 'front', 'card-123'))
        .rejects
        .toBeInstanceOf(QuickCardRenderError);
      await expect(service.prepareViewModel('123', 'front', 'card-123'))
        .rejects
        .toMatchObject({
          code: 'quick-native-cloze-owned-by-protyle',
          diagnostics: ['quick-native-cloze-owned-by-protyle'],
          context: { blockId: '123', cardId: 'card-123', symbol: '==' },
        });
    });

    it('should fail closed with diagnostics when requested face is empty', async () => {
      const mockCard = new QuickCard({
        id: 'quick-card-123',
        blockId: '123',
        type: 'basic',
        frontContent: new CardFace({ html: '', hiddenTypes: [] }),
        backContent: new CardFace({ html: 'Answer', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });
      vi.mocked(mockRepository.loadCard).mockResolvedValue(mockCard);

      await expect(service.prepareViewModel('123', 'front'))
        .rejects
        .toMatchObject({
          code: 'quick-face-empty',
          diagnostics: ['quick-face-empty'],
          context: { blockId: '123', side: 'front' },
        });
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
      const result = await service.prepareViewModel('123', 'front');

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
      const result = await service.prepareViewModel('123', 'front');

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
      const result = await service.prepareViewModel('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual(metadata);
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
      const frontResult = await service.prepareViewModel('123', 'front');
      const backResult = await service.prepareViewModel('123', 'back');

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
      const result = await service.prepareViewModel('123', 'front');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.metadata.isXiuyuanTemplate).toBe(true);
      expect(result?.content.html).toContain('关于：');
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
