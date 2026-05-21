import { describe, expect, it, vi } from 'vitest';
import * as api from '@/core/siyuan/api';
import { SiyuanNeuralRoamGraphQueryAdapter } from '../SiyuanNeuralRoamGraphQueryAdapter';

vi.mock('@/core/siyuan/api', () => ({
  sql: vi.fn(),
}));

describe('SiyuanNeuralRoamGraphQueryAdapter', () => {
  it('passes injected node type resolver into graph query engine', async () => {
    const resolveNodeType = vi.fn(async () => 'concept' as const);
    const adapter = new SiyuanNeuralRoamGraphQueryAdapter({
      nodeTypeResolver: { resolveNodeType },
    });
    vi.mocked(api.sql).mockRejectedValue(new Error('Siyuan API Error: no such table: fsrs_cards'));

    const result = await adapter.query<boolean>({
      operation: 'isConceptCard',
      blockId: 'concept-1',
    });

    expect(result).toMatchObject({
      status: 'found',
      blockId: 'concept-1',
      data: true,
    });
    expect(resolveNodeType).toHaveBeenCalledWith('concept-1');
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('uses injected card facts for priority without legacy fsrs_cards SQL', async () => {
    const resolvePriority = vi.fn(async () => 0.86);
    const adapter = new SiyuanNeuralRoamGraphQueryAdapter({
      cardFacts: {
        resolveNodeType: vi.fn(async () => 'unknown'),
        resolvePriority,
      },
    });
    vi.mocked(api.sql).mockRejectedValue(new Error('Siyuan API Error: no such table: fsrs_cards'));

    const result = await adapter.query<number | null>({
      operation: 'fetchNodePriority',
      blockId: 'concept-1',
    });

    expect(result).toMatchObject({
      status: 'found',
      blockId: 'concept-1',
      data: 0.86,
    });
    expect(resolvePriority).toHaveBeenCalledWith('concept-1');
    expect(api.sql).not.toHaveBeenCalled();
  });
});
