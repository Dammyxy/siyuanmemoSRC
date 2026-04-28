import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiyuanNeuralRoamCardTypeResolverAdapter } from '../SiyuanNeuralRoamCardTypeResolverAdapter';
import { sql } from '@/infrastructure/siyuan/api';

vi.mock('@/infrastructure/siyuan/api', () => ({
  sql: vi.fn(),
}));

describe('SiyuanNeuralRoamCardTypeResolverAdapter', () => {
  let adapter: SiyuanNeuralRoamCardTypeResolverAdapter;
  const mockedSql = vi.mocked(sql);

  beforeEach(() => {
    adapter = new SiyuanNeuralRoamCardTypeResolverAdapter();
    mockedSql.mockReset();
  });

  it('does not use LIMIT in the compatibility fsrs query', async () => {
    mockedSql.mockResolvedValue([{ type: 'item', card_type_marker: 'descriptor' }]);

    await expect(adapter.resolveCardType('block-limit')).resolves.toBe('item');

    expect(mockedSql).toHaveBeenCalledTimes(1);
    expect(mockedSql.mock.calls[0]?.[0]).not.toContain('LIMIT');
  });

  it('returns topic when no fsrs rows are found', async () => {
    mockedSql.mockResolvedValue([]);
    await expect(adapter.resolveCardType('block-1')).resolves.toBe('topic');
  });

  it('returns item when fsrs rows are non-topic', async () => {
    mockedSql.mockResolvedValue([{ type: 'item', card_type_marker: 'descriptor' }]);
    await expect(adapter.resolveCardType('block-2')).resolves.toBe('item');
  });

  it('returns topic when fsrs row indicates concept/topic marker', async () => {
    mockedSql.mockResolvedValue([{ type: 'item', card_type_marker: 'concept' }]);
    await expect(adapter.resolveCardType('block-3')).resolves.toBe('topic');
  });

  it('returns topic when fsrs query fails', async () => {
    mockedSql.mockRejectedValueOnce(new Error('no such table: fsrs_cards'));
    await expect(adapter.resolveCardType('block-4')).resolves.toBe('topic');
  });

  it('skips repeated fsrs queries after the compatibility table is unavailable', async () => {
    const localAdapter = new SiyuanNeuralRoamCardTypeResolverAdapter();
    mockedSql.mockRejectedValueOnce(new Error('Siyuan API Error: near "LIMIT": syntax error'));

    await expect(localAdapter.resolveCardType('block-5')).resolves.toBe('topic');
    await expect(localAdapter.resolveCardType('block-6')).resolves.toBe('topic');

    expect(mockedSql).toHaveBeenCalledTimes(1);
  });
});
