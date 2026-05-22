import { describe, expect, it } from 'vitest';
import type { CardFilter } from '@/types/unified-data-source';
import {
  captureBrowserOpenState,
  normalizeBrowserNeuralSubview,
  normalizeBrowserQueueId,
  normalizeBrowserStringArray,
  resolveInitialBrowserOpenState,
} from '../browserSurfaceState';

function buildFilter(): CardFilter {
  return {
    conditions: [
      {
        field: 'deck',
        operator: 'contains',
        value: 'daily',
      },
    ],
  } as unknown as CardFilter;
}

describe('browserSurfaceState', () => {
  it('normalizes queue ids, scope arrays, and neural subviews', () => {
    expect(normalizeBrowserQueueId(' neural ')).toBe('neural-roam');
    expect(normalizeBrowserQueueId('')).toBeNull();
    expect(normalizeBrowserStringArray([' doc-1 ', 'doc-2', 'doc-1', ''])).toEqual(['doc-1', 'doc-2']);
    expect(normalizeBrowserNeuralSubview('engine-history')).toBe('engine-history');
    expect(normalizeBrowserNeuralSubview('worldline-anchors')).toBe('worldline-anchors');
    expect(normalizeBrowserNeuralSubview(null)).toBeNull();
  });

  it('captures only active browser open-state fields', () => {
    const filter = buildFilter();
    const filterState = captureBrowserOpenState({
      queueId: 'filter-group',
      globalScope: null,
      scopeDocIds: ['doc-1'],
      docId: null,
      queryText: 'alpha',
      preset: 'all',
      cardType: 'topic-only',
      filter,
      neuralSubview: 'roam-history',
    });

    expect(filterState).toMatchObject({
      queueId: 'filter-group',
      scopeDocIds: ['doc-1'],
      queryText: 'alpha',
      filter,
      neuralSubview: null,
    });
    expect(filterState.filter).not.toBe(filter);

    const neuralState = captureBrowserOpenState({
      queueId: 'neural',
      globalScope: null,
      scopeDocIds: null,
      docId: null,
      queryText: '',
      preset: 'all',
      cardType: 'concept-only',
      filter,
      neuralSubview: 'engine-history',
    });

    expect(neuralState.filter).toBeNull();
    expect(neuralState.neuralSubview).toBe('engine-history');
  });

  it('resolves legacy missing-block state back to the default global projection', () => {
    const resolved = resolveInitialBrowserOpenState({
      state: {
        queueId: 'filter-group',
        globalScope: '__dismissed__',
        scopeDocIds: ['doc-1'],
        docId: '__lost__',
        queryText: 'alpha',
        preset: 'due',
        cardType: 'topic-only',
        filter: buildFilter(),
        neuralSubview: 'roam-history',
      },
      currentQueueId: 'neural-roam',
      previousNonNeuralCardType: 'descriptor-only',
    });

    expect(resolved.normalizedLegacyMissingBlockScope).toBe(true);
    expect(resolved.shouldApplyFilterGroupFilter).toBe(false);
    expect(resolved.shouldClearNeuralSubviewData).toBe(true);
    expect(resolved.shouldRefreshNeuralSubviewData).toBe(false);
    expect(resolved.projection).toMatchObject({
      queueId: null,
      globalScope: '__all__',
      scopeDocIds: null,
      docId: null,
      preset: 'all',
      cardType: 'descriptor-only',
      queryText: '',
      filter: null,
      neuralSubview: 'concept-cards',
      shouldFocusDocList: false,
    });
  });

  it('projects initial neural state through queue card-type policy', () => {
    const resolved = resolveInitialBrowserOpenState({
      state: {
        queueId: 'neural',
        scopeDocIds: [' doc-1 ', 'doc-1', 'doc-2'],
        cardType: 'descriptor-only',
        neuralSubview: 'worldline-anchors',
      },
      currentQueueId: null,
      previousNonNeuralCardType: null,
    });

    expect(resolved.shouldClearNeuralSubviewData).toBe(false);
    expect(resolved.shouldRefreshNeuralSubviewData).toBe(true);
    expect(resolved.projection).toMatchObject({
      queueId: 'neural-roam',
      scopeDocIds: ['doc-1', 'doc-2'],
      preset: 'all',
      cardType: 'concept-only',
      previousNonNeuralCardType: 'descriptor-only',
      neuralSubview: 'worldline-anchors',
      shouldFocusDocList: true,
    });
  });
});
