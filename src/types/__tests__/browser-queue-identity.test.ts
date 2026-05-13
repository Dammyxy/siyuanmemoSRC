import { describe, expect, it } from 'vitest';
import {
  getCanonicalBrowserQueueIds,
  isNeuralBrowserQueue,
  isRetrievalBrowserQueue,
  normalizeBrowserQueueId,
  resolveBrowserQueueIdForQueueType,
  resolveBrowserQueueIdentity,
  resolveQueueTypeForBrowserQueueId,
} from '../browser-queue-identity';
import { QueueType } from '../unified-data-source';

describe('browser queue identity', () => {
  it('resolves canonical browser queue ids to queue types', () => {
    expect(getCanonicalBrowserQueueIds()).toEqual([
      'retrieval',
      'final-drill',
      'incremental-learning',
      'filter-group',
      'neural-roam',
    ]);

    expect(resolveQueueTypeForBrowserQueueId('retrieval')).toBe(QueueType.RetrievalPractice);
    expect(resolveQueueTypeForBrowserQueueId('final-drill')).toBe(QueueType.FinalDrill);
    expect(resolveQueueTypeForBrowserQueueId('incremental-learning')).toBe(QueueType.IncrementalLearning);
    expect(resolveQueueTypeForBrowserQueueId('filter-group')).toBe(QueueType.FilterGroup);
    expect(resolveQueueTypeForBrowserQueueId('neural-roam')).toBe(QueueType.NeuralRoam);
  });

  it('normalizes supported aliases to canonical browser queue ids', () => {
    expect(normalizeBrowserQueueId(' neural ')).toBe('neural-roam');
    expect(normalizeBrowserQueueId('retrieval-practice')).toBe('retrieval');

    expect(resolveBrowserQueueIdentity('neural')).toMatchObject({
      ok: true,
      queueId: 'neural-roam',
      queueType: QueueType.NeuralRoam,
      aliasOf: 'neural',
      isNeural: true,
    });

    expect(resolveBrowserQueueIdentity(QueueType.RetrievalPractice)).toMatchObject({
      ok: true,
      queueId: 'retrieval',
      queueType: QueueType.RetrievalPractice,
      aliasOf: 'retrieval-practice',
      isRetrieval: true,
    });
  });

  it('maps queue types back to canonical browser queue ids', () => {
    expect(resolveBrowserQueueIdForQueueType(QueueType.RetrievalPractice)).toBe('retrieval');
    expect(resolveBrowserQueueIdForQueueType(QueueType.NeuralRoam)).toBe('neural-roam');
    expect(resolveBrowserQueueIdForQueueType(QueueType.Leech)).toBeNull();
  });

  it('reports invalid identity without fallback', () => {
    expect(resolveBrowserQueueIdentity('')).toEqual({
      ok: false,
      rawInput: '',
      reason: 'empty',
    });
    expect(resolveBrowserQueueIdentity('missing-queue')).toEqual({
      ok: false,
      rawInput: 'missing-queue',
      reason: 'unsupported-browser-queue',
    });

    expect(normalizeBrowserQueueId('missing-queue')).toBeNull();
    expect(resolveQueueTypeForBrowserQueueId('missing-queue')).toBeNull();
  });

  it('exposes narrow queue traits through canonicalization', () => {
    expect(isNeuralBrowserQueue('neural')).toBe(true);
    expect(isNeuralBrowserQueue('neural-roam')).toBe(true);
    expect(isNeuralBrowserQueue('retrieval')).toBe(false);

    expect(isRetrievalBrowserQueue('retrieval-practice')).toBe(true);
    expect(isRetrievalBrowserQueue('retrieval')).toBe(true);
    expect(isRetrievalBrowserQueue('final-drill')).toBe(false);
  });
});
