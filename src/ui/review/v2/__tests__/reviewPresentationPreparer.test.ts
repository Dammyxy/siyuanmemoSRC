import { describe, expect, it, vi } from 'vitest';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import type { FSRSCard } from '@/types/card';
import { createEmptyReviewUIState, type ReviewUIState } from '../types';
import { prepareReviewPresentation } from '../reviewPresentationPreparer';

function createCard(meta: Record<string, unknown>): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now,
    stability: 5,
    difficulty: 4,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta,
  } as FSRSCard;
}

function createState(card: FSRSCard): ReviewUIState {
  return {
    ...createEmptyReviewUIState(),
    content: {
      type: 'protyle',
      id: card.blockId,
      data: '',
      card,
    },
  };
}

function createServices(): ReviewRenderServices {
  return {
    descriptorCardRenderService: { prepareViewModel: vi.fn() },
    conceptDefinitionCardRenderService: { prepareViewModel: vi.fn() },
    conceptCardRenderService: { prepareViewModel: vi.fn() },
    quickCardRenderService: { prepareViewModel: vi.fn() },
    multiClozeCardRenderService: { prepareViewModel: vi.fn(async () => ({ kind: 'multi' })) },
  } as unknown as ReviewRenderServices;
}

describe('reviewPresentationPreparer', () => {
  it('prepares inline formula multi-cloze cards through the shared multi-cloze route', async () => {
    const services = createServices();
    const card = createCard({
      templateID: 'builtin-multi-cloze',
      clozeRenderMode: 'inline-formula-cloze',
      renderProfile: 'quick-default',
      typeMarker: 'concept-definition-forward',
      fieldMapping: {
        definition: 'definition-block',
      },
      faceIndex: 1,
      faces: [{ question: '$$[...]$$', answer: '$$x$$' }],
    });

    const prepared = await prepareReviewPresentation(createState(card), services);

    expect(services.multiClozeCardRenderService.prepareViewModel).toHaveBeenCalledWith(card);
    expect(services.conceptDefinitionCardRenderService.prepareViewModel).not.toHaveBeenCalled();
    expect(prepared.content.prepared).toMatchObject({
      rendererKind: 'multi-cloze',
      viewModel: { kind: 'multi' },
    });
  });

  it('does not attempt prepared rendering for image occlusion cards', async () => {
    const services = createServices();
    const card = createCard({
      imageOcclusion: true,
      templateID: 'builtin-multi-cloze',
      clozeRenderMode: 'inline-formula-cloze',
      faceIndex: 0,
      faces: [{ question: 'front', answer: 'back' }],
    });

    const prepared = await prepareReviewPresentation(createState(card), services);

    expect(prepared.content.prepared).toBeUndefined();
    expect(services.multiClozeCardRenderService.prepareViewModel).not.toHaveBeenCalled();
  });
});
