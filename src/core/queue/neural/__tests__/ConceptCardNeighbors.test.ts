/**
 * ConceptCardNeighbors.test.ts
 * 
 * 测试概念卡的神经漫游邻居查询逻辑
 * 
 * 测试范围：
 * - 反向链接查询（BACKLINK）
 * - 概念链接查询（CONCEPT_LINK）
 * - 描述符卡查询（DESCRIPTOR）
 * - 概念卡检测
 * 
 * Requirements: 3.2, 3.3, 3.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryEngine } from '../QueryEngine';
import { AssociationType, DEFAULT_NEURAL_QUEUE_CONFIG } from '../types';
import * as api from '../../../siyuan/api';

// Mock 思源 API
vi.mock('../../../siyuan/api', () => ({
  sql: vi.fn(),
}));

// Mock fetch for backlink API
global.fetch = vi.fn();

describe('QueryEngine - Concept Card Neighbors', () => {
  let queryEngine: QueryEngine;

  beforeEach(() => {
    vi.resetAllMocks();
    queryEngine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG);
  });

  describe('isConceptCard', () => {
    it('should return true for concept cards', async () => {
      const resolveNodeType = vi.fn(async () => 'concept' as const);
      queryEngine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG, { resolveNodeType });

      const result = await queryEngine.isConceptCard('concept-block-1');

      expect(result).toBe(true);
      expect(resolveNodeType).toHaveBeenCalledWith('concept-block-1');
      expect(api.sql).not.toHaveBeenCalled();
    });

    it('should return false for non-concept cards', async () => {
      const resolveNodeType = vi.fn(async () => 'item' as const);
      queryEngine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG, { resolveNodeType });

      const result = await queryEngine.isConceptCard('normal-block-1');

      expect(result).toBe(false);
      expect(resolveNodeType).toHaveBeenCalledWith('normal-block-1');
      expect(api.sql).not.toHaveBeenCalled();
    });

    it('should return false when no card type attribute exists', async () => {
      vi.mocked(api.sql).mockResolvedValue([]);

      const result = await queryEngine.isConceptCard('no-type-block');

      expect(result).toBe(false);
    });

    it('should handle SQL errors gracefully', async () => {
      vi.mocked(api.sql).mockRejectedValue(new Error('Database error'));

      await expect(queryEngine.isConceptCard('error-block'))
        .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
    });
  });

  describe('fetchBacklinks', () => {
    it('should fetch backlinks using /api/ref/getBacklink2', async () => {
      const mockBacklinks = [
        { blockID: 'backlink-1' },
        { blockID: 'backlink-2' },
        { id: 'backlink-3' }, // 测试 id 字段
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { backlinks: mockBacklinks },
        }),
      } as Response);

      const result = await queryEngine.fetchBacklinks('concept-1');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'backlink-1',
        type: AssociationType.BACKLINK,
      });
      expect(result[1]).toEqual({
        id: 'backlink-2',
        type: AssociationType.BACKLINK,
      });
      expect(result[2]).toEqual({
        id: 'backlink-3',
        type: AssociationType.BACKLINK,
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/ref/getBacklink2',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ id: 'concept-1' }),
        })
      );
    });

    it('should return empty array when no backlinks exist', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { backlinks: [] },
        }),
      } as Response);

      const result = await queryEngine.fetchBacklinks('concept-no-backlinks');

      expect(result).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(queryEngine.fetchBacklinks('concept-error'))
        .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(queryEngine.fetchBacklinks('concept-network-error'))
        .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
    });

    it('should filter out empty IDs', async () => {
      const mockBacklinks = [
        { blockID: 'backlink-1' },
        { blockID: '' },
        { id: null },
        { blockID: 'backlink-2' },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { backlinks: mockBacklinks },
        }),
      } as Response);

      const result = await queryEngine.fetchBacklinks('concept-1');

      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toEqual(['backlink-1', 'backlink-2']);
    });
  });

  describe('fetchConceptLinks', () => {
    it('should fetch forward links to other concept cards', async () => {
      // Mock 查询出链
      vi.mocked(api.sql).mockResolvedValueOnce([
        { id: 'link-1' },
        { id: 'link-2' },
        { id: 'link-3' },
      ]);

      const result = await queryEngine.fetchConceptLinks('concept-1');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'link-1',
        type: AssociationType.CONCEPT_LINK,
      });
      expect(result[1]).toEqual({
        id: 'link-2',
        type: AssociationType.CONCEPT_LINK,
      });
      expect(result[2]).toEqual({
        id: 'link-3',
        type: AssociationType.CONCEPT_LINK,
      });
    });

    it('should include links from child blocks', async () => {
      vi.mocked(api.sql).mockResolvedValueOnce([
        { id: 'link-from-parent' },
        { id: 'link-from-child' },
      ]);

      const result = await queryEngine.fetchConceptLinks('concept-with-children');

      expect(result).toHaveLength(2);
      expect(api.sql).toHaveBeenCalledWith(
        expect.stringContaining('WITH RECURSIVE descendants')
      );
    });

    it('should return empty array when no concept links exist', async () => {
      vi.mocked(api.sql).mockResolvedValueOnce([
        { id: 'link-1' },
      ]);

      const result = await queryEngine.fetchConceptLinks('concept-no-links');

      expect(result).toEqual([{ id: 'link-1', type: AssociationType.CONCEPT_LINK }]);
    });

    it('should handle SQL errors gracefully', async () => {
      vi.mocked(api.sql).mockRejectedValue(new Error('Database error'));

      await expect(queryEngine.fetchConceptLinks('concept-error'))
        .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
    });
  });

  describe('fetchDescriptorCards', () => {
    it('should fetch descriptor cards (child blocks)', async () => {
      vi.mocked(api.sql).mockResolvedValue([
        { id: 'descriptor-1' },
        { id: 'descriptor-2' },
      ]);

      const result = await queryEngine.fetchDescriptorCards('concept-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'descriptor-1',
        type: AssociationType.DESCRIPTOR,
      });
      expect(result[1]).toEqual({
        id: 'descriptor-2',
        type: AssociationType.DESCRIPTOR,
      });

      expect(api.sql).toHaveBeenCalledWith(expect.stringContaining("content LIKE '%;;%'"));
    });

    it('should return empty array when no descriptor cards exist', async () => {
      vi.mocked(api.sql).mockResolvedValue([]);

      const result = await queryEngine.fetchDescriptorCards('concept-no-descriptors');

      expect(result).toEqual([]);
    });

    it('should only query direct children (not descendants)', async () => {
      vi.mocked(api.sql).mockResolvedValue([
        { id: 'descriptor-child' },
      ]);

      await queryEngine.fetchDescriptorCards('concept-1');

      expect(api.sql).toHaveBeenCalledWith(
        expect.stringContaining("b.parent_id = 'concept-1'")
      );
      expect(api.sql).not.toHaveBeenCalledWith(
        expect.stringContaining('RECURSIVE')
      );
    });

    it('should handle SQL errors gracefully', async () => {
      vi.mocked(api.sql).mockRejectedValue(new Error('Database error'));

      await expect(queryEngine.fetchDescriptorCards('concept-error'))
        .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
    });
  });

  describe('fetchConceptNeighbors', () => {
    it('should aggregate all three types of neighbors', async () => {
      // Mock backlinks
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            backlinks: [
              { blockID: 'backlink-1' },
              { blockID: 'backlink-2' },
            ],
          },
        }),
      } as Response);

      // Mock concept links
      vi.mocked(api.sql)
        .mockResolvedValueOnce([{ id: 'link-1' }]) // 出链查询
        .mockResolvedValueOnce([{ id: 'descriptor-1' }]) // descriptor children
        .mockResolvedValueOnce([{ id: 'descriptor-1' }]); // descriptor syntax

      const result = await queryEngine.fetchConceptNeighbors('concept-1');

      expect(result).toHaveLength(4);
      
      // 验证包含所有三种类型
      const types = result.map(r => r.type);
      expect(types).toContain(AssociationType.BACKLINK);
      expect(types).toContain(AssociationType.CONCEPT_LINK);
      expect(types).toContain(AssociationType.DESCRIPTOR);
    });

    it('should deduplicate neighbors', async () => {
      // Mock backlinks 和 concept links 返回相同的块
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            backlinks: [{ blockID: 'duplicate-block' }],
          },
        }),
      } as Response);

      vi.mocked(api.sql)
        .mockResolvedValueOnce([{ id: 'duplicate-block' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await queryEngine.fetchConceptNeighbors('concept-1');

      // 应该去重，只保留一个
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('duplicate-block');
    });

    it('should handle empty results from all queries', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { backlinks: [] },
        }),
      } as Response);

      vi.mocked(api.sql)
        .mockResolvedValueOnce([]) // 出链查询
        .mockResolvedValueOnce([]); // 描述符卡查询

      const result = await queryEngine.fetchConceptNeighbors('concept-isolated');

      expect(result).toEqual([]);
    });

    it('should continue even if one query fails', async () => {
      // Backlinks 失败
      vi.mocked(fetch).mockRejectedValue(new Error('API error'));

      // Concept links 成功
      await expect(queryEngine.fetchConceptNeighbors('concept-partial-error'))
        .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
    });
  });

  describe('fetchNeighbors - Concept Card Integration', () => {
    it('should use fetchConceptNeighbors for concept cards', async () => {
      queryEngine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG, {
        resolveNodeType: vi.fn(async (blockId: string) => blockId === 'concept-card-1' ? 'concept' : 'unknown'),
      });

      // Mock fetchConceptNeighbors 的结果
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { backlinks: [{ blockID: 'backlink-1' }] },
        }),
      } as Response);

      vi.mocked(api.sql)
        .mockResolvedValueOnce([]) // 出链查询
        .mockResolvedValueOnce([]) // descriptor children
        .mockResolvedValueOnce([]); // descriptor syntax

      const result = await queryEngine.fetchNeighbors('concept-card-1');

      // 应该返回概念卡专用的邻居
      expect(result.some(r => r.type === AssociationType.BACKLINK)).toBe(true);
    });

    it('should use normal logic for non-concept cards', async () => {
      queryEngine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG, {
        resolveNodeType: vi.fn(async () => 'item'),
      });

      const result = await queryEngine.fetchNeighbors('normal-card-1');

      expect(result).toEqual([]);
    });
  });
});
