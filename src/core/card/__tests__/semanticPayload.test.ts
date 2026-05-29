import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  analyzeProtectedSemanticOverwrite,
  collectProtectedSemanticPayload,
  diffProtectedSemanticPayload,
} from '../semanticPayload';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    faceKey: overrides.faceKey,
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
    cardTypeMarker: overrides.cardTypeMarker,
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
    sourceUrl: overrides.sourceUrl,
    extractedFrom: overrides.extractedFrom,
    riffCardId: overrides.riffCardId,
  };
}

describe('semanticPayload', () => {
  it('collects identity, source, type, render, Xiuyuan mapping, face, and unknown custom metadata', () => {
    const card = buildCard({
      faceKey: { ruleId: 'custom-card-rule', faceIndex: 3 },
      cardTypeMarker: 'concept',
      sourceUrl: 'https://example.test/source',
      extractedFrom: 'source-block-1',
      meta: {
        templateID: 'custom-owned-template',
        typeMarker: 'custom-owned-rule',
        renderProfile: 'custom-render-profile',
        clozeRenderMode: 'custom-cloze-mode',
        fieldMapping: { front: 'front-block', back: 'back-block' },
        frontBlockIDs: ['front-block'],
        backBlockIDs: ['back-block'],
        faces: [{ front: 'Front', back: 'Back' }],
        customFront: 'front text',
        content: 'ordinary browser text',
      },
    });

    const entries = collectProtectedSemanticPayload(card);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));

    expect(byPath.get('id')).toMatchObject({ kind: 'identity', custom: false });
    expect(byPath.get('xiuyuanID')).toMatchObject({ kind: 'identity', custom: false });
    expect(byPath.get('blockId')).toMatchObject({ kind: 'source', custom: false });
    expect(byPath.get('faceKey')).toMatchObject({ kind: 'face', custom: false });
    expect(byPath.get('meta.templateID')).toMatchObject({ kind: 'template', custom: true });
    expect(byPath.get('meta.typeMarker')).toMatchObject({ kind: 'render', custom: true });
    expect(byPath.get('meta.renderProfile')).toMatchObject({ kind: 'render', custom: true });
    expect(byPath.get('meta.clozeRenderMode')).toMatchObject({ kind: 'render', custom: true });
    expect(byPath.get('meta.fieldMapping')).toMatchObject({ kind: 'xiuyuan-mapping', custom: true });
    expect(byPath.get('meta.faces')).toMatchObject({ kind: 'face', custom: true });
    expect(byPath.get('meta.customFront')).toMatchObject({ kind: 'custom-meta', custom: true });
    expect(byPath.has('meta.content')).toBe(false);
  });

  it('does not require confirmation for built-in semantic transitions on built-in cards', () => {
    const before = buildCard({
      type: CardType.Item,
      meta: {
        renderProfile: 'concept',
        typeMarker: 'C',
        templateID: 'builtin-concept-simple',
      },
    });
    const after = buildCard({
      type: CardType.Descriptor,
      cardTypeMarker: 'descriptor',
      meta: {
        renderProfile: 'descriptor',
        typeMarker: 'concept-descriptor-forward',
        templateID: 'builtin-concept-descriptor',
        cardTypeMarker: 'descriptor',
      },
    });

    expect(diffProtectedSemanticPayload(before, after).map((field) => field.path)).toEqual(expect.arrayContaining([
      'type',
      'cardTypeMarker',
      'meta.renderProfile',
      'meta.templateID',
      'meta.typeMarker',
    ]));
    expect(analyzeProtectedSemanticOverwrite(before, after).requiresConfirmation).toBe(false);
  });

  it('requires confirmation when a built-in transition would overwrite custom semantic payload', () => {
    const before = buildCard({
      meta: {
        templateID: 'custom-owned-template',
        typeMarker: 'custom-reverse',
        renderProfile: 'custom-render',
        faces: [{ front: 'Front', back: 'Back' }],
        customBack: 'back text',
      },
    });
    const after = buildCard({
      type: CardType.Concept,
      cardTypeMarker: 'concept',
      meta: {
        templateID: 'builtin-concept-simple',
        typeMarker: 'C',
        renderProfile: 'concept',
        faces: [{ front: 'Front', back: 'Back' }],
        customBack: 'back text',
      },
    });

    const analysis = analyzeProtectedSemanticOverwrite(before, after);

    expect(analysis.requiresConfirmation).toBe(true);
    expect(analysis.customFields.map((field) => field.path)).toEqual(expect.arrayContaining([
      'meta.templateID',
      'meta.typeMarker',
      'meta.renderProfile',
      'meta.faces',
      'meta.customBack',
    ]));
    expect(analysis.changedFields.map((field) => field.path)).toEqual(expect.arrayContaining([
      'type',
      'cardTypeMarker',
      'meta.templateID',
      'meta.typeMarker',
      'meta.renderProfile',
    ]));
  });
});
