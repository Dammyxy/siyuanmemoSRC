import { describe, expect, it, vi } from 'vitest';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import { CardContentQueryService } from '../CardContentQueryService';

function createQuerySiyuanApi(
  sql: ReturnType<typeof vi.fn> = vi.fn(async () => []),
): QuerySiyuanPort {
  return {
    ATTR_PRIORITY: 'custom-priority',
    ATTR_SUSPENDED: 'custom-suspended',
    ATTR_CARD_TYPE: 'custom-card-type',
    sql: sql as QuerySiyuanPort['sql'],
  };
}

describe('CardContentQueryService', () => {
  it('queries block content through the injected QuerySiyuanPort', async () => {
    const sql = vi.fn(async () => [
      { id: 'block-1', type: 'p', content: 'Block body' },
      { id: 'doc-1', type: 'd', content: 'Document title' },
    ]);
    const service = new CardContentQueryService(createQuerySiyuanApi(sql));

    const result = await service.getBlockContentsWithType(['block-1', 'doc-1']);

    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][0]).toContain("WHERE id IN ('block-1','doc-1') LIMIT 2");
    expect(result.get('block-1')).toMatchObject({
      id: 'block-1',
      content: 'Block body',
      type: 'p',
      isDocument: false,
    });
    expect(result.get('doc-1')).toMatchObject({
      id: 'doc-1',
      content: 'Document title',
      type: 'd',
      isDocument: true,
    });
  });

  it('escapes queried block ids and serves fresh repeats from cache', async () => {
    const sql = vi.fn(async () => [
      { id: "block-'1", type: 'p', content: 'Escaped body' },
    ]);
    const service = new CardContentQueryService(createQuerySiyuanApi(sql));

    const first = await service.getBlockContents(["block-'1"]);
    const second = await service.getBlockContents(["block-'1"]);

    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][0]).toContain("WHERE id IN ('block-''1') LIMIT 1");
    expect(first.get("block-'1")).toBe('Escaped body');
    expect(second.get("block-'1")).toBe('Escaped body');
  });

  it('returns an empty map without touching the port when block ids are empty', async () => {
    const sql = vi.fn(async () => []);
    const service = new CardContentQueryService(createQuerySiyuanApi(sql));

    const result = await service.getBlockContentsWithType([]);

    expect(result.size).toBe(0);
    expect(sql).not.toHaveBeenCalled();
  });
});
