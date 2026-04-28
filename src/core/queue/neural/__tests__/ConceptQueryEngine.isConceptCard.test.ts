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

  it('returns true when fsrs row marks concept', async () => {
    vi.mocked(api.sql).mockResolvedValueOnce([{ concept_count: 1 }] as any);

    const result = await engine.isConceptCard('concept-1');

    expect(result).toBe(true);
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('returns false when fsrs does not have concept row', async () => {
    vi.mocked(api.sql).mockResolvedValueOnce([{ concept_count: 0 }] as any);

    const result = await engine.isConceptCard('block-1');

    expect(result).toBe(false);
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('uses injected node type resolver before fsrs SQL for concepts', async () => {
    const resolveNodeType = vi.fn(async () => 'concept' as const);
    engine = new ConceptQueryEngine({
      nodeTypeResolver: { resolveNodeType },
    });

    const result = await engine.isConceptCard('concept-2');

    expect(result).toBe(true);
    expect(resolveNodeType).toHaveBeenCalledWith('concept-2');
    expect(api.sql).not.toHaveBeenCalled();
  });

  it.each(['item', 'topic', 'descriptor'] as const)('uses injected node type resolver before fsrs SQL for %s nodes', async (nodeType) => {
    const resolveNodeType = vi.fn(async () => nodeType);
    engine = new ConceptQueryEngine({
      nodeTypeResolver: { resolveNodeType },
    });

    const result = await engine.isConceptCard(`${nodeType}-1`);

    expect(result).toBe(false);
    expect(resolveNodeType).toHaveBeenCalledWith(`${nodeType}-1`);
    expect(api.sql).not.toHaveBeenCalled();
  });

  it('falls back to fsrs SQL when injected node type resolver returns unknown', async () => {
    const resolveNodeType = vi.fn(async () => 'unknown' as const);
    engine = new ConceptQueryEngine({
      nodeTypeResolver: { resolveNodeType },
    });
    vi.mocked(api.sql).mockResolvedValueOnce([{ concept_count: 1 }] as any);

    const result = await engine.isConceptCard('concept-3');

    expect(result).toBe(true);
    expect(resolveNodeType).toHaveBeenCalledWith('concept-3');
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('caches unsupported fsrs SQL errors and skips repeated SQL checks', async () => {
    vi.mocked(api.sql).mockRejectedValue(new Error('near "LIMIT": syntax error'));

    const first = await engine.isConceptCard('concept-4');
    const second = await engine.isConceptCard('concept-5');

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('caches missing fsrs_cards table and skips repeated SQL checks', async () => {
    vi.mocked(api.sql).mockRejectedValueOnce(new Error('Siyuan API Error: no such table: fsrs_cards'));

    const first = await engine.isConceptCard('concept-a');
    const second = await engine.isConceptCard('concept-b');

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('does not use LIMIT in concept check SQL', async () => {
    vi.mocked(api.sql).mockResolvedValueOnce([{ concept_count: 1 }] as any);

    await engine.isConceptCard('concept-6');

    const [stmt] = vi.mocked(api.sql).mock.calls[0] as [string];
    expect(stmt).toContain('COUNT(1) AS concept_count');
    expect(stmt).not.toContain('LIMIT');
  });
});
