import { describe, expect, it } from 'vitest';
import type { BreadcrumbItem } from '@/core/card/common/application/types';
import type { BrowserCard } from '../../types';
import {
  isDocumentPreviewType,
  resolvePreviewDocumentTitle,
  resolvePreviewTargetType,
} from '../previewBreadcrumbs';

function createCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date('2026-03-07T00:00:00.000Z'),
    dueFormatted: overrides.dueFormatted ?? 'today',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 1,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '-',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '-',
    priority: overrides.priority ?? 0,
    suspended: overrides.suspended ?? false,
    meta: overrides.meta ?? {},
  };
}

describe('previewBreadcrumbs', () => {
  it('recognizes document preview types', () => {
    expect(isDocumentPreviewType('NodeDocument')).toBe(true);
    expect(isDocumentPreviewType('d')).toBe(true);
    expect(isDocumentPreviewType('NodeParagraph')).toBe(false);
  });

  it('resolves selected document preview type from card metadata', () => {
    const card = createCard({
      blockId: 'doc-1',
      meta: {
        isDocument: true,
        blockType: 'd',
      },
    });

    expect(resolvePreviewTargetType({
      card,
      activePreviewBlockId: 'doc-1',
      breadcrumbs: [],
    })).toBe('NodeDocument');
  });

  it('falls back to a matching breadcrumb self item for selected document preview type', () => {
    const card = createCard({
      blockId: 'doc-root',
      fullContent: 'Root Document',
      meta: {},
    });

    expect(resolvePreviewTargetType({
      card,
      activePreviewBlockId: 'doc-root',
      breadcrumbs: [
        { id: 'doc-root', name: 'Root Document', type: 'NodeDocument' },
      ],
    })).toBe('NodeDocument');
  });

  it('prefers selected document content for title resolution', () => {
    const card = createCard({
      blockId: 'doc-1',
      content: 'Truncated title',
      fullContent: 'Full document title',
      meta: {
        content: 'Meta title',
        isDocument: true,
        blockType: 'd',
      },
    });

    expect(resolvePreviewDocumentTitle({
      card,
      activePreviewBlockId: 'doc-1',
      activePreviewType: 'NodeDocument',
      breadcrumbs: [],
    })).toBe('Full document title');
  });

  it('falls back to breadcrumb text for temporary document preview targets', () => {
    const card = createCard({
      blockId: 'block-1',
      meta: {
        blockType: 'p',
      },
    });
    const breadcrumbs: BreadcrumbItem[] = [
      { id: 'doc-1', name: 'Doc Title', type: 'NodeDocument' },
      { id: 'block-1', name: 'Current Block', type: 'NodeParagraph' },
    ];

    const activePreviewType = resolvePreviewTargetType({
      card,
      activePreviewBlockId: 'doc-1',
      breadcrumbs,
    });

    expect(resolvePreviewDocumentTitle({
      card,
      activePreviewBlockId: 'doc-1',
      activePreviewType,
      breadcrumbs,
    })).toBe('Doc Title');
  });
});
