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

  it('returns topic when no card attributes are found', async () => {
    mockedSql.mockResolvedValue([]);
    await expect(adapter.resolveCardType('block-1')).resolves.toBe('topic');
  });

  it('returns item when custom-fsrs-card-type indicates item/descriptor/cloze', async () => {
    mockedSql.mockResolvedValue([{ name: 'custom-fsrs-card-type', value: 'descriptor' }]);
    await expect(adapter.resolveCardType('block-2')).resolves.toBe('item');
  });

  it('returns topic when custom-fsrs-card-type indicates concept/topic', async () => {
    mockedSql.mockResolvedValue([{ name: 'custom-fsrs-card-type', value: 'concept' }]);
    await expect(adapter.resolveCardType('block-3')).resolves.toBe('topic');
  });

  it('returns item when any supported card-id attribute exists', async () => {
    mockedSql.mockResolvedValue([
      { name: 'custom-fsrs-card-id', value: 'cid-1' },
      { name: 'custom-xiuyuan-id', value: '' },
      { name: 'custom-fsrs-xiuyuan-id', value: '' },
    ]);
    await expect(adapter.resolveCardType('block-4')).resolves.toBe('item');
  });
});

