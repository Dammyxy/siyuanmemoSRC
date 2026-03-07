import { describe, expect, it, vi } from 'vitest';
import { initializeAFactor } from '@/core/card-builder/detectCardType';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { applyCardTypeTransition } from '../applyCardTypeTransition';

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
    priority: overrides.priority ?? 42,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    cardTypeMarker: overrides.cardTypeMarker,
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
    aFactor: overrides.aFactor,
    schedulerType: overrides.schedulerType,
  };
}

describe('applyCardTypeTransition', () => {
  it('initializes Topic aFactor and syncs the recommended default render', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T00:00:00Z'));

    const result = applyCardTypeTransition(
      buildCard({
        type: CardType.Item,
        priority: 12,
        meta: { renderProfile: 'concept', forceQuickRender: true, typeMarker: 'C', templateID: 'builtin-concept-simple' },
      }),
      CardType.Topic,
    );

    expect(result.changed).toBe(true);
    expect(result.card.type).toBe(CardType.Topic);
    expect(result.card.aFactor).toBe(initializeAFactor(12));
    expect(result.card.cardTypeMarker).toBeUndefined();
    expect(result.card.meta).toMatchObject({ forceProtyleRender: true });
    expect(result.recommendedRenderTarget).toBe('default');

    vi.useRealTimers();
  });

  it('switches Item cards without forcing a new render target', () => {
    const result = applyCardTypeTransition(
      buildCard({
        type: CardType.Concept,
        cardTypeMarker: 'concept',
        meta: { renderProfile: 'concept', typeMarker: 'C', templateID: 'builtin-concept-simple', cardTypeMarker: 'concept' },
      }),
      CardType.Item,
    );

    expect(result.card.type).toBe(CardType.Item);
    expect(result.card.cardTypeMarker).toBeUndefined();
    expect(result.card.meta).toMatchObject({
      renderProfile: 'concept',
      typeMarker: 'C',
      templateID: 'builtin-concept-simple',
    });
    expect(result.card.meta).not.toHaveProperty('cardTypeMarker');
    expect(result.recommendedRenderTarget).toBe('concept');
  });

  it('applies concept marker and concept render metadata', () => {
    const result = applyCardTypeTransition(buildCard(), CardType.Concept);

    expect(result.card.type).toBe(CardType.Concept);
    expect(result.card.cardTypeMarker).toBe('concept');
    expect(result.card.meta).toMatchObject({
      renderProfile: 'concept',
      typeMarker: 'C',
      templateID: 'builtin-concept-simple',
      cardTypeMarker: 'concept',
    });
  });

  it('preserves descriptor reverse direction when already in descriptor render family', () => {
    const result = applyCardTypeTransition(
      buildCard({
        type: CardType.Descriptor,
        meta: {
          renderProfile: 'descriptor',
          typeMarker: 'concept-descriptor-reverse',
          templateID: 'builtin-concept-descriptor-reverse',
        },
      }),
      CardType.Descriptor,
    );

    expect(result.descriptorDirection).toBe('reverse');
    expect(result.recommendedRenderTarget).toBe('descriptor-reverse');
    expect(result.card.meta).toMatchObject({
      renderProfile: 'descriptor',
      typeMarker: 'concept-descriptor-reverse',
      templateID: 'builtin-concept-descriptor-reverse',
      cardTypeMarker: 'descriptor',
    });
  });

  it('defaults descriptor direction to forward outside descriptor render family', () => {
    const result = applyCardTypeTransition(
      buildCard({
        type: CardType.Concept,
        meta: {
          renderProfile: 'concept-definition',
          typeMarker: 'concept-definition-reverse',
          templateID: 'builtin-concept-definition-reverse',
        },
      }),
      CardType.Descriptor,
    );

    expect(result.descriptorDirection).toBe('forward');
    expect(result.recommendedRenderTarget).toBe('descriptor-forward');
    expect(result.card.meta).toMatchObject({
      renderProfile: 'descriptor',
      typeMarker: 'concept-descriptor-forward',
      templateID: 'builtin-concept-descriptor',
      cardTypeMarker: 'descriptor',
    });
  });
});
