import { describe, expect, it } from 'vitest';
import { resolveBrowserGridSizing } from '../browserGridSizing';

describe('browser grid sizing', () => {
  it('uses a lighter desktop first block to reduce low-end AG Grid commit work', () => {
    expect(resolveBrowserGridSizing({ mobileMode: false })).toEqual({
      cacheBlockSize: 32,
      maxBlocksInCache: 6,
      pageSize: 32,
      rowBuffer: 6,
    });
  });

  it('keeps the mobile scroll block larger while still bounding render buffer', () => {
    expect(resolveBrowserGridSizing({ mobileMode: true })).toEqual({
      cacheBlockSize: 120,
      maxBlocksInCache: 4,
      pageSize: 120,
      rowBuffer: 6,
    });
  });
});
