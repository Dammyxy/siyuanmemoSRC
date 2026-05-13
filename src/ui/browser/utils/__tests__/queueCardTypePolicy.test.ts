import { describe, expect, it } from 'vitest';
import {
  normalizeCardTypeForQueue,
  resolveQueueCardTypeOnSwitch,
} from '../queueCardTypePolicy';

describe('queueCardTypePolicy', () => {
  it('stores current non-neural filter and switches to concept-only when entering neural queue', () => {
    const result = resolveQueueCardTypeOnSwitch({
      fromQueueId: 'retrieval',
      toQueueId: 'neural-roam',
      currentCardType: 'item-only',
      previousNonNeuralCardType: null,
    });

    expect(result.nextCardType).toBe('concept-only');
    expect(result.nextPreviousNonNeuralCardType).toBe('item-only');
  });

  it('forces concept-only when entering neural queue from missing filter', () => {
    const result = resolveQueueCardTypeOnSwitch({
      fromQueueId: null,
      toQueueId: 'neural-roam',
      currentCardType: 'missing-block-only',
      previousNonNeuralCardType: 'all',
    });

    expect(result.nextCardType).toBe('concept-only');
    expect(result.nextPreviousNonNeuralCardType).toBe('all');
  });

  it('restores previous non-neural filter when leaving neural queue', () => {
    const result = resolveQueueCardTypeOnSwitch({
      fromQueueId: 'neural-roam',
      toQueueId: 'filter-group',
      currentCardType: 'concept-only',
      previousNonNeuralCardType: 'topic-only',
    });

    expect(result.nextCardType).toBe('topic-only');
  });

  it('falls back to all when restored filter is not allowed in target queue', () => {
    const result = resolveQueueCardTypeOnSwitch({
      fromQueueId: 'neural-roam',
      toQueueId: 'retrieval',
      currentCardType: 'concept-only',
      previousNonNeuralCardType: 'topic-only',
    });

    expect(result.nextCardType).toBe('all');
  });

  it('normalizes non-neural queue card type by allowed options', () => {
    expect(normalizeCardTypeForQueue('retrieval-practice', 'topic-only', 'all')).toBe('all');
    expect(normalizeCardTypeForQueue('retrieval', 'concept-only', 'all')).toBe('all');
    expect(normalizeCardTypeForQueue('retrieval', 'item-only', 'all')).toBe('item-only');
  });
});
