import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { applyRenderTargetTransition, resolveEditableRenderTarget } from '../applyRenderTargetTransition';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
  };
}

describe('applyRenderTargetTransition', () => {
  it('forces standard render for default target', () => {
    const result = applyRenderTargetTransition(buildCard({ meta: { forceQuickRender: true } }), 'default');
    expect(result.card.meta).toMatchObject({ forceProtyleRender: true });
    expect(result.card.meta).not.toHaveProperty('forceQuickRender');
    expect(resolveEditableRenderTarget(result.card)).toBe('default');
  });

  it('forces quick render and clears conceptual renderProfile', () => {
    const result = applyRenderTargetTransition(buildCard({ meta: { renderProfile: 'concept', typeMarker: 'C' } }), 'quick');
    expect(result.card.meta).toMatchObject({ forceQuickRender: true, typeMarker: 'C' });
    expect(result.card.meta).not.toHaveProperty('renderProfile');
    expect(resolveEditableRenderTarget(result.card)).toBe('quick');
  });

  it('applies concept render metadata', () => {
    const result = applyRenderTargetTransition(buildCard(), 'concept');
    expect(result.card.meta).toMatchObject({
      renderProfile: 'concept',
      typeMarker: 'C',
      templateID: 'builtin-concept-simple',
    });
  });

  it('applies concept definition reverse metadata', () => {
    const result = applyRenderTargetTransition(buildCard(), 'concept-definition-reverse');
    expect(result.card.meta).toMatchObject({
      renderProfile: 'concept-definition',
      typeMarker: 'concept-definition-reverse',
      templateID: 'builtin-concept-definition-reverse',
    });
  });

  it('applies descriptor reverse metadata', () => {
    const result = applyRenderTargetTransition(buildCard(), 'descriptor-reverse');
    expect(result.card.meta).toMatchObject({
      renderProfile: 'descriptor',
      typeMarker: 'concept-descriptor-reverse',
      templateID: 'builtin-concept-descriptor-reverse',
    });
  });
});
