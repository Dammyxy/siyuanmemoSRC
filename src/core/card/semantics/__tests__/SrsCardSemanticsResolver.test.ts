import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  planCardSemanticRepair,
  resolveCardSemantics,
} from '../resolver';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: 1,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.Review,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: overrides.type ?? CardType.Item,
    tags: [],
    cardTypeMarker: overrides.cardTypeMarker,
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1,
    updatedAt: 1,
    meta: overrides.meta,
  };
}

describe('SRS card semantics resolver', () => {
  it('resolves corrupted list-template topic cards as item with a safe repair patch', () => {
    const card = buildCard({
      id: 'list-card',
      type: CardType.Topic,
      meta: { templateID: 'builtin-list-item' },
    });

    const resolution = resolveCardSemantics({ card });

    expect(resolution).toMatchObject({
      effectiveKind: CardType.Item,
      confidence: 'deterministic',
      patch: { type: CardType.Item },
    });
    expect(resolution.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'template', kind: CardType.Item, path: 'meta.templateID' }),
    ]));
    expect(planCardSemanticRepair({ card })).toMatchObject({
      status: 'safe-repair',
      beforeKind: CardType.Topic,
      afterKind: CardType.Item,
    });
  });

  it('resolves CDF definition and descriptor templates as descriptor cards', () => {
    for (const templateID of [
      'builtin-concept-definition',
      'builtin-concept-definition-forward',
      'builtin-concept-definition-reverse',
      'builtin-concept-descriptor',
      'builtin-concept-descriptor-reverse',
      'builtin-concept-descriptor-both',
    ]) {
      const resolution = resolveCardSemantics({
        card: buildCard({
          id: `card-${templateID}`,
          type: CardType.Topic,
          meta: { templateID },
        }),
      });

      expect(resolution).toMatchObject({
        effectiveKind: CardType.Descriptor,
        confidence: 'deterministic',
        patch: { type: CardType.Descriptor, cardTypeMarker: 'descriptor' },
      });
    }
  });

  it('resolves legacy symbol cards as item cards from quick-symbol metadata', () => {
    for (const meta of [
      { source: 'symbol' },
      { symbolDetected: true },
      { cardSource: 'quick-symbol' },
      { symbolType: '>>' },
      { quickDetectReason: 'symbol-rule' },
    ]) {
      const card = buildCard({
        id: `symbol-${Object.keys(meta)[0]}`,
        type: CardType.Topic,
        meta,
      });

      const resolution = resolveCardSemantics({ card });

      expect(resolution).toMatchObject({
        effectiveKind: CardType.Item,
        confidence: 'deterministic',
        patch: { type: CardType.Item },
      });
      expect(resolution.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: 'symbol-source', kind: CardType.Item }),
      ]));
      expect(planCardSemanticRepair({ card })).toMatchObject({
        status: 'safe-repair',
        beforeKind: CardType.Topic,
        afterKind: CardType.Item,
      });
    }
  });

  it('resolves progressive roots and derived items from lineage evidence', () => {
    expect(resolveCardSemantics({
      card: buildCard({
        type: CardType.Item,
        meta: { progressive: { kind: 'piece' } },
      }),
    })).toMatchObject({
      effectiveKind: CardType.Topic,
      confidence: 'deterministic',
      patch: { type: CardType.Topic },
    });

    expect(resolveCardSemantics({
      card: buildCard({
        type: CardType.Topic,
        meta: { progressive: { kind: 'derived-item' } },
      }),
    })).toMatchObject({
      effectiveKind: CardType.Item,
      confidence: 'deterministic',
      patch: { type: CardType.Item },
    });
  });

  it('fails closed when deterministic semantic evidence conflicts', () => {
    const resolution = resolveCardSemantics({
      card: buildCard({
        type: CardType.Topic,
        meta: {
          srsCardCreationReceipt: {
            version: 1,
            semanticKind: CardType.Item,
            templateID: 'builtin-list-item',
            sourceBlockIds: ['block-1'],
            cardIds: ['card-1'],
            creationFamily: 'list-template',
            createdAt: 1,
          },
          templateID: 'builtin-concept-descriptor',
        },
      }),
    });

    expect(resolution).toMatchObject({
      effectiveKind: null,
      confidence: 'ambiguous',
      patch: null,
    });
    expect(resolution.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'semantic-evidence-conflict' }),
    ]));
  });

  it('keeps invalid creation receipts as diagnostic evidence only', () => {
    const resolution = resolveCardSemantics({
      card: buildCard({
        type: CardType.Topic,
        meta: {
          srsCardCreationReceipt: {
            version: 1,
            semanticKind: CardType.Item,
            cardIds: ['different-card'],
            creationFamily: 'list-template',
            createdAt: 1,
          },
          templateID: 'builtin-concept-descriptor',
        },
      }),
    });

    expect(resolution).toMatchObject({
      effectiveKind: CardType.Descriptor,
      confidence: 'deterministic',
    });
    expect(resolution.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'creation-receipt', strength: 'diagnostic', valid: false }),
      expect.objectContaining({ source: 'template', kind: CardType.Descriptor }),
    ]));
  });
});
