import { describe, expect, it } from 'vitest';
import { mergeExplicitSelectionByPage } from '../paginatedSelection';

describe('mergeExplicitSelectionByPage', () => {
  it('keeps selections from other pages when selecting current page rows', () => {
    const merged = mergeExplicitSelectionByPage({
      existingSelectedIds: ['a', 'b'],
      visibleIds: ['c', 'd'],
      pageSelectedIds: ['c'],
    });

    expect([...merged].sort()).toEqual(['a', 'b', 'c']);
  });

  it('can select every visible row on the current page while preserving other pages', () => {
    const merged = mergeExplicitSelectionByPage({
      existingSelectedIds: ['a', 'b'],
      visibleIds: ['c', 'd'],
      pageSelectedIds: ['c', 'd'],
    });

    expect([...merged].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes deselected current-page rows while preserving unrelated selections', () => {
    const merged = mergeExplicitSelectionByPage({
      existingSelectedIds: ['a', 'b', 'c'],
      visibleIds: ['b', 'c', 'd'],
      pageSelectedIds: ['d'],
    });

    expect([...merged].sort()).toEqual(['a', 'd']);
  });

  it('filters invalid ids and deduplicates repeated ids', () => {
    const merged = mergeExplicitSelectionByPage({
      existingSelectedIds: ['', 'a', 'a'],
      visibleIds: ['', 'x', 'x', 'y'],
      pageSelectedIds: ['y', '', 'y'],
    });

    expect([...merged].sort()).toEqual(['a', 'y']);
  });
});
