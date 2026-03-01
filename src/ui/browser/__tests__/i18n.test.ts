import { describe, expect, it } from 'vitest';
import { interpolateI18n } from '../utils/i18n';

describe('interpolateI18n', () => {
  it('replaces {count} placeholder', () => {
    const result = interpolateI18n('Remove {count} cards?', { count: 3 });
    expect(result).toBe('Remove 3 cards?');
  });

  it('replaces multiple placeholders', () => {
    const result = interpolateI18n('Updated {updated}, skipped {skipped}', {
      updated: 8,
      skipped: 2,
    });
    expect(result).toBe('Updated 8, skipped 2');
  });

  it('keeps unknown placeholders unchanged', () => {
    const result = interpolateI18n('Remove {count} cards in {queue}', { count: 5 });
    expect(result).toBe('Remove 5 cards in {queue}');
  });
});
