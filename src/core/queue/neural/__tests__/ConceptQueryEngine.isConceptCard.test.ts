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

  it('returns true when block attribute marks concept', async () => {
    vi.mocked(api.sql).mockResolvedValueOnce([{ card_type: 'concept' }] as any);

    const result = await engine.isConceptCard('concept-1');

    expect(result).toBe(true);
    expect(api.sql).toHaveBeenCalledTimes(1);
  });

  it('returns false when attribute is missing and fsrs fallback query fails', async () => {
    vi.mocked(api.sql)
      .mockResolvedValueOnce([] as any)
      .mockRejectedValueOnce(new Error('near "LIMIT": syntax error'));

    const result = await engine.isConceptCard('block-1');

    expect(result).toBe(false);
    expect(api.sql).toHaveBeenCalledTimes(2);
  });

  it('returns true when attribute is missing but fsrs fallback has concept row', async () => {
    vi.mocked(api.sql)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([{ block_id: 'concept-2' }] as any);

    const result = await engine.isConceptCard('concept-2');

    expect(result).toBe(true);
    expect(api.sql).toHaveBeenCalledTimes(2);
    const fallbackStmt = vi.mocked(api.sql).mock.calls[1]?.[0] as string;
    expect(fallbackStmt).not.toContain('LIMIT 1');
    expect(fallbackStmt).toContain('FROM fsrs_cards');
  });
});

