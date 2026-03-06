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

  it('returns false when fsrs query fails', async () => {
    vi.mocked(api.sql).mockRejectedValueOnce(new Error('near "LIMIT": syntax error'));

    const result = await engine.isConceptCard('concept-2');

    expect(result).toBe(false);
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

    await engine.isConceptCard('concept-3');

    const [stmt] = vi.mocked(api.sql).mock.calls[0] as [string];
    expect(stmt).toContain('COUNT(1) AS concept_count');
    expect(stmt).not.toContain('LIMIT');
  });
});
