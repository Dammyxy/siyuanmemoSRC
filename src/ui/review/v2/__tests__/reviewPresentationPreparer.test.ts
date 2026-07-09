import { describe, expect, it, vi } from 'vitest';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import type { FSRSCard } from '@/types/card';
import { createEmptyReviewUIState, type ReviewUIState } from '../types';
import {
  buildPreparedReviewPresentationIdentity,
  prepareReviewPresentation,
} from '../reviewPresentationPreparer';

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

function withRenderPolicy(
  state: ReviewUIState,
  rendererKind: NonNullable<ReviewUIState['meta']['renderContext']>['renderPolicy']['specialRendererKind'],
): ReviewUIState {
  return {
    ...state,
    meta: {
      ...state.meta,
      renderContext: {
        version: 1,
        targetKind: 'standard-card',
        targetIdentity: {
          cardId: state.content.card?.id ?? '',
          blockId: state.content.card?.blockId ?? '',
          deckId: '',
        },
        schedulerSnapshot: null,
        sourceLineage: null,
        progressiveDisclosure: null,
        renderPayload: {
          contentBlockId: state.content.id,
          answerBlockId: '',
          cardType: state.content.card?.type ?? null,
          meta: { ...(state.content.card?.meta ?? {}) },
        },
        renderPolicy: {
          version: 1,
          profile: rendererKind === 'descriptor' ? 'descriptor' : null,
          specialRendererKind: rendererKind,
          semanticKind: rendererKind,
          forceProtyleRender: false,
          forceQuickRender: rendererKind === 'quick',
          quickDetectReason: '',
          cacheTokens: {
            cardId: state.content.card?.id ?? '',
            blockId: state.content.card?.blockId ?? '',
            cardType: String(state.content.card?.type ?? ''),
            faceToken: 'rule:descriptor-reverse::face:2',
            ruleId: 'descriptor-reverse',
            updatedAt: String(state.content.card?.updatedAt ?? ''),
          },
          legacyProjection: {
            templateID: 'builtin-riff-sync',
            typeMarker: 'concept-definition-forward',
            faceIndex: 0,
            renderProfile: '',
            clozeRenderMode: '',
            used: ['templateID', 'typeMarker', 'faceIndex'],
          },
          diagnostics: ['legacy-render-projection-read'],
        },
        allowedActions: ['answer', 'edit'],
        diagnostics: [],
        unavailable: {
          writer: 'not-required',
          backend: 'not-required',
        },
        sourcePayloadIdentity: null,
      },
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

    const prepared = await prepareReviewPresentation(withRenderPolicy(createState(card), 'multi-cloze'), services);

    expect(services.multiClozeCardRenderService.prepareViewModel).toHaveBeenCalledWith(card);
    expect(services.conceptDefinitionCardRenderService.prepareViewModel).not.toHaveBeenCalled();
    expect(prepared.content.prepared).toMatchObject({
      rendererKind: 'multi-cloze',
      viewModel: { kind: 'multi' },
    });
  });

  it('does not infer prepared renderer from legacy metadata without render policy', async () => {
    const services = createServices();
    const card = createCard({
      templateID: 'builtin-multi-cloze',
      clozeRenderMode: 'inline-formula-cloze',
      renderProfile: 'quick-default',
      typeMarker: 'concept-definition-forward',
      faces: [{ question: '$$[...]$$', answer: '$$x$$' }],
    });

    const prepared = await prepareReviewPresentation(createState(card), services);

    expect(prepared.content.prepared).toBeUndefined();
    expect(services.multiClozeCardRenderService.prepareViewModel).not.toHaveBeenCalled();
    expect(services.conceptDefinitionCardRenderService.prepareViewModel).not.toHaveBeenCalled();
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

  it('prepares quick cards as front before reveal and back after reveal', async () => {
    const services = createServices();
    services.quickCardRenderService.prepareViewModel = vi.fn(async (_blockId, side) => ({ kind: 'quick', side }));
    const card = createCard({
      source: 'symbol',
      symbolDetected: true,
      cardSource: 'quick-symbol',
      symbolType: '>>',
    });
    const baseState = withRenderPolicy(createState(card), 'quick');

    const hidden = await prepareReviewPresentation({
      ...baseState,
      actions: {
        ...baseState.actions,
        showAnswer: true,
      },
    }, services);
    const revealed = await prepareReviewPresentation({
      ...baseState,
      actions: {
        ...baseState.actions,
        showAnswer: false,
      },
      content: {
        ...baseState.content,
        prepared: undefined,
      },
    }, services);

    expect(services.quickCardRenderService.prepareViewModel).toHaveBeenNthCalledWith(1, 'block-1', 'front', 'card-1');
    expect(services.quickCardRenderService.prepareViewModel).toHaveBeenNthCalledWith(2, 'block-1', 'back', 'card-1');
    expect(hidden.content.prepared).toMatchObject({
      rendererKind: 'quick',
      viewModel: { kind: 'quick', side: 'front' },
    });
    expect(revealed.content.prepared).toMatchObject({
      rendererKind: 'quick',
      viewModel: { kind: 'quick', side: 'back' },
    });
  });

  it('uses render context policy before stale legacy semantic metadata when preparing renderer view models', async () => {
    const services = createServices();
    services.descriptorCardRenderService.prepareViewModel = vi.fn(async () => ({ kind: 'descriptor' }));
    const card = createCard({
      templateID: 'builtin-riff-sync',
      typeMarker: 'concept-definition-forward',
      fieldMapping: {
        concept: 'concept-block',
        descriptor: 'descriptor-block',
      },
      faceIndex: 0,
    });
    const state = withRenderPolicy({
      ...createState(card),
      content: {
        ...createState(card).content,
        id: 'descriptor-block',
      },
    }, 'descriptor');

    const prepared = await prepareReviewPresentation(state, services);

    expect(services.descriptorCardRenderService.prepareViewModel).toHaveBeenCalledWith('descriptor-block', card);
    expect(services.conceptDefinitionCardRenderService.prepareViewModel).not.toHaveBeenCalled();
    expect(prepared.content.prepared).toMatchObject({
      rendererKind: 'descriptor',
      viewModel: { kind: 'descriptor' },
    });
    expect(prepared.content.prepared?.identityKey).toContain('rule:descriptor-reverse::face:2');
    expect(prepared.content.prepared?.identityKey).not.toContain('concept-definition-forward');
  });

  it('keeps image occlusion excluded even when render context policy is present', async () => {
    const services = createServices();
    const card = createCard({
      imageOcclusion: true,
      templateID: 'builtin-multi-cloze',
      clozeRenderMode: 'inline-formula-cloze',
      faces: [{ question: 'front', answer: 'back' }],
    });
    const state = withRenderPolicy(createState(card), 'image-occlusion');

    const prepared = await prepareReviewPresentation(state, services);

    expect(prepared.content.prepared).toBeUndefined();
    expect(services.multiClozeCardRenderService.prepareViewModel).not.toHaveBeenCalled();
    expect(services.descriptorCardRenderService.prepareViewModel).not.toHaveBeenCalled();
  });

  it('uses policy identity tokens for prepared presentation identity', () => {
    const card = createCard({
      typeMarker: 'concept-definition-forward',
      faceIndex: 0,
    });
    const state = withRenderPolicy(createState(card), 'descriptor');

    const identity = buildPreparedReviewPresentationIdentity('descriptor', state);

    expect(identity).toContain('rule:descriptor-reverse::face:2');
    expect(identity).not.toContain('concept-definition-forward');
  });
});
