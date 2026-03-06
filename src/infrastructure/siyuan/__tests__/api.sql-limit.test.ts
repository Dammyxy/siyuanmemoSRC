import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from '../api';

const fetchMock = vi.fn();

function mockSqlResponse(data: unknown = []): void {
  fetchMock.mockResolvedValue({
    json: async () => ({
      code: 0,
      data,
    }),
  } as Response);
}

function getSubmittedSqlStmt(): string {
  const call = fetchMock.mock.calls.at(-1);
  expect(call).toBeDefined();
  const requestInit = call?.[1] as RequestInit;
  const body = JSON.parse(String(requestInit?.body || '{}')) as { stmt?: string };
  return String(body.stmt || '');
}

describe('siyuan api sql() limit normalization', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends default LIMIT for SELECT without limit', async () => {
    mockSqlResponse([]);

    await sql('SELECT id FROM blocks');

    expect(getSubmittedSqlStmt()).toBe('SELECT id FROM blocks LIMIT 100000');
  });

  it('appends default LIMIT for WITH query without limit', async () => {
    mockSqlResponse([]);

    await sql(`
      WITH RECURSIVE sample AS (
        SELECT id FROM blocks
      )
      SELECT id FROM sample
    `);

    expect(getSubmittedSqlStmt()).toContain('LIMIT 100000');
  });

  it('keeps existing LIMIT unchanged', async () => {
    mockSqlResponse([]);

    await sql('SELECT id FROM blocks LIMIT 10');

    expect(getSubmittedSqlStmt()).toBe('SELECT id FROM blocks LIMIT 10');
  });

  it('removes trailing semicolon before applying LIMIT', async () => {
    mockSqlResponse([]);

    await sql('SELECT id FROM blocks;   ');

    expect(getSubmittedSqlStmt()).toBe('SELECT id FROM blocks LIMIT 100000');
  });

  it('does not append LIMIT for non-select statements', async () => {
    mockSqlResponse([]);

    await sql('PRAGMA table_info(blocks);');

    expect(getSubmittedSqlStmt()).toBe('PRAGMA table_info(blocks)');
  });
});

