import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../siyuan/api';
import { ConceptQueryEngine } from '../ConceptQueryEngine';

vi.mock('../../../siyuan/api', () => ({
  sql: vi.fn(),
}));

describe('ConceptQueryEngine - backlink normalization', () => {
  let engine: ConceptQueryEngine;

  beforeEach(() => {
    engine = new ConceptQueryEngine();
    vi.clearAllMocks();
  });

  it('normalizes backlinks to list-item IDs and filters invalid values', async () => {
    vi.mocked(api.sql).mockResolvedValue([
      { id: 'list-item-1' },
      { id: 'paragraph-1' },
      { id: 'list-item-1' },
      { id: '' },
      { id: null },
      { id: 'concept-1' },
    ] as any);

    const result = await engine.fetchBacklinks('concept-1');

    expect(result).toEqual(['list-item-1', 'paragraph-1']);

    const stmt = vi.mocked(api.sql).mock.calls[0]?.[0] as string;
    expect(stmt).toContain('CASE');
    expect(stmt).toContain("li.type = 'i'");
    expect(stmt).toContain("r.def_block_id = 'concept-1'");
  });

  it('uses cache for repeated backlink queries', async () => {
    vi.mocked(api.sql).mockResolvedValueOnce([{ id: 'cached-backlink' }] as any);

    const first = await engine.fetchBacklinks('concept-cache');
    const second = await engine.fetchBacklinks('concept-cache');

    expect(first).toEqual(['cached-backlink']);
    expect(second).toEqual(['cached-backlink']);
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('fetches indirect outgoing links from backlinks and descendants', async () => {
    vi.mocked(api.sql).mockResolvedValue([{ id: 'outgoing-1' }] as any);

    const result = await engine.fetchIndirectOutgoingLinks('concept-1', ['list-item-1']);

    expect(result).toEqual(['outgoing-1']);

    const stmt = vi.mocked(api.sql).mock.calls[0]?.[0] as string;
    expect(stmt).toContain('WITH RECURSIVE backlink_scope');
    expect(stmt).toContain('INNER JOIN backlink_scope s ON child.parent_id = s.id');
    expect(stmt).toContain("r.def_block_id != 'concept-1'");
  });

  it('returns empty array for indirect outgoing when backlink scope is empty', async () => {
    const result = await engine.fetchIndirectOutgoingLinks('concept-empty', []);

    expect(result).toEqual([]);
    expect(api.sql).not.toHaveBeenCalled();
  });
});
