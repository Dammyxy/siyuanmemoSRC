import { describe, expect, it } from 'vitest';
import {
  resolveCardFaceToken,
  resolveCardRuleDirection,
} from '@/core/card/cardSemanticLocator';
import { buildReviewRenderableRenderPolicy } from '@/application/adapters/reviewRenderableRenderPolicy';
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
    faceKey: overrides.faceKey ? { ...overrides.faceKey } : undefined,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
  };
}

describe('applyRenderTargetTransition', () => {
  it('forces standard render for default target', () => {
    const result = applyRenderTargetTransition(
      buildCard({ meta: { forceQuickRender: true, quickDetectReason: 'cloze-latex-numbered' } }),
      'default',
    );
    expect(result.card.meta).toMatchObject({ forceProtyleRender: true });
    expect(result.card.meta).not.toHaveProperty('forceQuickRender');
    expect(result.card.meta).not.toHaveProperty('quickDetectReason');
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

  it('updates top-level faceKey so concept definition direction follows the selected render target', () => {
    const result = applyRenderTargetTransition(
      buildCard({
        faceKey: { ruleId: 'concept-definition-forward', faceIndex: 2 },
        meta: {
          renderProfile: 'concept-definition',
          typeMarker: 'concept-definition-reverse',
          templateID: 'builtin-concept-definition-reverse',
        },
      }),
      'concept-definition-reverse',
    );

    expect(result.card.faceKey).toEqual({ ruleId: 'concept-definition-reverse', faceIndex: 2 });
    expect(result.card.meta).toMatchObject({
      renderProfile: 'concept-definition',
      typeMarker: 'concept-definition-reverse',
      templateID: 'builtin-concept-definition-reverse',
    });
    expect(resolveCardRuleDirection(result.card)).toBe('reverse');
    expect(resolveCardFaceToken(result.card)).toBe('rule:concept-definition-reverse::face:2');
  });

  it('updates meta.faceKey and Review cache identity when descriptor legacy metadata was stale', () => {
    const result = applyRenderTargetTransition(
      buildCard({
        meta: {
          renderProfile: 'descriptor',
          typeMarker: 'concept-descriptor-forward',
          templateID: 'builtin-concept-descriptor',
          faceKey: { ruleId: 'descriptor-reverse', faceIndex: 1 },
        },
      }),
      'descriptor-forward',
    );

    const policy = buildReviewRenderableRenderPolicy(result.card);

    expect(result.card.meta).toMatchObject({
      renderProfile: 'descriptor',
      typeMarker: 'concept-descriptor-forward',
      templateID: 'builtin-concept-descriptor',
      faceKey: { ruleId: 'descriptor-forward', faceIndex: 1 },
    });
    expect(resolveCardRuleDirection(result.card)).toBe('forward');
    expect(policy.cacheTokens.faceToken).toBe('rule:descriptor-forward::face:1');
    expect(policy.cacheTokens.ruleId).toBe('descriptor-forward');
  });
});
