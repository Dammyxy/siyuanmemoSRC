import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../siyuan/api';
import { ConceptQueryEngine } from '../ConceptQueryEngine';

vi.mock('../../../siyuan/api', () => ({
  sql: vi.fn(),
}));

describe('ConceptQueryEngine.isConceptCard', () => {
  let engine: ConceptQueryEngine;

  beforeEach(() => {
    engine = new ConceptQueryEngine();
    vi.clearAllMocks();
  });

  it('returns true when SQL card facts mark concept', async () => {
    const resolveNodeType = vi.fn(async () => 'concept' as const);
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType },
    });

    const result = await engine.isConceptCard('concept-1');

    expect(result).toBe(true);
    expect(resolveNodeType).toHaveBeenCalledWith('concept-1');
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('returns false when SQL card facts mark non-concept row', async () => {
    const resolveNodeType = vi.fn(async () => 'item' as const);
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType },
    });

    const result = await engine.isConceptCard('block-1');

    expect(result).toBe(false);
    expect(resolveNodeType).toHaveBeenCalledWith('block-1');
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('uses SQL card facts before injected node type resolver for concepts', async () => {
    const resolveCardFactNodeType = vi.fn(async () => 'concept' as const);
    const resolveNodeType = vi.fn(async () => 'concept' as const);
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType: resolveCardFactNodeType },
      nodeTypeResolver: { resolveNodeType },
    });

    const result = await engine.isConceptCard('concept-2');

    expect(result).toBe(true);
    expect(resolveCardFactNodeType).toHaveBeenCalledWith('concept-2');
    expect(resolveNodeType).not.toHaveBeenCalled();
    expect(api.sql).not.toHaveBeenCalled();
  });

  it.each(['item', 'topic', 'descriptor'] as const)('uses SQL card facts before legacy SQL for %s nodes', async (nodeType) => {
    const resolveNodeType = vi.fn(async () => nodeType);
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType },
    });

    const result = await engine.isConceptCard(`${nodeType}-1`);

    expect(result).toBe(false);
    expect(resolveNodeType).toHaveBeenCalledWith(`${nodeType}-1`);
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('falls back to injected resolver when SQL card facts return unknown', async () => {
    const resolveCardFactNodeType = vi.fn(async () => 'unknown' as const);
    const resolveNodeType = vi.fn(async () => 'unknown' as const);
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType: resolveCardFactNodeType },
      nodeTypeResolver: { resolveNodeType },
    });

    const result = await engine.isConceptCard('concept-3');

    expect(result).toBe(false);
    expect(resolveCardFactNodeType).toHaveBeenCalledWith('concept-3');
    expect(resolveNodeType).toHaveBeenCalledWith('concept-3');
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('surfaces SQL card fact resolver errors without probing fsrs_cards', async () => {
    const resolveNodeType = vi.fn(async () => {
      throw new Error('sql card universe unavailable');
    });
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType },
    });

    await expect(engine.isConceptCard('concept-4')).rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');

    expect(resolveNodeType).toHaveBeenCalledWith('concept-4');
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('does not use legacy fsrs_cards when SQL card facts are missing', async () => {
    const resolveCardFactNodeType = vi.fn(async () => 'unknown' as const);
    engine = new ConceptQueryEngine({
      cardFacts: { resolveNodeType: resolveCardFactNodeType },
    });
    vi.mocked(api.sql).mockResolvedValueOnce([]);
    const resolveInternalNodeType = (engine as unknown as {
      resolveNodeType(blockId: string): Promise<unknown>;
    }).resolveNodeType.bind(engine);

    const result = await resolveInternalNodeType('local-node-1');

    expect(result).toBe('unknown');
    expect(resolveCardFactNodeType).toHaveBeenCalledWith('local-node-1');
    expect(api.sql).toHaveBeenCalledWith(expect.stringContaining('FROM blocks'));
    for (const [stmt] of vi.mocked(api.sql).mock.calls) {
      expect(String(stmt)).not.toContain('FROM fsrs_cards');
    }
  });

  it('resolves node priority from SQL card facts without fsrs_cards', async () => {
    const resolvePriority = vi.fn(async () => 0.72);
    engine = new ConceptQueryEngine({
      cardFacts: {
        resolveNodeType: vi.fn(async () => 'unknown'),
        resolvePriority,
      },
    });

    const result = await engine.fetchNodePriority('concept-6');

    expect(result).toBe(0.72);
    expect(resolvePriority).toHaveBeenCalledWith('concept-6');
    expect(api.sql).not.toHaveBeenCalled();
  });
});
