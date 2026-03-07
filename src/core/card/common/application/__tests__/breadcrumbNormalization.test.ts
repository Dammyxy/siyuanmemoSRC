import { describe, expect, it } from 'vitest';
import {
  clipBreadcrumbsAtLastDocument,
  normalizeRawBreadcrumbs,
} from '../breadcrumbNormalization';

describe('breadcrumbNormalization', () => {
  it('normalizes raw breadcrumbs and only deduplicates by id', () => {
    expect(normalizeRawBreadcrumbs([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: '1. Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: '1. Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: '1. Intro duplicate', type: 'NodeHeading' },
      { id: 'block-1', name: 'Current', type: 'NodeParagraph' },
    ])).toEqual([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: 'Intro', type: 'NodeHeading' },
    ]);
  });

  it('clips breadcrumbs at the last document item when requested', () => {
    expect(clipBreadcrumbsAtLastDocument([
      { id: 'doc-1', name: 'Root', type: 'NodeDocument' },
      { id: 'doc-2', name: 'Child', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Heading', type: 'NodeHeading' },
    ])).toEqual([
      { id: 'doc-1', name: 'Root', type: 'NodeDocument' },
      { id: 'doc-2', name: 'Child', type: 'NodeDocument' },
    ]);
  });
});
