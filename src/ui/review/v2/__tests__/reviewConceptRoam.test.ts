import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { resolveReviewConceptRoamFocus, resolveReviewConceptRoamTargets } from '../reviewConceptRoam';
import type { ReviewUIState } from '../types';

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'card-block',
    due: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function content(cardValue?: FSRSCard, id = 'content-block'): ReviewUIState['content'] {
  return {
    type: 'protyle',
    id,
    data: '',
    card: cardValue,
  };
}

describe('resolveReviewConceptRoamFocus', () => {
  it('resolves Concept cards from the current concept block id', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      type: CardType.Concept,
      blockId: 'concept-card-block',
    }), 'visible-concept-block'));

    expect(focus?.focusBlockId).toBe('visible-concept-block');
  });

  it('prefers explicit Concept field mapping for Concept cards', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      type: CardType.Concept,
      meta: {
        fieldMapping: {
          concept: 'mapped-concept-block',
        },
      },
    }), 'visible-concept-block'));

    expect(focus?.focusBlockId).toBe('mapped-concept-block');
  });

  it('resolves Concept Definition cards from the bound Concept block', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        templateID: 'builtin-concept-definition',
        frontBlockIDs: ['concept-block'],
        backBlockIDs: ['definition-block'],
        typeMarker: 'concept-definition-forward',
        fieldMapping: {
          concept: 'concept-block',
          definition: 'definition-block',
        },
      },
    }), 'definition-block'));

    expect(focus?.focusBlockId).toBe('concept-block');
  });

  it('prefers Concept Definition field mapping over stale legacy template and marker', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      faceKey: { ruleId: 'concept-definition-forward', faceIndex: 0 },
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        templateID: 'builtin-riff-sync',
        frontBlockIDs: ['wrong-front-concept'],
        backBlockIDs: ['definition-block'],
        typeMarker: 'concept-definition-reverse',
        fieldMapping: {
          concept: 'mapped-concept-block',
          definition: 'definition-block',
        },
      },
    }), 'definition-block'));

    expect(focus?.focusBlockId).toBe('mapped-concept-block');
  });

  it('resolves Descriptor cards from the parent or bound Concept block', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      type: CardType.Descriptor,
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        templateID: 'builtin-concept-descriptor-both',
        frontBlockIDs: ['concept-block', 'descriptor-front'],
        backBlockIDs: ['concept-block', 'descriptor-back'],
        typeMarker: 'concept-descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-back',
        },
      },
    }), 'descriptor-back'));

    expect(focus?.focusBlockId).toBe('concept-block');
  });

  it('hides the action for non-eligible cards', () => {
    expect(resolveReviewConceptRoamFocus(content(card({ type: CardType.Item })))).toBeNull();
  });

  it('hides the action when Concept Definition focus is ambiguous', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        templateID: 'custom-concept-definition',
        frontBlockIDs: ['candidate-a'],
        backBlockIDs: ['candidate-b'],
        typeMarker: 'custom-definition',
        fieldMapping: {
          definition: 'definition-block',
        },
      },
    }), 'definition-block'));

    expect(focus).toBeNull();
  });

  it('does not guess Concept Definition focus from stale reverse marker when mapping is missing', () => {
    const focus = resolveReviewConceptRoamFocus(content(card({
      faceKey: { ruleId: 'concept-definition-forward', faceIndex: 0 },
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        templateID: 'builtin-concept-definition-reverse',
        frontBlockIDs: ['candidate-a'],
        backBlockIDs: ['definition-block', 'candidate-b'],
        typeMarker: 'concept-definition-reverse',
        fieldMapping: {
          definition: 'definition-block',
        },
      },
    }), 'definition-block'));

    expect(focus).toBeNull();
  });

  it('returns all selectable concept targets for ambiguous CDF cards', () => {
    const targets = resolveReviewConceptRoamTargets(content(card({
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        templateID: 'custom-concept-definition',
        frontBlockIDs: ['candidate-a'],
        backBlockIDs: ['candidate-b'],
        typeMarker: 'custom-definition',
        fieldMapping: {
          definition: 'definition-block',
        },
      },
    }), 'definition-block'));

    expect(targets.map((target) => target.focusBlockId)).toEqual(['candidate-a', 'candidate-b']);
  });
});
