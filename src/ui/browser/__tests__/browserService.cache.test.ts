import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCacheStats,
  invalidateCardCache,
  loadAllCards,
} from '../browserService';

function createEmptyManager() {
  return {
    getRouter: () => ({
      getCards: vi.fn().mockResolvedValue([]),
    }),
  } as any;
}

describe('browserService cache behavior', () => {
  afterEach(() => {
    invalidateCardCache();
    vi.restoreAllMocks();
  });

  it('keeps cache valid for 10 seconds and expires afterwards', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(0);

    await loadAllCards(createEmptyManager(), true);
    expect(getCacheStats().valid).toBe(true);

    nowSpy.mockReturnValue(9_999);
    expect(getCacheStats().valid).toBe(true);

    nowSpy.mockReturnValue(10_001);
    expect(getCacheStats().valid).toBe(false);
  });

  it('explicit invalidation clears cache immediately', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    await loadAllCards(createEmptyManager(), true);
    expect(getCacheStats().count).toBe(0);
    expect(getCacheStats().valid).toBe(true);

    invalidateCardCache();
    expect(getCacheStats().valid).toBe(false);
  });
});
