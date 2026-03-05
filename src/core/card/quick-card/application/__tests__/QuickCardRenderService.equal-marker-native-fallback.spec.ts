import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCardRenderService } from '../QuickCardRenderService';
import { QuickCard } from '../../domain/QuickCard';
import { CardFace } from '../../domain/CardFace';
import type { QuickCardRepository } from '../../infrastructure/QuickCardRepository';

describe('QuickCardRenderService == native fallback', () => {
  let service: QuickCardRenderService;
  let mockRepository: Pick<QuickCardRepository, 'loadCard'>;

  beforeEach(() => {
    mockRepository = {
      loadCard: vi.fn(),
    };
    service = new QuickCardRenderService(mockRepository as QuickCardRepository);
  });

  it('returns false for isQuickCard when symbol is ==', async () => {
    const equalMarkerCard = new QuickCard({
      id: 'quick-card-equal',
      blockId: 'block-equal',
      type: 'cloze',
      frontContent: new CardFace({ html: 'test<mark>[...]</mark>', hiddenTypes: [] }),
      backContent: new CardFace({ html: 'test<mark>answer</mark>', hiddenTypes: [] }),
      metadata: { symbol: '==' },
    });
    vi.mocked(mockRepository.loadCard).mockResolvedValue(equalMarkerCard);

    const result = await service.isQuickCard('block-equal', 'card-equal');

    expect(result).toBe(false);
  });

  it('returns null for prepareViewModel when symbol is ==', async () => {
    const equalMarkerCard = new QuickCard({
      id: 'quick-card-equal',
      blockId: 'block-equal',
      type: 'cloze',
      frontContent: new CardFace({ html: 'test<mark>[...]</mark>', hiddenTypes: [] }),
      backContent: new CardFace({ html: 'test<mark>answer</mark>', hiddenTypes: [] }),
      metadata: { symbol: '==' },
    });
    vi.mocked(mockRepository.loadCard).mockResolvedValue(equalMarkerCard);

    const result = await service.prepareViewModel('block-equal', 'front', 'card-equal');

    expect(result).toBeNull();
  });

  it('keeps non-== quick card behavior unchanged', async () => {
    const normalClozeCard = new QuickCard({
      id: 'quick-card-brace',
      blockId: 'block-brace',
      type: 'cloze',
      frontContent: new CardFace({ html: 'test[...]', hiddenTypes: [] }),
      backContent: new CardFace({ html: 'test<mark>answer</mark>', hiddenTypes: [] }),
      metadata: { symbol: '{{}}' },
    });
    vi.mocked(mockRepository.loadCard).mockResolvedValue(normalClozeCard);
    vi.spyOn(service as unknown as { loadBreadcrumbs: (blockId: string) => Promise<unknown[]> }, 'loadBreadcrumbs')
      .mockResolvedValue([]);

    const isQuick = await service.isQuickCard('block-brace', 'card-brace');
    const viewModel = await service.prepareViewModel('block-brace', 'front', 'card-brace');

    expect(isQuick).toBe(true);
    expect(viewModel).not.toBeNull();
    expect(viewModel?.metadata.symbol).toBe('{{}}');
  });
});
