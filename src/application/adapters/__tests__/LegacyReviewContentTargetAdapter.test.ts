import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { resolveLegacyReviewContentTarget } from '../LegacyReviewContentTargetAdapter';
import {
  buildReviewRenderableCommand,
  buildReviewRenderableContext,
} from '../reviewRenderableContext';

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: 100,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.Review,
    lastReview: 50,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 10,
    updatedAt: 90,
    meta: {},
    ...overrides,
  };
}

function resolve(current: FSRSCard, overrides: Record<string, unknown> = {}) {
  return resolveLegacyReviewContentTarget({
    card: current,
    queueType: 'retrieval-practice',
    showAnswer: false,
    contentBlockId: current.blockId,
    answerBlockId: '',
    rendererSupported: true,
    ...overrides,
  });
}

describe('LegacyReviewContentTargetAdapter', () => {
  it('resolves a standard schedulable card without copying content', () => {
    const result = resolve(card());

    expect(result).toMatchObject({
      status: 'ready',
      target: {
        version: 1,
        kind: 'standard-card',
        identity: {
          itemId: 'card-1',
          cardId: 'card-1',
          blockId: 'block-1',
          contentBlockId: 'block-1',
        },
        classification: {
          kind: 'scheduled-card',
          formalSchedulerMutation: true,
        },
        contentAuthority: {
          kind: 'siyuan-block',
          sourceId: 'block-1',
        },
        supportedActions: expect.arrayContaining(['answer', 'edit', 'skip', 'back']),
        versionEvidence: {
          cardUpdatedAt: '90',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('question');
    expect(JSON.stringify(result)).not.toContain('answerContent');
  });

  it('resolves Topic-derived items as Xiuyuan processing targets', () => {
    const result = resolve(card({
      id: 'derived-1',
      xiuyuanID: 'aggregate-1',
      meta: {
        source: 'topic-derived',
        progressive: {
          kind: 'derived-item',
          sourceBlockId: 'source-1',
          sourceDocId: 'doc-1',
        },
      },
    }));

    expect(result).toMatchObject({
      status: 'ready',
      target: {
        kind: 'topic-derived-item',
        classification: {
          kind: 'progressive-processing',
          formalSchedulerMutation: false,
        },
        contentAuthority: {
          kind: 'xiuyuan-aggregate',
          sourceId: 'aggregate-1',
        },
        supportedActions: expect.arrayContaining(['answer', 'defer', 'convert']),
      },
    });
  });

  it('resolves progressive excerpts from authoritative lineage', () => {
    const result = resolve(card({
      id: 'excerpt-1',
      type: CardType.Topic,
      extractedFrom: 'source-1',
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceLineage: {
            version: 1,
            authority: 'siyuan-block',
            sourceDocId: 'doc-1',
            rootDocId: 'doc-1',
            rootKind: 'ordinary-doc',
            sourceBlockId: 'source-1',
            sourceBlockIds: ['source-1'],
            logicalParentId: 'doc-1',
            logicalParentType: 'root-doc',
          },
          sourceAvailability: {
            status: 'current',
            expectedPayloadHash: 'hash-1',
            currentPayloadHash: 'hash-1',
            missingBlockIds: [],
            detachedBlockIds: [],
            diagnostics: [],
          },
        },
      },
    }));

    expect(result).toMatchObject({
      status: 'ready',
      target: {
        kind: 'progressive-excerpt',
        sourceLineage: {
          sourceDocId: 'doc-1',
          sourceBlockId: 'source-1',
        },
        classification: {
          kind: 'progressive-processing',
          formalSchedulerMutation: false,
        },
        versionEvidence: {
          expectedSourceHash: 'hash-1',
          currentSourceHash: 'hash-1',
        },
      },
    });
  });

  it('resolves source locations separately from excerpts', () => {
    const result = resolve(card({
      id: 'piece-1',
      type: CardType.Topic,
      extractedFrom: 'source-1',
      meta: {
        progressive: {
          kind: 'piece',
          sourceBlockId: 'source-1',
          sourceDocId: 'doc-1',
        },
      },
    }));

    expect(result).toMatchObject({
      status: 'ready',
      target: {
        kind: 'source-location',
        identity: {
          sourceLocationId: 'source-1',
        },
        supportedActions: expect.arrayContaining(['edit', 'defer', 'convert', 'skip', 'back']),
      },
    });
  });

  it('builds typed commands without mutating the resolved content target', () => {
    const resolution = resolve(card({
      id: 'piece-command-1',
      type: CardType.Topic,
      extractedFrom: 'source-1',
      meta: {
        progressive: {
          kind: 'piece',
          sourceBlockId: 'source-1',
          sourceDocId: 'doc-1',
        },
      },
    }));
    expect(resolution.status).toBe('ready');
    if (resolution.status !== 'ready') {
      throw new Error('expected ready source-location target');
    }

    const before = JSON.stringify(resolution.target);
    const context = buildReviewRenderableContext(resolution);
    const actions = ['answer', 'edit', 'open-source', 'advance', 'defer', 'convert', 'skip', 'back'] as const;

    for (const action of actions) {
      const command = buildReviewRenderableCommand({
        context,
        action,
        idempotencyKey: `command-${action}`,
      });
      expect(command).toMatchObject({
        action,
        targetKind: 'source-location',
        targetIdentity: resolution.target.identity,
      });
      expect(command.targetIdentity).not.toBe(resolution.target.identity);
    }

    expect(JSON.stringify(resolution.target)).toBe(before);
  });

  it.each([
    ['missing', 'source-missing'],
    ['detached', 'source-detached'],
  ] as const)('fails closed when source is %s', (status, code) => {
    const result = resolve(card({
      id: `excerpt-${status}`,
      type: CardType.Topic,
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceLineage: {
            version: 1,
            authority: 'siyuan-block',
            sourceDocId: 'doc-1',
            rootDocId: 'doc-1',
            rootKind: 'ordinary-doc',
            sourceBlockId: 'source-1',
            sourceBlockIds: ['source-1'],
            logicalParentId: 'doc-1',
            logicalParentType: 'root-doc',
          },
          sourceAvailability: {
            status,
            expectedPayloadHash: 'hash-1',
            missingBlockIds: status === 'missing' ? ['source-1'] : [],
            detachedBlockIds: status === 'detached' ? ['source-1'] : [],
            diagnostics: [`${status}:source-1`],
          },
        },
      },
    }));

    expect(result).toMatchObject({
      status: 'unavailable',
      error: {
        code,
        targetKind: 'progressive-excerpt',
        diagnostics: expect.arrayContaining([`${status}:source-1`]),
      },
    });
  });

  it('fails explicitly when target evidence conflicts', () => {
    const result = resolve(card({
      id: 'conflict-1',
      meta: {
        source: 'topic-derived',
        progressive: {
          kind: 'excerpt',
          sourceBlockId: 'source-1',
          sourceDocId: 'doc-1',
        },
      },
    }));

    expect(result).toMatchObject({
      status: 'unavailable',
      error: {
        code: 'conflicting-evidence',
        targetKind: null,
        diagnostics: expect.arrayContaining([
          'target-evidence-topic-derived',
          'target-evidence-progressive-excerpt',
        ]),
      },
    });
  });

  it('fails explicitly when no renderer supports the target', () => {
    const result = resolve(card(), { rendererSupported: false });

    expect(result).toMatchObject({
      status: 'unavailable',
      error: {
        code: 'unsupported-renderer',
        targetKind: 'standard-card',
      },
    });
  });

  it('exposes changed source version evidence without treating stale content as current', () => {
    const result = resolve(card({
      id: 'excerpt-stale',
      type: CardType.Topic,
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceLineage: {
            version: 1,
            authority: 'siyuan-block',
            sourceDocId: 'doc-1',
            rootDocId: 'doc-1',
            rootKind: 'ordinary-doc',
            sourceBlockId: 'source-1',
            sourceBlockIds: ['source-1'],
            logicalParentId: 'doc-1',
            logicalParentType: 'root-doc',
          },
          payloadIdentity: {
            version: 1,
            algorithm: 'fnv1a32',
            hash: 'hash-old',
            sourceBlockIds: ['source-1'],
            textLength: 10,
            domLength: 20,
          },
          sourceAvailability: {
            status: 'stale',
            expectedPayloadHash: 'hash-old',
            currentPayloadHash: 'hash-new',
            missingBlockIds: [],
            detachedBlockIds: [],
            diagnostics: ['source-content-version-changed'],
          },
        },
      },
    }));

    expect(result).toMatchObject({
      status: 'ready',
      target: {
        kind: 'progressive-excerpt',
        versionEvidence: {
          sourcePayloadHash: 'hash-old',
          expectedSourceHash: 'hash-old',
          currentSourceHash: 'hash-new',
          sourceStatus: 'stale',
        },
        diagnostics: expect.arrayContaining(['source-content-version-changed']),
      },
    });
  });
});
