import { describe, expect, it } from 'vitest';
import {
  buildRatingAriaLabel,
  resolveRatingByKey,
  SKIP_KEYS,
} from '../reviewHotkeys';

describe('reviewHotkeys', () => {
  it('resolves legacy letter aliases to ratings', () => {
    expect(resolveRatingByKey('j')).toBe(1);
    expect(resolveRatingByKey('a')).toBe(1);
    expect(resolveRatingByKey('k')).toBe(2);
    expect(resolveRatingByKey('s')).toBe(2);
    expect(resolveRatingByKey('l')).toBe(3);
    expect(resolveRatingByKey('d')).toBe(3);
    expect(resolveRatingByKey(';')).toBe(4);
    expect(resolveRatingByKey('f')).toBe(4);
  });

  it('keeps s out of skip keys to avoid Hard/Skip conflict', () => {
    expect(SKIP_KEYS.has('s')).toBe(false);
    expect(resolveRatingByKey('s')).toBe(2);
  });

  it('builds Good aria-label with Space/Enter hints', () => {
    expect(
      buildRatingAriaLabel(3, '3', { includeSpaceEnterForGood: true })
    ).toBe('3 / l / d / Space / Enter');
  });
});
