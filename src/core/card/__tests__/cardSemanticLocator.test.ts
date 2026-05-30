import { describe, expect, it } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { CardState, CardType } from '@/types/card';
import {
  resolveCardFaceIndex,
  resolveCardFaceKey,
  resolveCardFaceToken,
  resolveCardRuleDirection,
  resolveCardRuleId,
} from '../cardSemanticLocator';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    faceKey: overrides.faceKey,
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
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1,
    updatedAt: 1,
    meta: overrides.meta,
  };
}

describe('cardSemanticLocator', () => {
  it('uses faceKey before stale legacy meta', () => {
    const card = buildCard({
      faceKey: { ruleId: 'concept-definition-reverse', faceIndex: 2 },
      meta: {
        faceIndex: 0,
        typeMarker: 'concept-definition-forward',
      },
    });

    expect(resolveCardFaceKey(card)).toEqual({ ruleId: 'concept-definition-reverse', faceIndex: 2 });
    expect(resolveCardFaceIndex(card)).toBe(2);
    expect(resolveCardRuleId(card)).toBe('concept-definition-reverse');
    expect(resolveCardRuleDirection(card)).toBe('reverse');
    expect(resolveCardFaceToken(card)).toBe('rule:concept-definition-reverse::face:2');
  });

  it('falls back to legacy meta for old cards', () => {
    const card = buildCard({
      meta: {
        ruleIndex: '3',
        typeMarker: 'concept-definition-cloze-3-forward',
      },
    });

    expect(resolveCardFaceKey(card)).toEqual({ ruleId: 'concept-definition-cloze-3-forward', faceIndex: 3 });
    expect(resolveCardFaceIndex(card)).toBe(3);
    expect(resolveCardRuleId(card)).toBe('concept-definition-cloze-3-forward');
    expect(resolveCardRuleDirection(card)).toBe('forward');
    expect(resolveCardFaceToken(card)).toBe('face:3');
  });

  it('normalizes invalid faceKey and default legacy face index', () => {
    const card = buildCard({
      faceKey: { ruleId: '   ', faceIndex: Number.NaN },
      meta: {
        faceIndex: 'not-a-number',
      },
    });

    expect(resolveCardFaceKey(card)).toBeNull();
    expect(resolveCardFaceIndex(card)).toBe(0);
    expect(resolveCardRuleId(card)).toBeNull();
    expect(resolveCardRuleDirection(card)).toBeNull();
    expect(resolveCardFaceToken(card)).toBe('face:0');
  });
});
