import { describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import type { BrowserCard } from '../types';
import {
  buildBrowserSelectionContextFingerprint,
  collectScopedBrowserSelectionIds,
  describeBrowserFilterSummary,
  isBrowserGridApiAlive,
} from '../browserSelectionScope';

function card(id: string): BrowserCard {
  return { id, blockId: `block-${id}` } as BrowserCard;
}

describe('browserSelectionScope', () => {
  it('uses query fingerprint when the datasource can provide one', () => {
    expect(buildBrowserSelectionContextFingerprint({
      activeDocId: null,
      activeQueueId: 'retrieval',
      activeScopeDocIds: null,
      cardType: 'all',
      preset: 'all',
      queryFingerprint: 'query:1',
      queryText: '',
      sortModel: [],
    })).toBe('query:1');
  });

  it('builds stable fallback fingerprint from browser scope state', () => {
    const fingerprint = buildBrowserSelectionContextFingerprint({
      activeDocId: 'doc-a',
      activeQueueId: null,
      activeScopeDocIds: ['root-a'],
      cardType: 'concept',
      preset: 'due',
      queryText: 'abc',
      sortModel: [{ colId: 'due', sort: 'desc' }],
    });

    expect(JSON.parse(fingerprint)).toMatchObject({
      queueId: '',
      scopeDocIds: ['root-a'],
      docId: 'doc-a',
      preset: 'due',
      queryText: 'abc',
      cardType: 'concept',
    });
  });

  it('describes all active filters for destructive action confirmation', () => {
    const text = describeBrowserFilterSummary({
      activeDocId: 'doc-a',
      activeQueueId: 'retrieval',
      activeScopeDocIds: ['root-a', 'root-b'],
      cardType: 'descriptor',
      hasActiveScopeDocIds: true,
      preset: 'suspended',
      queryText: '  target  ',
      t: (_key, fallback) => fallback,
    });

    expect(text).toContain('Scope: retrieval');
    expect(text).toContain('Doc Tree Scope: 2');
    expect(text).toContain('Document: doc-a');
    expect(text).toContain('Preset: suspended');
    expect(text).toContain('Card Type: descriptor');
    expect(text).toContain('Search: target');
  });

  it('collects only current page ids when desktop pagination is enabled', () => {
    const nodes = [
      { rowIndex: 0, data: card('a'), isSelected: () => true },
      { rowIndex: 1, data: card('b'), isSelected: () => true },
      { rowIndex: 2, data: card('c'), isSelected: () => false },
      { rowIndex: 3, data: card('d'), isSelected: () => true },
    ];
    const api = {
      forEachNode: (visitor: (node: typeof nodes[number]) => void) => nodes.forEach(visitor),
      paginationGetCurrentPage: () => 1,
      paginationGetPageSize: () => 2,
    } as unknown as GridApi<BrowserCard>;

    expect(collectScopedBrowserSelectionIds(api, {
      defaultPageSize: 50,
      paginationEnabled: true,
    })).toEqual({
      visibleIds: ['c', 'd'],
      selectedIds: ['d'],
    });
  });

  it('recognizes destroyed grid APIs', () => {
    expect(isBrowserGridApiAlive(null)).toBe(false);
    expect(isBrowserGridApiAlive({ isDestroyed: () => true } as unknown as GridApi)).toBe(false);
    expect(isBrowserGridApiAlive({ isDestroyed: () => false } as unknown as GridApi)).toBe(true);
  });
});
