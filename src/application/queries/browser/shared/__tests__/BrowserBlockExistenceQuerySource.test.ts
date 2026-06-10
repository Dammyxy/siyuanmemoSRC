import { describe, expect, it, vi } from 'vitest';
import {
  BrowserBlockExistenceQuerySource,
  loadExistingBrowserBlockIds,
  normalizeBrowserBlockId,
  normalizeBrowserBlockIds,
} from '../BrowserBlockExistenceQuerySource';

describe('BrowserBlockExistenceQuerySource', () => {
  it('normalizes browser block ids consistently', () => {
    expect(normalizeBrowserBlockId(' block-a ')).toBe('block-a');
    expect(normalizeBrowserBlockIds([' block-a ', '', null, 'block-a', 'block-b']))
      .toEqual(['block-a', 'block-b']);
  });

  it('loads existing block ids through escaped batched SQL', async () => {
    const statements: string[] = [];
    const batches: Array<{ batchIds: string[]; offset: number }> = [];
    const loadRows = vi.fn(async (stmt: string, batch: { batchIds: string[]; offset: number }) => {
      statements.push(stmt);
      batches.push(batch);
      return batch.offset === 0
        ? [{ id: ' block-a ' }, { id: null }]
        : [{ id: "block-'b" }];
    });

    const existing = await loadExistingBrowserBlockIds(
      [' block-a ', 'block-a', "block-'b", 'block-c'],
      loadRows,
      { batchSize: 2 },
    );

    expect(Array.from(existing)).toEqual(['block-a', "block-'b"]);
    expect(loadRows).toHaveBeenCalledTimes(2);
    expect(batches).toEqual([
      { batchIds: ['block-a', "block-'b"], offset: 0 },
      { batchIds: ['block-c'], offset: 2 },
    ]);
    expect(statements[0]).toContain("'block-''b'");
    expect(statements[1]).toContain("'block-c'");
  });

  it('executes through the query port while preserving batch instrumentation', async () => {
    const sql = vi.fn(async () => [{ id: 'block-a' }]);
    const spans: Array<{ batchIds: string[]; offset: number }> = [];
    const source = new BrowserBlockExistenceQuerySource({ sql } as never, {
      batchSize: 1,
      instrumentation: {
        loadExistingBlockIds: async (_stmt, batch, loadRows) => {
          spans.push(batch);
          return loadRows();
        },
      },
    });

    const existing = await source.loadExistingBlockIds(['block-a', 'block-b']);

    expect(Array.from(existing)).toEqual(['block-a']);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(spans).toEqual([
      { batchIds: ['block-a'], offset: 0 },
      { batchIds: ['block-b'], offset: 1 },
    ]);
  });
});
