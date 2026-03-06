import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiyuanNeuralRoamCardTypeResolverAdapter } from '../SiyuanNeuralRoamCardTypeResolverAdapter';
import { sql } from '@/infrastructure/siyuan/api';

vi.mock('@/infrastructure/siyuan/api', () => ({
  sql: vi.fn(),
}));

describe('SiyuanNeuralRoamCardTypeResolverAdapter', () => {
  const adapter = new SiyuanNeuralRoamCardTypeResolverAdapter();
  const mockedSql = vi.mocked(sql);

  beforeEach(() => {
    mockedSql.mockReset();
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
});
