/**
 * CardMapper property tests for the active FSRSCard <-> CardPersistenceDTO interface.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { CardMapper } from '../CardMapper';
import { CardState, CardType, type FSRSCard } from '../../../../types/card';

const cardStateArbitrary = fc.constantFrom(
  CardState.New,
  CardState.Learning,
  CardState.Review,
  CardState.Relearning,
);

const cardTypeArbitrary = fc.constantFrom(
  CardType.Item,
  CardType.Topic,
  CardType.Concept,
  CardType.Descriptor,
);

const fsrsCardArbitrary: fc.Arbitrary<FSRSCard> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  blockId: fc.string({ minLength: 1, maxLength: 50 }),
  xiuyuanID: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  due: fc.integer({ min: 0, max: Date.now() * 2 }),
  stability: fc.double({ min: 1, max: 1000, noNaN: true }),
  difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
  reps: fc.integer({ min: 0, max: 1000 }),
  lapses: fc.integer({ min: 0, max: 100 }),
  state: cardStateArbitrary,
  lastReview: fc.integer({ min: 0, max: Date.now() }),
  elapsedDays: fc.integer({ min: 0, max: 365 }),
  scheduledDays: fc.integer({ min: 0, max: 365 }),
  learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
  priority: fc.integer({ min: 0, max: 100 }),
  type: cardTypeArbitrary,
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
  cardTypeMarker: fc.option(fc.constantFrom('concept' as const, 'descriptor' as const), { nil: undefined }),
  neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
  leechCount: fc.integer({ min: 0, max: 20 }),
  isLeech: fc.boolean(),
  skipped: fc.boolean(),
  skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
  sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
  extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  updatedAt: fc.integer({ min: 0, max: Date.now() }),
  aFactor: fc.option(fc.double({ min: 1.2, max: 6, noNaN: true }), { nil: undefined }),
  schedulerType: fc.option(
    fc.constantFrom('fsrs-v6' as const, 'a-factor-v2' as const, 'riff' as const, 'unsupported-scheduler' as const, 'external:demo' as const),
    { nil: undefined },
  ),
  syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
  riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  schedulerMeta: fc.option(fc.object(), { nil: undefined }),
  postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
  lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
  meta: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.anything()), { nil: undefined }),
});

describe('CardMapper active DTO properties', () => {
  it('round-trips FSRSCard through persistence DTO', () => {
    fc.assert(
      fc.property(fsrsCardArbitrary, (card) => {
        const dto = CardMapper.toPersistence(card);
        const restored = CardMapper.toDomain(dto);
        const normalizedDto = CardMapper.toPersistence(restored);

        expect(normalizedDto).toEqual(dto);
      }),
      { numRuns: 100 },
    );
  });

  it('batch helpers equal repeated single conversions', () => {
    fc.assert(
      fc.property(fc.array(fsrsCardArbitrary, { minLength: 0, maxLength: 20 }), (cards) => {
        const batchDtos = CardMapper.toPersistenceBatch(cards);
        const singleDtos = cards.map((card) => CardMapper.toPersistence(card));
        const restored = CardMapper.toDomainBatch(batchDtos);

        expect(batchDtos).toEqual(singleDtos);
        expect(restored.map((card) => CardMapper.toPersistence(card))).toEqual(batchDtos);
      }),
      { numRuns: 100 },
    );
  });

  it('does not mutate source FSRSCard objects', () => {
    fc.assert(
      fc.property(fsrsCardArbitrary, (card) => {
        const snapshot = structuredClone(card);

        CardMapper.toPersistence(card);

        expect(card).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});
