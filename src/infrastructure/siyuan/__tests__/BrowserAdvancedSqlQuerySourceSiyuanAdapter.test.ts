import { describe, expect, it, vi } from 'vitest';
import {
  BrowserAdvancedSqlQuerySourceSiyuanAdapter,
  extractBrowserAdvancedSqlResultIds,
} from '../BrowserAdvancedSqlQuerySourceSiyuanAdapter';

describe('BrowserAdvancedSqlQuerySourceSiyuanAdapter', () => {
  it('executes advanced SQL as an infrastructure query source and returns stable ids', async () => {
    const sql = vi.fn(async () => [
      { id: 'block-a' },
      { card_id: 'card-b' },
      { fsrsCardId: 'card-c' },
      { block_id: 'block-d' },
      { id: 'block-a' },
      { id: '' },
    ]);
    const adapter = new BrowserAdvancedSqlQuerySourceSiyuanAdapter({ sql });

    await expect(adapter.matchedIds('select id from blocks')).resolves.toEqual([
      'block-a',
      'card-b',
      'card-c',
      'block-d',
    ]);
    expect(sql).toHaveBeenCalledWith('select id from blocks');
  });

  it('normalizes non-array SQL output to an empty id set', () => {
    expect(extractBrowserAdvancedSqlResultIds(null as never)).toEqual([]);
  });
});
