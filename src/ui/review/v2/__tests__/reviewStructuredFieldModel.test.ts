import { describe, expect, it } from 'vitest';
import type { FSRSCard } from '@/types/card';
import {
  buildReviewStructuredFieldModel,
  buildReviewStructuredFieldModelFromExplicitSources,
  createReviewStructuredFieldOriginHash,
} from '../reviewStructuredFieldModel';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1762300000000;
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'source-block',
    due: now,
    stability: 5,
    difficulty: 4,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {},
    ...overrides,
  } as FSRSCard;
}

describe('reviewStructuredFieldModel', () => {
  it('models definition content with readonly concept chip, direction, and field hash', () => {
    const card = createCard({
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'definition-source',
        conceptBlockId: 'concept-doc',
        relationKind: 'definition-forward',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: 'Photosynthesis',
          order: 0,
        },
      },
    });

    const model = buildReviewStructuredFieldModel({
      card,
      family: 'definition',
      fields: [{
        role: 'definition',
        value: 'Plants convert light into chemical energy.',
        blockId: 'definition-source',
        originKind: 'field-mapping',
      }],
    });

    expect(model.mode).toBe('structured');
    expect(model.family).toBe('definition');
    expect(model.fields).toEqual([
      expect.objectContaining({
        id: 'definition',
        role: 'definition',
        label: 'Definition',
        value: 'Plants convert light into chemical energy.',
        originalValue: 'Plants convert light into chemical energy.',
        required: true,
        multiline: true,
        readonly: false,
        origin: expect.objectContaining({
          blockId: 'definition-source',
          kind: 'field-mapping',
          hash: expect.any(String),
        }),
      }),
    ]);
    expect(model.relationChips).toEqual([
      expect.objectContaining({
        kind: 'concept',
        blockId: 'concept-doc',
        label: 'Photosynthesis',
        readonly: true,
      }),
    ]);
    expect(model.direction).toEqual(expect.objectContaining({
      kind: 'forward',
      relationKind: 'definition-forward',
      readonly: true,
    }));
  });

  it('models descriptor cue and answer fields without making relation chips editable', () => {
    const card = createCard({
      type: 'descriptor',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'descriptor-source',
        conceptBlockId: 'concept-doc',
        relationKind: 'descriptor-reverse',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: 'Operating System',
          order: 0,
        },
      },
    });

    const model = buildReviewStructuredFieldModel({
      card,
      family: 'descriptor',
      fields: [
        {
          role: 'cue',
          value: 'Kernel role',
          blockId: 'descriptor-source',
          originKind: 'grammar',
        },
        {
          role: 'answer',
          value: 'Controls hardware access',
          blockId: 'descriptor-source',
          originKind: 'grammar',
        },
      ],
    });

    expect(model.family).toBe('descriptor');
    expect(model.fields.map(field => field.role)).toEqual(['cue', 'answer']);
    expect(model.fields.map(field => field.required)).toEqual([true, true]);
    expect(model.fields.every(field => field.readonly === false)).toBe(true);
    expect(model.relationChips.every(chip => chip.readonly === true)).toBe(true);
    expect(model.direction).toEqual(expect.objectContaining({
      kind: 'reverse',
      relationKind: 'descriptor-reverse',
      readonly: true,
    }));
  });

  it('models item question and answer in source order while direction stays readonly', () => {
    const card = createCard({
      type: 'item',
      meta: {
        templateID: 'builtin-bidirectional',
        typeMarker: 'reverse',
      },
    });

    const model = buildReviewStructuredFieldModel({
      card,
      family: 'item',
      fields: [
        {
          role: 'question',
          value: 'What does TCP provide?',
          blockId: 'question-block',
          originKind: 'field-mapping',
        },
        {
          role: 'answer',
          value: 'Reliable ordered byte streams.',
          blockId: 'answer-block',
          originKind: 'field-mapping',
        },
      ],
    });

    expect(model.family).toBe('item');
    expect(model.fields.map(field => field.role)).toEqual(['question', 'answer']);
    expect(model.fields.map(field => field.value)).toEqual([
      'What does TCP provide?',
      'Reliable ordered byte streams.',
    ]);
    expect(model.direction).toEqual(expect.objectContaining({
      kind: 'reverse',
      readonly: true,
    }));
    expect(model.relationChips).toEqual([]);
  });

  it('falls back to one source field when field identity is unsafe', () => {
    const card = createCard({
      blockId: 'unsafe-source',
      meta: {
        liveRelationIssues: [{
          code: 'invalid-source-grammar',
          severity: 'blocking',
        }],
      },
    });

    const model = buildReviewStructuredFieldModel({
      card,
      family: 'source',
      sourceFallback: {
        value: 'A >> B >> C',
        blockId: 'unsafe-source',
        reason: 'invalid-source-grammar',
      },
    });

    expect(model.mode).toBe('source-fallback');
    expect(model.family).toBe('source');
    expect(model.fallbackReason).toBe('invalid-source-grammar');
    expect(model.fields).toEqual([
      expect.objectContaining({
        id: 'source',
        role: 'source',
        label: 'Source',
        value: 'A >> B >> C',
        required: true,
        origin: expect.objectContaining({
          blockId: 'unsafe-source',
          kind: 'source-fallback',
          hash: expect.any(String),
        }),
      }),
    ]);
  });

  it('creates deterministic origin hashes that change with content', () => {
    const first = createReviewStructuredFieldOriginHash({
      role: 'answer',
      value: 'same',
      blockId: 'block-a',
      originKind: 'grammar',
    });
    const repeat = createReviewStructuredFieldOriginHash({
      role: 'answer',
      value: 'same',
      blockId: 'block-a',
      originKind: 'grammar',
    });
    const changed = createReviewStructuredFieldOriginHash({
      role: 'answer',
      value: 'changed',
      blockId: 'block-a',
      originKind: 'grammar',
    });

    expect(first).toBe(repeat);
    expect(first).not.toBe(changed);
  });

  it('extracts item question and answer from explicit field mapping', () => {
    const card = createCard({
      meta: {
        fieldMapping: {
          question: 'question-block',
          answer: 'answer-block',
        },
        templateID: 'builtin-bidirectional',
        typeMarker: 'reverse',
      },
    });

    const model = buildReviewStructuredFieldModelFromExplicitSources({
      card,
      sources: [
        {
          id: 'question-target',
          blockId: 'question-block',
          role: 'current-content',
          rendererKind: 'main-protyle',
          title: 'Question source',
          value: 'Source question',
        },
        {
          id: 'answer-target',
          blockId: 'answer-block',
          role: 'current-content',
          rendererKind: 'main-protyle',
          title: 'Answer source',
          value: 'Source answer',
        },
      ],
    });

    expect(model.mode).toBe('structured');
    expect(model.family).toBe('item');
    expect(model.fields.map(field => ({
      role: field.role,
      value: field.value,
      blockId: field.origin.blockId,
      originKind: field.origin.kind,
    }))).toEqual([
      {
        role: 'question',
        value: 'Source question',
        blockId: 'question-block',
        originKind: 'field-mapping',
      },
      {
        role: 'answer',
        value: 'Source answer',
        blockId: 'answer-block',
        originKind: 'field-mapping',
      },
    ]);
    expect(model.direction).toEqual(expect.objectContaining({
      kind: 'reverse',
      readonly: true,
    }));
  });

  it('extracts item question and answer from explicit front and back block ids', () => {
    const card = createCard({
      meta: {
        frontBlockIDs: ['front-block'],
        backBlockIDs: ['back-block'],
      },
    });

    const model = buildReviewStructuredFieldModelFromExplicitSources({
      card,
      sources: [
        {
          id: 'front-target',
          blockId: 'front-block',
          role: 'current-content',
          rendererKind: 'main-protyle',
          title: 'Front',
          value: 'Front markdown',
        },
        {
          id: 'back-target',
          blockId: 'back-block',
          role: 'current-content',
          rendererKind: 'main-protyle',
          title: 'Back',
          value: 'Back markdown',
        },
      ],
    });

    expect(model.mode).toBe('structured');
    expect(model.fields.map(field => [field.role, field.value, field.origin.kind])).toEqual([
      ['question', 'Front markdown', 'block-id'],
      ['answer', 'Back markdown', 'block-id'],
    ]);
  });

  it('extracts definition field from explicit mapping and keeps live relation context readonly', () => {
    const card = createCard({
      type: 'concept',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'definition-block',
        conceptBlockId: 'concept-doc',
        relationKind: 'definition-forward',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: 'Declarative knowledge',
        },
        fieldMapping: {
          concept: 'concept-doc',
          definition: 'definition-block',
        },
      },
    });

    const model = buildReviewStructuredFieldModelFromExplicitSources({
      card,
      sources: [
        {
          id: 'definition-target',
          blockId: 'definition-block',
          role: 'definition',
          rendererKind: 'concept-definition',
          title: 'Definition',
          value: 'Knowledge that can be stated.',
        },
      ],
    });

    expect(model.mode).toBe('structured');
    expect(model.family).toBe('definition');
    expect(model.fields).toEqual([
      expect.objectContaining({
        role: 'definition',
        value: 'Knowledge that can be stated.',
        origin: expect.objectContaining({
          kind: 'field-mapping',
          blockId: 'definition-block',
        }),
      }),
    ]);
    expect(model.relationChips).toEqual([
      expect.objectContaining({
        label: 'Declarative knowledge',
        readonly: true,
      }),
    ]);
    expect(model.direction).toEqual(expect.objectContaining({
      kind: 'forward',
      readonly: true,
    }));
  });

  it('extracts descriptor source identity from explicit mapping without parsing cue and answer', () => {
    const card = createCard({
      type: 'descriptor',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'descriptor-block',
        conceptBlockId: 'concept-doc',
        relationKind: 'descriptor-reverse',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: 'Operating System',
        },
        fieldMapping: {
          concept: 'concept-doc',
          descriptor: 'descriptor-block',
        },
      },
    });

    const model = buildReviewStructuredFieldModelFromExplicitSources({
      card,
      sources: [
        {
          id: 'descriptor-target',
          blockId: 'descriptor-block',
          role: 'descriptor',
          rendererKind: 'descriptor',
          title: 'Descriptor',
          value: 'Kernel role ;; Controls hardware access',
        },
      ],
    });

    expect(model.mode).toBe('structured');
    expect(model.family).toBe('descriptor');
    expect(model.fields).toEqual([
      expect.objectContaining({
        id: 'descriptor-source',
        role: 'source',
        label: 'Descriptor',
        value: 'Kernel role ;; Controls hardware access',
        origin: expect.objectContaining({
          kind: 'field-mapping',
          blockId: 'descriptor-block',
        }),
      }),
    ]);
    expect(model.direction).toEqual(expect.objectContaining({
      kind: 'reverse',
      readonly: true,
    }));
  });

  it('keeps unsafe or missing explicit field identity in source fallback mode', () => {
    const card = createCard({
      meta: {
        fieldMapping: {
          question: 'missing-question',
        },
      },
    });

    const model = buildReviewStructuredFieldModelFromExplicitSources({
      card,
      sources: [
        {
          id: 'current-target',
          blockId: 'source-block',
          role: 'current-content',
          rendererKind: 'main-protyle',
          title: 'Source',
          value: 'Raw source only',
        },
      ],
    });

    expect(model.mode).toBe('source-fallback');
    expect(model.family).toBe('source');
    expect(model.fallbackReason).toBe('explicit-field-identity-unavailable');
    expect(model.fields).toEqual([
      expect.objectContaining({
        role: 'source',
        value: 'Raw source only',
        origin: expect.objectContaining({
          kind: 'source-fallback',
          blockId: 'source-block',
        }),
      }),
    ]);
  });
});
