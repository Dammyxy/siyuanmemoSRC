import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';
import {
  deriveAncestorDocumentPaths,
  getPreviewBreadcrumbTrimCount,
  loadPreviewBreadcrumbTrail,
} from '../previewBreadcrumbData';

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

describe('previewBreadcrumbData', () => {
  beforeEach(() => {
    const breadcrumbMap: Record<string, Array<Record<string, string>>> = {
      'block-1': [
        { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
        { id: 'heading-1', name: '1. Intro', type: 'NodeHeading' },
        { id: 'heading-2', name: '1. Intro', type: 'NodeHeading' },
        { id: 'heading-2', name: '1. Intro duplicate', type: 'NodeHeading' },
        { id: 'block-1', name: 'Current Block', type: 'NodeParagraph' },
      ],
      'doc-1': [
        { id: 'doc-1', name: 'Document Title', type: 'NodeDocument' },
      ],
      'doc-root': [
        { id: 'doc-root', name: 'Root Document', type: 'NodeDocument' },
      ],
      'doc-meta-less': [
        { id: 'doc-meta-less', name: 'Meta Less Document', type: 'NodeDocument' },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

      if (url.endsWith('/api/block/getBlockBreadcrumb')) {
        return {
          json: async () => ({
            code: 0,
            data: breadcrumbMap[String(body.id || '')] ?? [],
          }),
        };
      }

      if (url.endsWith('/api/filetree/getDoc')) {
        return {
          json: async () => ({
            code: 0,
            data: body.id === 'doc-1'
              ? { box: 'box-1', path: '/parent-doc.sy/doc-1.sy' }
              : body.id === 'doc-root'
                ? { box: 'box-1', path: '/doc-root.sy' }
                : body.id === 'doc-meta-less'
                  ? { box: 'box-1', path: '/doc-meta-less.sy' }
              : {},
          }),
        };
      }

      if (url.endsWith('/api/query/sql')) {
        return {
          json: async () => ({
            code: 0,
            data: [
              {
                id: 'parent-doc',
                content: 'Parent Document',
                hpath: '/Parent Document',
                path: '/parent-doc.sy',
                type: 'NodeDocument',
              },
            ],
          }),
        };
      }

      if (url.endsWith('/api/notebook/lsNotebooks')) {
        return {
          json: async () => ({
            code: 0,
            data: {
              notebooks: [
                { id: 'box-1', name: 'Notebook One' },
              ],
            },
          }),
        };
      }

      return {
        json: async () => ({ code: 0, data: [] }),
      };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Xiuyuan list-template trim count of two', () => {
    expect(getPreviewBreadcrumbTrimCount(createCard({
      meta: { templateID: 'builtin-list-item' },
    }))).toBe(2);
    expect(getPreviewBreadcrumbTrimCount(createCard())).toBe(1);
  });

  it('derives ancestor document paths from a document path', () => {
    expect(deriveAncestorDocumentPaths('/root.sy/child.sy/grandchild.sy')).toEqual([
      '/root.sy',
      '/root.sy/child.sy',
    ]);
  });

  it('keeps same-name ancestors with different ids while excluding current block', async () => {
    const breadcrumbs = await loadPreviewBreadcrumbTrail('block-1', createCard({
      blockId: 'block-1',
      meta: {
        blockType: 'p',
      },
    }));

    expect(breadcrumbs).toEqual([
      { id: 'notebook:box-1', name: 'Notebook One', type: 'Notebook' },
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: 'Intro', type: 'NodeHeading' },
    ]);
  });

  it('falls back to the document parent trail when breadcrumb API only returns self', async () => {
    const breadcrumbs = await loadPreviewBreadcrumbTrail('doc-1', createCard({
      blockId: 'doc-1',
      fullContent: 'Document Title',
      meta: {
        isDocument: true,
        blockType: 'd',
      },
    }));

    expect(breadcrumbs).toEqual([
      { id: 'notebook:box-1', name: 'Notebook One', type: 'Notebook' },
      { id: 'parent-doc', name: 'Parent Document', type: 'NodeDocument' },
    ]);
  });

  it('falls back to the current document itself when a root document has no parent path', async () => {
    const breadcrumbs = await loadPreviewBreadcrumbTrail('doc-root', createCard({
      blockId: 'doc-root',
      fullContent: 'Root Document',
      meta: {
        isDocument: true,
        blockType: 'd',
      },
    }));

    expect(breadcrumbs).toEqual([
      { id: 'notebook:box-1', name: 'Notebook One', type: 'Notebook' },
      { id: 'doc-root', name: 'Root Document', type: 'NodeDocument' },
    ]);
  });

  it('infers document breadcrumbs from the raw self breadcrumb even without document meta markers', async () => {
    const breadcrumbs = await loadPreviewBreadcrumbTrail('doc-meta-less', createCard({
      blockId: 'doc-meta-less',
      fullContent: 'Meta Less Document',
      meta: {},
    }));

    expect(breadcrumbs).toEqual([
      { id: 'notebook:box-1', name: 'Notebook One', type: 'Notebook' },
      { id: 'doc-meta-less', name: 'Meta Less Document', type: 'NodeDocument' },
    ]);
  });
});
