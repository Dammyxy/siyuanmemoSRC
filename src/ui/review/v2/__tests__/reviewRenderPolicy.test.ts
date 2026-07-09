import { describe, expect, it } from 'vitest';
import type { FSRSCard } from '@/types/card';
import {
  buildReviewRenderableRenderPolicy,
  buildReviewRenderCacheKey,
  buildReviewRenderCacheKeyFromPolicy,
  buildReviewRenderWatchKey,
  buildReviewRenderWatchKeyFromPolicy,
  isNeuralRoamNonFlashcard,
  resolveReviewSpecialRendererKind,
  shouldBypassSemanticFallback,
  shouldPreferStableQuickForcePath,
  shouldVerifyQuickDefaultProfile,
} from '../reviewRenderPolicy';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('reviewRenderPolicy', () => {
  it('forces Protyle policy condition when neural roam node is non-flashcard even if forceQuickRender=true', () => {
    const card = createCard({
      meta: {
        neuralContext: {
          isFlashcard: false,
        },
        forceQuickRender: true,
      },
    });

    expect(isNeuralRoamNonFlashcard(card)).toBe(true);
  });

  it('keeps quick-render eligibility condition for neural roam flashcard nodes', () => {
    const card = createCard({
      meta: {
        neuralContext: {
          isFlashcard: true,
        },
      },
    });

    expect(isNeuralRoamNonFlashcard(card)).toBe(false);
  });

  it('buildReviewRenderCacheKey changes when cardId/typeMarker/neural isFlashcard changes', () => {
    const base = {
      blockId: 'block-1',
      cardId: 'card-1',
      cardType: 'item',
      typeMarker: 'forward',
      neuralIsFlashcard: true,
      forceProtyleRender: false,
      forceQuickRender: false,
    } as const;

    const keyA = buildReviewRenderCacheKey(base);
    const keyB = buildReviewRenderCacheKey({ ...base, cardId: 'card-2' });
    const keyC = buildReviewRenderCacheKey({ ...base, typeMarker: 'reverse' });
    const keyD = buildReviewRenderCacheKey({ ...base, neuralIsFlashcard: false });

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toBe(keyD);
  });

  it('buildReviewRenderWatchKey changes when force flags or isFlashcard changes', () => {
    const base = {
      contentType: 'protyle',
      blockId: 'block-1',
      cardId: 'card-1',
      cardType: 'item',
      typeMarker: 'forward',
      neuralIsFlashcard: true,
      forceProtyleRender: false,
      forceQuickRender: false,
    } as const;

    const keyA = buildReviewRenderWatchKey(base);
    const keyB = buildReviewRenderWatchKey({ ...base, forceQuickRender: true });
    const keyC = buildReviewRenderWatchKey({ ...base, forceProtyleRender: true });
    const keyD = buildReviewRenderWatchKey({ ...base, neuralIsFlashcard: false });

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toBe(keyD);
  });

  it('requires verification before quick-default render profile can use quick renderer', () => {
    expect(shouldVerifyQuickDefaultProfile('quick-default')).toBe(true);
    expect(shouldVerifyQuickDefaultProfile('descriptor')).toBe(false);
    expect(shouldVerifyQuickDefaultProfile(null)).toBe(false);
  });

  it('bypasses semantic fallback for explicit item cards in auto render mode', () => {
    const card = createCard({
      type: 'item',
      meta: {},
    });

    expect(shouldBypassSemanticFallback(card, null)).toBe(true);
  });

  it('does not bypass semantic fallback when semantic route markers still exist', () => {
    const card = createCard({
      type: 'item',
      meta: {
        typeMarker: 'concept-descriptor-forward',
      },
    });

    expect(shouldBypassSemanticFallback(card, null)).toBe(false);
    expect(shouldBypassSemanticFallback(createCard({
      type: 'item',
      meta: {
        forceQuickRender: true,
      },
    }), null)).toBe(false);
    expect(shouldBypassSemanticFallback(createCard(), 'descriptor')).toBe(false);
  });

  it('does not bypass semantic fallback for persisted symbol/quick cards', () => {
    expect(shouldBypassSemanticFallback(createCard({
      meta: {
        source: 'symbol',
        symbolDetected: true,
      },
    }), null)).toBe(false);

    expect(shouldBypassSemanticFallback(createCard({
      meta: {
        source: 'quick',
      },
    }), null)).toBe(false);
  });

  it('promotes persisted symbol quick metadata into the forced quick path', () => {
    expect(shouldPreferStableQuickForcePath(createCard({
      meta: {
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
      },
    }), null)).toBe(true);

    expect(shouldPreferStableQuickForcePath(createCard({
      meta: {
        source: 'symbol',
        symbolDetected: true,
      },
    }), 'quick-inline-formula')).toBe(false);

    expect(shouldPreferStableQuickForcePath(createCard({
      meta: {
        source: 'symbol',
        symbolDetected: true,
      },
    }), 'descriptor')).toBe(false);

    expect(shouldPreferStableQuickForcePath(createCard({
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'default',
        renderProfile: 'quick-default',
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '==',
      },
    }), null)).toBe(false);
  });

  it('keeps progressive derived items off the forced quick path', () => {
    expect(shouldPreferStableQuickForcePath(createCard({
      meta: {
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
        progressive: {
          kind: 'derived-item',
        },
      },
    }), null)).toBe(false);

    expect(shouldPreferStableQuickForcePath(createCard({
      meta: {
        source: 'topic-derived',
        symbolDetected: true,
        cardSource: 'topic-derived',
        symbolType: '>>',
        progressive: {
          kind: 'derived-item',
        },
      },
    }), 'quick-default')).toBe(false);
  });

  it('bypasses semantic fallback quick detection for progressive derived items', () => {
    expect(shouldBypassSemanticFallback(createCard({
      meta: {
        source: 'topic-derived',
        cardSource: 'topic-derived',
        renderProfile: 'quick-default',
        progressive: {
          kind: 'derived-item',
        },
      },
    }), 'quick-default')).toBe(true);
  });

  it('routes inline formula multi-cloze cards to the multi-cloze renderer', () => {
    const card = createCard({
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'inline-formula-cloze',
        faceIndex: 1,
        faces: [{ question: '$$[...]$$', answer: '$$x$$' }],
      },
    });

    expect(resolveReviewSpecialRendererKind({
      card,
      contentType: 'protyle',
      renderProfile: 'quick-inline-formula',
    })).toBe('multi-cloze');
  });

  it('keeps inline formula multi-cloze ahead of stale semantic metadata', () => {
    const card = createCard({
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'inline-formula-cloze',
        renderProfile: 'quick-default',
        typeMarker: 'concept-definition-forward',
        fieldMapping: {
          definition: 'block-definition',
        },
        faceIndex: 1,
        faces: [{ question: '$$[...]$$', answer: '$$x$$' }],
      },
    });

    expect(resolveReviewSpecialRendererKind({
      card,
      contentType: 'protyle',
      renderProfile: 'quick-inline-formula',
      isConceptDefinitionCard: true,
      isDescriptorCard: true,
      isQuickCard: true,
    })).toBe('multi-cloze');
  });

  it('routes ordinary multi-cloze cards to the multi-cloze renderer', () => {
    const card = createCard({
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'default',
        renderProfile: 'quick-default',
        faceIndex: 0,
        faces: [{ question: 'Alpha [...]', answer: 'Beta' }],
      },
    });

    expect(resolveReviewSpecialRendererKind({
      card,
      contentType: 'protyle',
      renderProfile: null,
    })).toBe('multi-cloze');
  });

  it('resolves deterministic quick-symbol metadata through the render contract even with stale Protyle routing', () => {
    const policy = buildReviewRenderableRenderPolicy(createCard({
      meta: {
        forceProtyleRender: true,
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
        quickDetectReason: 'symbol-rule',
      },
    }));

    expect(policy).toEqual(expect.objectContaining({
      specialRendererKind: 'quick',
      semanticKind: 'quick',
      forceProtyleRender: false,
      forceQuickRender: true,
      renderContract: expect.objectContaining({
        renderFamily: 'quick-symbol',
        rendererKind: 'quick',
        quickSymbolEvidence: expect.arrayContaining([
          expect.objectContaining({ path: 'meta.cardSource', value: 'quick-symbol' }),
        ]),
        repairPatch: expect.objectContaining({
          metaDelete: ['forceProtyleRender'],
        }),
      }),
      diagnostics: expect.arrayContaining(['render-contract-stale-force-protyle']),
    }));
  });

  it('routes riff-managed symbol cards through the quick renderer when live source evidence is provided', () => {
    const policy = buildReviewRenderableRenderPolicy(createCard({
      id: '20260610140511-bb340gl',
      blockId: '20260610140511-bb340gl',
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        faces: [{
          question: '反思&gt;&gt;反思',
          answer: '',
        }],
      },
    }), {
      contentBlockId: '20260610140511-bb340gl',
      sourceContent: '反思>>反思',
    });

    expect(policy).toEqual(expect.objectContaining({
      specialRendererKind: 'quick',
      semanticKind: 'quick',
      forceProtyleRender: false,
      forceQuickRender: true,
      renderContract: expect.objectContaining({
        rendererKind: 'quick',
        renderFamily: 'quick-symbol',
        repairPatch: expect.objectContaining({
          metaPatch: expect.objectContaining({
            symbolType: '>>',
          }),
        }),
      }),
      diagnostics: expect.arrayContaining([
        'render-contract-riff-symbol-repair-required',
      ]),
    }));
  });

  it('routes image occlusion cards before custom prepared renderers', () => {
    const card = createCard({
      meta: {
        imageOcclusion: true,
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'inline-formula-cloze',
        faceIndex: 0,
        faces: [{ question: 'front', answer: 'back' }],
      },
    });

    expect(resolveReviewSpecialRendererKind({
      card,
      contentType: 'protyle',
      renderProfile: 'quick-inline-formula',
    })).toBe('image-occlusion');
  });

  it('builds policy cache and watch keys from faceKey tokens instead of stale legacy faceIndex', () => {
    const policy = {
      version: 1,
      profile: 'descriptor',
      specialRendererKind: 'descriptor',
      semanticKind: 'descriptor',
      forceProtyleRender: false,
      forceQuickRender: false,
      quickDetectReason: '',
      cacheTokens: {
        cardId: 'card-1',
        blockId: 'descriptor-block',
        cardType: 'item',
        faceToken: 'rule:descriptor-reverse::face:2',
        ruleId: 'descriptor-reverse',
        updatedAt: '12345',
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
    } as const;

    const cacheKey = buildReviewRenderCacheKeyFromPolicy({
      blockId: 'descriptor-block',
      policy,
    });
    const watchKey = buildReviewRenderWatchKeyFromPolicy({
      contentType: 'protyle',
      blockId: 'descriptor-block',
      policy,
    });

    expect(cacheKey).toContain('fk:rule:descriptor-reverse::face:2');
    expect(cacheKey).toContain('rid:descriptor-reverse');
    expect(cacheKey).toContain('sr:descriptor');
    expect(cacheKey).not.toContain('concept-definition-forward');
    expect(cacheKey).not.toContain('faceIndex');
    expect(watchKey).toContain('ct:protyle');
    expect(watchKey).toContain('fk:rule:descriptor-reverse::face:2');
  });
});
