import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { resolveSrsCardRenderContract } from '../SrsCardRenderContractResolver';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.Review,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function receiptStatus(contract: ReturnType<typeof resolveSrsCardRenderContract>, kind: string): string | undefined {
  return contract.requiredReceipts.find(receipt => receipt.kind === kind)?.status;
}

describe('SrsCardRenderContractResolver', () => {
  it('represents ordinary source-block cards as Protyle render family', () => {
    const contract = resolveSrsCardRenderContract({
      card: buildCard(),
      contentBlockId: 'block-1',
    });

    expect(contract).toMatchObject({
      rendererKind: 'protyle',
      renderFamily: 'protyle',
      frontBackContract: { mode: 'not-required' },
      diagnostics: [],
    });
    expect(receiptStatus(contract, 'quick-symbol-evidence')).toBe('not-required');
  });

  it('resolves CDF and concept cards through the contract renderer families', () => {
    expect(resolveSrsCardRenderContract({
      card: buildCard({
        meta: { fieldMapping: { definition: 'definition-block' } },
      }),
    })).toMatchObject({
      rendererKind: 'concept-definition',
      renderFamily: 'concept-definition',
    });

    expect(resolveSrsCardRenderContract({
      card: buildCard({
        meta: { fieldMapping: { descriptor: 'descriptor-block' } },
      }),
    })).toMatchObject({
      rendererKind: 'descriptor',
      renderFamily: 'descriptor',
    });

    expect(resolveSrsCardRenderContract({
      card: buildCard({ type: CardType.Concept }),
    })).toMatchObject({
      rendererKind: 'concept',
      renderFamily: 'concept',
    });
  });

  it('resolves image occlusion and native multi-cloze as renderer-owned families', () => {
    expect(resolveSrsCardRenderContract({
      card: buildCard({ meta: { imageOcclusion: true } }),
    })).toMatchObject({
      rendererKind: 'image-occlusion',
      renderFamily: 'image-occlusion',
      frontBackContract: { mode: 'renderer-owned' },
    });

    expect(resolveSrsCardRenderContract({
      card: buildCard({
        meta: {
          templateID: 'builtin-multi-cloze',
          clozeRenderMode: 'default',
        },
      }),
    })).toMatchObject({
      rendererKind: 'multi-cloze',
      renderFamily: 'native-multi-cloze',
      frontBackContract: { mode: 'renderer-owned' },
    });
  });

  it('exposes quick-symbol front/back contract, receipts, repair patch, and route conflicts', () => {
    const contract = resolveSrsCardRenderContract({
      card: buildCard({
        meta: {
          source: 'symbol',
          symbolDetected: true,
          cardSource: 'quick-symbol',
          symbolType: '>>',
          quickDetectReason: 'symbol-rule',
          forceProtyleRender: true,
        },
      }),
      contentBlockId: 'block-1',
      answerBlockId: 'answer-block',
    });

    expect(contract).toMatchObject({
      rendererKind: 'quick',
      renderFamily: 'quick-symbol',
      frontBackContract: {
        mode: 'quick-side',
        beforeReveal: 'front',
        afterReveal: 'back',
      },
      repairPatch: {
        metaDelete: ['forceProtyleRender'],
      },
    });
    expect(receiptStatus(contract, 'source-block-id')).toBe('present');
    expect(receiptStatus(contract, 'card-id')).toBe('present');
    expect(receiptStatus(contract, 'quick-symbol-evidence')).toBe('present');
    expect(receiptStatus(contract, 'quick-symbol-type')).toBe('present');
    expect(receiptStatus(contract, 'answer-block-route')).toBe('conflict');
    expect(contract.diagnostics).toEqual(expect.arrayContaining([
      'render-contract-stale-force-protyle',
      'render-contract-answer-block-route-conflict',
    ]));
  });

  it('diagnoses missing quick-symbol type and source-block mismatch without changing renderer family', () => {
    const contract = resolveSrsCardRenderContract({
      card: buildCard({
        blockId: 'source-block',
        meta: { source: 'symbol' },
      }),
      contentBlockId: 'review-content-block',
    });

    expect(contract).toMatchObject({
      rendererKind: 'quick',
      renderFamily: 'quick-symbol',
    });
    expect(receiptStatus(contract, 'quick-symbol-type')).toBe('missing');
    expect(receiptStatus(contract, 'quick-source-block-match')).toBe('conflict');
    expect(contract.diagnostics).toEqual(expect.arrayContaining([
      'render-contract-symbol-type-missing',
      'render-contract-source-block-mismatch',
    ]));
  });

  it('repairs riff-managed symbol cards from live source grammar', () => {
    const contract = resolveSrsCardRenderContract({
      card: buildCard({
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
      }),
      contentBlockId: '20260610140511-bb340gl',
      sourceContent: '反思>>反思',
    });

    expect(contract).toMatchObject({
      rendererKind: 'quick',
      renderFamily: 'quick-symbol',
      frontBackContract: {
        mode: 'quick-side',
        beforeReveal: 'front',
        afterReveal: 'back',
      },
      repairPatch: {
        metaPatch: {
          symbolDetected: true,
          cardSource: 'quick-symbol',
          symbolType: '>>',
          quickDetectReason: 'symbol-rule',
        },
      },
    });
    expect(receiptStatus(contract, 'quick-symbol-evidence')).toBe('present');
    expect(receiptStatus(contract, 'quick-symbol-type')).toBe('present');
    expect(contract.quickSymbolEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'live-source',
        path: 'sourceContent',
        value: '>>',
      }),
    ]));
    expect(contract.diagnostics).toContain('render-contract-riff-symbol-repair-required');
  });

  it('does not route stale riff face text to quick rendering without live source evidence', () => {
    const contract = resolveSrsCardRenderContract({
      card: buildCard({
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
      }),
      contentBlockId: '20260610140511-bb340gl',
    });

    expect(contract).toMatchObject({
      rendererKind: 'protyle',
      renderFamily: 'protyle',
      repairPatch: null,
    });
    expect(contract.quickSymbolEvidence).toEqual([]);
    expect(contract.diagnostics).toContain('riff-symbol-live-source-missing');
  });
});
