/**
 * CardMapper active DTO mapping tests.
 *
 * The old Card Entity / Repository path is retired. These tests cover the
 * active FSRSCard <-> CardPersistenceDTO interface used by runtime storage.
 */

import { describe, expect, it } from 'vitest';
import { CardMapper } from '../CardMapper';
import type { FSRSCard } from '../../../../types/card';
import { CardState, CardType } from '../../../../types/card';
import type { CardPersistenceDTO } from '../../dto/CardPersistenceDTO';
import {
  collectProtectedSemanticPayload,
  diffProtectedSemanticPayload,
} from '../../../../core/card/semanticPayload';

function createFSRSCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: 1234567890,
    stability: 5,
    difficulty: 3.5,
    reps: 10,
    lapses: 2,
    state: CardState.Review,
    lastReview: 1234567800,
    elapsedDays: 5,
    scheduledDays: 10,
    priority: 50,
    type: CardType.Item,
    tags: ['test'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1234567000,
    updatedAt: 1234567890,
    ...overrides,
  };
}

function createDTO(overrides: Partial<CardPersistenceDTO> = {}): CardPersistenceDTO {
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: 1234567890,
    stability: 5,
    difficulty: 3.5,
    reps: 10,
    lapses: 2,
    state: CardState.Review,
    lastReview: 1234567800,
    elapsedDays: 5,
    scheduledDays: 10,
    priority: 50,
    type: CardType.Item,
    tags: ['test'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1234567000,
    updatedAt: 1234567890,
    ...overrides,
  };
}

describe('CardMapper.toPersistence', () => {
  it('maps FSRSCard fields to persistence DTO', () => {
    const dto = CardMapper.toPersistence(createFSRSCard());

    expect(dto).toMatchObject({
      id: 'card-1',
      blockId: 'block-1',
      due: 1234567890,
      stability: 5,
      difficulty: 3.5,
      reps: 10,
      lapses: 2,
      state: CardState.Review,
      priority: 50,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
    });
  });

  it('extracts Xiuyuan metadata and keeps unrelated meta', () => {
    const dto = CardMapper.toPersistence(createFSRSCard({
      id: 'card-xiuyuan',
      xiuyuanID: 'xy_123',
      faceKey: { ruleId: 'concept-forward', faceIndex: 0 },
      type: CardType.Concept,
      meta: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-concept-simple',
        frontBlockIDs: ['front-block'],
        backBlockIDs: ['back-block'],
        fieldMapping: { front: 'front-block', back: 'back-block' },
        priority: 80,
        customField: 'customValue',
      },
    }));

    expect(dto.xiuyuanID).toBe('xy_123');
    expect(dto.faceKey).toEqual({ ruleId: 'concept-forward', faceIndex: 0 });
    expect(dto.templateID).toBe('builtin-concept-simple');
    expect(dto.frontBlockIDs).toEqual(['front-block']);
    expect(dto.backBlockIDs).toEqual(['back-block']);
    expect(dto.fieldMapping).toEqual({ front: 'front-block', back: 'back-block' });
    expect(dto.xiuyuanPriority).toBe(80);
    expect(dto.meta).toEqual({ customField: 'customValue' });
  });

  it('does not mutate source meta while extracting fields', () => {
    const card = createFSRSCard({
      meta: {
        xiuyuanID: 'xy_safe',
        templateID: 'template',
        customField: 'kept',
      },
    });

    CardMapper.toPersistence(card);

    expect(card.meta).toEqual({
      xiuyuanID: 'xy_safe',
      templateID: 'template',
      customField: 'kept',
    });
  });
});

describe('CardMapper.toDomain', () => {
  it('maps persistence DTO fields to FSRSCard', () => {
    const card = CardMapper.toDomain(createDTO());

    expect(card).toMatchObject({
      id: 'card-1',
      blockId: 'block-1',
      due: 1234567890,
      stability: 5,
      difficulty: 3.5,
      reps: 10,
      lapses: 2,
      state: CardState.Review,
      priority: 50,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
    });
  });

  it('rebuilds Xiuyuan metadata into FSRSCard meta', () => {
    const card = CardMapper.toDomain(createDTO({
      id: 'card-xiuyuan',
      xiuyuanID: 'xy_123',
      faceKey: { ruleId: 'concept-forward', faceIndex: 0 },
      templateID: 'builtin-concept-simple',
      frontBlockIDs: ['front-block'],
      backBlockIDs: ['back-block'],
      fieldMapping: { front: 'front-block', back: 'back-block' },
      xiuyuanPriority: 80,
      meta: { customField: 'customValue' },
    }));

    expect(card.xiuyuanID).toBe('xy_123');
    expect(card.faceKey).toEqual({ ruleId: 'concept-forward', faceIndex: 0 });
    expect(card.meta).toEqual({
      xiuyuanID: 'xy_123',
      faceKey: { ruleId: 'concept-forward', faceIndex: 0 },
      templateID: 'builtin-concept-simple',
      frontBlockIDs: ['front-block'],
      backBlockIDs: ['back-block'],
      fieldMapping: { front: 'front-block', back: 'back-block' },
      priority: 80,
      customField: 'customValue',
    });
  });
});

describe('CardMapper DTO round trip', () => {
  it('preserves semantic payload and face identity', () => {
    const original = createFSRSCard({
      id: 'custom-semantic-card',
      xiuyuanID: 'xy_custom_semantic',
      blockId: 'block-custom-semantic',
      faceKey: { ruleId: 'custom-owned-rule', faceIndex: 1 },
      meta: {
        xiuyuanID: 'xy_custom_semantic',
        templateID: 'custom-owned-template',
        typeMarker: 'custom-owned-rule',
        renderProfile: 'custom-render-profile',
        clozeRenderMode: 'custom-cloze-mode',
        frontBlockIDs: ['front-block'],
        backBlockIDs: ['back-block'],
        fieldMapping: { front: 'front-block', back: 'back-block' },
        faces: [
          { front: 'Question 1', back: 'Answer 1' },
          { front: 'Question 2', back: 'Answer 2' },
        ],
        customFront: 'Custom front payload',
        customBack: { blocks: ['back-block'], html: '<b>Answer</b>' },
      },
    });

    const restored = CardMapper.toDomain(CardMapper.toPersistence(original));

    expect(restored).toMatchObject({
      id: original.id,
      xiuyuanID: original.xiuyuanID,
      blockId: original.blockId,
      faceKey: { ruleId: 'custom-owned-rule', faceIndex: 1 },
      meta: {
        xiuyuanID: 'xy_custom_semantic',
        faceKey: { ruleId: 'custom-owned-rule', faceIndex: 1 },
        templateID: 'custom-owned-template',
        typeMarker: 'custom-owned-rule',
        renderProfile: 'custom-render-profile',
        clozeRenderMode: 'custom-cloze-mode',
        frontBlockIDs: ['front-block'],
        backBlockIDs: ['back-block'],
        fieldMapping: { front: 'front-block', back: 'back-block' },
        faces: [
          { front: 'Question 1', back: 'Answer 1' },
          { front: 'Question 2', back: 'Answer 2' },
        ],
        customFront: 'Custom front payload',
        customBack: { blocks: ['back-block'], html: '<b>Answer</b>' },
      },
    });
    expect(diffProtectedSemanticPayload(original, restored)).toEqual([]);
    expect(collectProtectedSemanticPayload(restored).map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'faceKey',
      'meta.templateID',
      'meta.typeMarker',
      'meta.renderProfile',
      'meta.clozeRenderMode',
      'meta.frontBlockIDs',
      'meta.backBlockIDs',
      'meta.fieldMapping',
      'meta.faces',
      'meta.customFront',
      'meta.customBack',
    ]));
  });

  it('batch helpers match single-card conversion', () => {
    const cards = [
      createFSRSCard({ id: 'card-a', blockId: 'block-a' }),
      createFSRSCard({ id: 'card-b', blockId: 'block-b' }),
    ];

    const batchDtos = CardMapper.toPersistenceBatch(cards);
    const singleDtos = cards.map((card) => CardMapper.toPersistence(card));
    const restored = CardMapper.toDomainBatch(batchDtos);

    expect(batchDtos).toEqual(singleDtos);
    expect(restored.map((card) => card.id)).toEqual(['card-a', 'card-b']);
  });
});

describe('CardMapper.validate', () => {
  it('accepts valid DTOs', () => {
    const result = CardMapper.validate(createDTO());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('allows unreviewed new-card empty FSRS memory', () => {
    const dto = createDTO({
      id: 'card-empty-new',
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learning_step: 0,
    });

    const validation = CardMapper.validate(dto);
    const roundtripped = CardMapper.toPersistence(CardMapper.toDomain(dto));

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(roundtripped).toMatchObject({
      stability: 0,
      difficulty: 0,
      state: CardState.New,
      reps: 0,
      lastReview: 0,
    });
  });

  it('rejects invalid FSRS review memory', () => {
    const result = CardMapper.validate(createDTO({
      id: 'card-empty-review',
      state: CardState.Review,
      stability: 0,
      difficulty: 0,
      reps: 1,
      lastReview: 1234567800,
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid stability: review memory must be positive');
    expect(result.errors).toContain('Invalid difficulty: review memory must be between 1 and 10');
  });

  it('requires templateID when xiuyuanID is present', () => {
    const result = CardMapper.validate(createDTO({
      type: CardType.Concept,
      xiuyuanID: 'xy_123',
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Xiuyuan card missing templateID');
  });
});
