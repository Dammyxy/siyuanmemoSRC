import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerSiyuanAdapter } from '../ManagerSiyuanAdapter';

const getBlockAttrsMock = vi.fn();

vi.mock('../api', () => ({
  getBlockAttrs: (...args: unknown[]) => getBlockAttrsMock(...args),
  getBlockKramdown: vi.fn(),
  pushErrMsg: vi.fn(),
  pushMsg: vi.fn(),
  setBlockAttrs: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/core/siyuan/riff', () => ({
  addRiffCards: vi.fn(),
  BUILTIN_DECK_ID: 'builtin-deck',
}));

vi.mock('@/core/siyuan/block', () => ({
  ATTR_CARD_ID: 'custom-fsrs-card-id',
  getCardBlockIds: vi.fn(),
  getBlockText: vi.fn(),
  markBlockAsCard: vi.fn(),
}));

describe('ManagerSiyuanAdapter', () => {
  beforeEach(() => {
    getBlockAttrsMock.mockReset();
  });

  it('delegates getBlockAttrs to siyuan api', async () => {
    getBlockAttrsMock.mockResolvedValue({ foo: 'bar' });
    const adapter = new ManagerSiyuanAdapter();

    await expect(adapter.getBlockAttrs('block-1')).resolves.toEqual({ foo: 'bar' });
    expect(getBlockAttrsMock).toHaveBeenCalledWith('block-1');
  });
});
