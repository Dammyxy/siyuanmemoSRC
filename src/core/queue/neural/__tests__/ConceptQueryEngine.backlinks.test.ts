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
    vi.mocked(api.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('FROM refs r')) {
        return [
          { id: 'list-item-1', source_id: 'list-item-1', source_type: 'i', normalized_to_parent: 0 },
          { id: 'paragraph-1', source_id: 'paragraph-1', source_type: 'p', normalized_to_parent: 0 },
          { id: 'list-item-1', source_id: 'list-item-1', source_type: 'i', normalized_to_parent: 0 },
          { id: '', source_id: '', source_type: 'p', normalized_to_parent: 0 },
          { id: null, source_id: null, source_type: null, normalized_to_parent: 0 },
          { id: 'concept-1', source_id: 'concept-1', source_type: 'p', normalized_to_parent: 0 },
        ] as any;
      }
      if (stmt.includes("WHERE b.id = 'list-item-1'")) {
        return [{ id: 'list-item-1', content: 'list item', type: 'i', parent_id: 'root', root_id: 'doc-1' }] as any;
      }
      if (stmt.includes("WHERE b.id = 'paragraph-1'")) {
        return [{ id: 'paragraph-1', content: 'paragraph', type: 'p', parent_id: 'root', root_id: 'doc-1' }] as any;
      }
      if (stmt.includes("WHERE parent_id = 'list-item-1'")) {
        return [] as any;
      }
      if (stmt.includes('FROM fsrs_cards')) {
        return [] as any;
      }
      return [] as any;
    });

    const result = await engine.fetchBacklinks('concept-1');

    expect(result).toEqual(['list-item-1', 'paragraph-1']);

    const stmt = vi.mocked(api.sql).mock.calls[0]?.[0] as string;
    expect(stmt).toContain('CASE');
    expect(stmt).toContain("li.type = 'i'");
    expect(stmt).toContain("r.def_block_id = 'concept-1'");
  });

  it('uses cache for repeated backlink queries', async () => {
    vi.mocked(api.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('FROM refs r')) {
        return [{ id: 'cached-backlink', source_id: 'cached-backlink', source_type: 'p', normalized_to_parent: 0 }] as any;
      }
      if (stmt.includes("WHERE b.id = 'cached-backlink'")) {
        return [{ id: 'cached-backlink', content: 'cached backlink', type: 'p', parent_id: 'root', root_id: 'doc-1' }] as any;
      }
      if (stmt.includes('FROM fsrs_cards')) {
        return [] as any;
      }
      return [] as any;
    });

    const first = await engine.fetchBacklinks('concept-cache');
    const initialCalls = vi.mocked(api.sql).mock.calls.length;
    const second = await engine.fetchBacklinks('concept-cache');

    expect(first).toEqual(['cached-backlink']);
    expect(second).toEqual(['cached-backlink']);
    expect(api.sql).toHaveBeenCalledTimes(initialCalls);
  });

  it('keeps normalized parent list items as virtual backlink nodes even when children are real flashcards', async () => {
    vi.mocked(api.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('FROM refs r')) {
        return [
          {
            id: 'list-item-1',
            source_id: 'paragraph-card-1',
            source_type: 'p',
            normalized_to_parent: 1,
          },
        ] as any;
      }
      return [] as any;
    });

    const result = await engine.fetchBacklinks('concept-1');

    expect(result).toEqual(['list-item-1']);
  });

  it('fetches indirect outgoing links from backlinks and descendants', async () => {
    vi.mocked(api.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('WITH RECURSIVE backlink_scope')) {
        return [{ id: 'outgoing-1' }] as any;
      }
      return [] as any;
    });

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

  it('collects exact descriptor blocks from descriptor scope without turning them into main neighbors', async () => {
    vi.mocked(api.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes("WHERE fc.block_id IN (SELECT id FROM descriptor_scope)")) {
        return [
          { id: 'descriptor-paragraph-1' },
          { id: 'descriptor-paragraph-2' },
        ] as any;
      }
      return [] as any;
    });

    const result = await engine.fetchDescriptors('concept-1');

    expect(result).toEqual(['descriptor-paragraph-1', 'descriptor-paragraph-2']);
  });

  it('filters exact local review cards and descriptors out of main neighbors while keeping virtual nodes', async () => {
    vi.spyOn(engine, 'fetchBacklinks').mockResolvedValue(['virtual-wrapper-1', 'descriptor-1']);
    vi.spyOn(engine, 'fetchDirectOutgoingLinks').mockResolvedValue(['item-1', 'concept-2']);
    vi.spyOn(engine, 'fetchIndirectOutgoingLinks').mockResolvedValue(['virtual-wrapper-1']);
    const fetchDescriptorsSpy = vi.spyOn(engine, 'fetchDescriptors').mockResolvedValue(['descriptor-ignored']);

    vi.mocked(api.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes("WHERE block_id = 'descriptor-1'")) {
        return [{ type: 'descriptor', card_type_marker: 'descriptor' }] as any;
      }
      if (stmt.includes("WHERE block_id = 'item-1'")) {
        return [{ type: 'item', card_type_marker: '' }] as any;
      }
      if (stmt.includes("WHERE block_id = 'concept-2'")) {
        return [{ type: 'concept', card_type_marker: 'concept' }] as any;
      }
      if (stmt.includes("WHERE block_id = 'virtual-wrapper-1'")) {
        return [] as any;
      }
      return [] as any;
    });

    const result = await engine.fetchNeighbors('concept-1');

    expect(fetchDescriptorsSpy).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'virtual-wrapper-1',
        type: 'backlink',
        weight: 15,
      },
      {
        id: 'concept-2',
        type: 'outgoing-direct',
        weight: 10,
      },
    ]);
  });

  it('fetches subtree block ids including the root block and descendants', async () => {
    vi.mocked(api.sql).mockResolvedValue([
      { id: 'virtual-1' },
      { id: 'descriptor-1' },
      { id: 'item-1' },
    ] as any);

    const result = await engine.fetchSubtreeBlockIds('virtual-1');

    expect(result).toEqual(['virtual-1', 'descriptor-1', 'item-1']);
  });
});
