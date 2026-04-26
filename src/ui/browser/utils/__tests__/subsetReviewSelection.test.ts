import { describe, expect, it } from 'vitest';
import { resolveSubsetReviewSelection } from '../subsetReviewSelection';

describe('subset review selection resolution', () => {
  it('uses fsrsCardId as the precise subset identity', () => {
    const selection = resolveSubsetReviewSelection([
      { id: 'riff-1', fsrsCardId: 'card-1', blockId: 'block-1' },
      { id: 'riff-2', fsrsCardId: 'card-2', blockId: 'block-2' },
    ]);

    expect(selection.blockIds).toEqual(['block-1', 'block-2']);
    expect(selection.cardIds).toEqual(['card-1', 'card-2']);
    expect(selection.preferredCardId).toBe('card-1');
  });

  it('does not expand sibling cards when only one card from a shared block is selected', () => {
    const selection = resolveSubsetReviewSelection([
      { id: 'card-2', fsrsCardId: 'card-2', blockId: 'block-shared' },
    ]);

    expect(selection.blockIds).toEqual(['block-shared']);
    expect(selection.cardIds).toEqual(['card-2']);
  });

  it('preserves materialized all-matching order while deduplicating card and block ids', () => {
    const selection = resolveSubsetReviewSelection([
      { id: 'card-3', blockId: 'block-2' },
      { id: 'card-1', blockId: 'block-1' },
      { id: 'card-3', blockId: 'block-2' },
    ]);

    expect(selection.blockIds).toEqual(['block-2', 'block-1']);
    expect(selection.cardIds).toEqual(['card-3', 'card-1']);
    expect(selection.preferredCardId).toBe('card-3');
  });

  it('prefers the context menu anchor card without adding it to the subset', () => {
    const selection = resolveSubsetReviewSelection(
      [
        { id: 'card-1', blockId: 'block-1' },
        { id: 'card-2', blockId: 'block-1' },
      ],
      { id: 'card-anchor', blockId: 'block-1' },
    );

    expect(selection.cardIds).toEqual(['card-1', 'card-2']);
    expect(selection.preferredCardId).toBe('card-anchor');
  });
});
