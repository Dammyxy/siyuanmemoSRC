import { describe, expect, it } from 'vitest';
import {
  buildProcessingPrioritySourceIdentity,
  planProcessingPriorityInvalidation,
  readProcessingQueue,
  resolveEffectiveProcessingPriority,
  type ProcessingWorkItem,
} from '../processingScheduler';

const NOW = new Date('2026-04-27T08:00:00+08:00').getTime();
const DAY_MS = 86_400_000;

function item(id: string, overrides: Partial<ProcessingWorkItem> = {}): ProcessingWorkItem {
  return {
    id,
    kind: 'progressive-item',
    sourceId: `block-${id}`,
    processingDueAt: NOW,
    sourceLineage: [`block-${id}`, 'doc-root'],
    ...overrides,
  };
}

describe('processing scheduler priority policy', () => {
  it('uses manual priority before ancestor and default sources', () => {
    const priority = resolveEffectiveProcessingPriority(item('manual', {
      manualPriority: 12,
      sourceLineage: ['close-parent', 'doc-root'],
    }), {
      defaultPriority: 50,
      ancestorPriorities: {
        'close-parent': 3,
      },
    });

    expect(priority).toMatchObject({
      value: 12,
      source: {
        kind: 'manual',
        id: 'manual',
        priority: 12,
      },
      identity: {
        version: 1,
        source: 'manual',
        sourceId: 'manual',
        priority: 12,
        fingerprint: expect.any(String),
      },
    });
  });

  it('inherits priority from the closest eligible ancestor/source', () => {
    const priority = resolveEffectiveProcessingPriority(item('excerpt', {
      kind: 'excerpt',
      sourceLineage: ['source-block', 'section-parent', 'doc-root'],
    }), {
      defaultPriority: 50,
      ancestorPriorities: {
        'section-parent': 70,
        'doc-root': 5,
      },
    });

    expect(priority).toMatchObject({
      value: 70,
      source: {
        kind: 'ancestor',
        id: 'section-parent',
        priority: 70,
      },
    });
  });

  it('falls back through context override and policy default when no manual or ancestor source exists', () => {
    expect(resolveEffectiveProcessingPriority(item('topic', {
      kind: 'topic-derived',
      sourceLineage: ['missing-parent'],
    }), {
      defaultPriority: 50,
      ancestorPriorities: {},
      contextOverrides: {
        'topic-derived': 25,
      },
    })).toMatchObject({
      value: 25,
      source: { kind: 'context-override', id: 'topic-derived' },
    });

    expect(resolveEffectiveProcessingPriority(item('document', {
      kind: 'document',
      sourceLineage: [],
    }), {
      defaultPriority: 55,
    })).toMatchObject({
      value: 55,
      source: { kind: 'default', id: 'policy-default' },
    });
  });

  it('invalidates priority identity when an ancestor/source priority changes', () => {
    const before = buildProcessingPrioritySourceIdentity({
      kind: 'ancestor',
      id: 'doc-root',
      priority: 20,
    });
    const after = buildProcessingPrioritySourceIdentity({
      kind: 'ancestor',
      id: 'doc-root',
      priority: 21,
    });

    const plan = planProcessingPriorityInvalidation({
      change: { sourceId: 'doc-root', before, after },
      items: [
        item('affected', { sourceLineage: ['child', 'doc-root'] }),
        item('unaffected', { sourceLineage: ['other-root'] }),
      ],
      reviewRefs: [
        { cardId: 'review-card', blockId: 'review-block', sourceLineage: ['doc-root'] },
      ],
    });

    expect(before.fingerprint).not.toBe(after.fingerprint);
    expect(plan).toMatchObject({
      reason: 'priority-source-changed',
      sourceId: 'doc-root',
      affectedProcessingItemIds: ['affected'],
      affectedReviewCardIds: ['review-card'],
      affectedBlockIds: ['review-block'],
      projectionFamilies: ['processing', 'review'],
      refreshRequired: true,
    });
  });

  it('reads processing due state without mutating formal FSRS due fields or review facts', () => {
    const formalDue = NOW + 10 * DAY_MS;
    const processingItem = item('processing-card', {
      kind: 'topic-derived',
      processingDueAt: NOW - 60_000,
      payload: {
        formalCardId: 'card-a',
        formalDue,
        reviewFactId: null,
      },
    });

    const result = readProcessingQueue({
      now: NOW,
      items: [
        item('future', { processingDueAt: NOW + DAY_MS, manualPriority: 1 }),
        processingItem,
      ],
      policy: {
        defaultPriority: 50,
      },
      includeFuture: false,
    });

    expect(result.entries).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({
          id: 'processing-card',
          processingDueAt: NOW - 60_000,
          payload: {
            formalCardId: 'card-a',
            formalDue,
            reviewFactId: null,
          },
        }),
        dueState: 'due',
        priority: expect.objectContaining({
          source: expect.objectContaining({ kind: 'default' }),
        }),
      }),
    ]);
    expect(processingItem.processingDueAt).toBe(NOW - 60_000);
    expect(processingItem.payload).toEqual({
      formalCardId: 'card-a',
      formalDue,
      reviewFactId: null,
    });
  });
});
