import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewSiyuanAdapter } from '../ReviewSiyuanAdapter';

const getBlockAttrsMock = vi.fn();
const getBlockBreadcrumbMock = vi.fn();
const getBlockDOMMock = vi.fn();
const getBlockInfoMock = vi.fn();
const getBlockKramdownMock = vi.fn();
const getIconByTypeMock = vi.fn();
const pushErrMsgMock = vi.fn();
const pushMsgMock = vi.fn();
const reviewRiffCardMock = vi.fn();
const setBlockAttrsMock = vi.fn();
const skipReviewRiffCardMock = vi.fn();
const sqlMock = vi.fn();
const updateBlockMock = vi.fn();

vi.mock('../api', () => ({
  getBlockAttrs: (...args: unknown[]) => getBlockAttrsMock(...args),
  getBlockBreadcrumb: (...args: unknown[]) => getBlockBreadcrumbMock(...args),
  getBlockDOM: (...args: unknown[]) => getBlockDOMMock(...args),
  getBlockInfo: (...args: unknown[]) => getBlockInfoMock(...args),
  getBlockKramdown: (...args: unknown[]) => getBlockKramdownMock(...args),
  getIconByType: (...args: unknown[]) => getIconByTypeMock(...args),
  pushErrMsg: (...args: unknown[]) => pushErrMsgMock(...args),
  pushMsg: (...args: unknown[]) => pushMsgMock(...args),
  setBlockAttrs: (...args: unknown[]) => setBlockAttrsMock(...args),
  sql: (...args: unknown[]) => sqlMock(...args),
  updateBlock: (...args: unknown[]) => updateBlockMock(...args),
}));

vi.mock('@/core/siyuan/riff', () => ({
  BUILTIN_DECK_ID: 'builtin',
  reviewRiffCard: (...args: unknown[]) => reviewRiffCardMock(...args),
  skipReviewRiffCard: (...args: unknown[]) => skipReviewRiffCardMock(...args),
}));

describe('ReviewSiyuanAdapter', () => {
  beforeEach(() => {
    getBlockAttrsMock.mockReset();
    getBlockBreadcrumbMock.mockReset();
    getBlockDOMMock.mockReset();
    getBlockInfoMock.mockReset();
    getBlockKramdownMock.mockReset();
    getIconByTypeMock.mockReset();
    pushErrMsgMock.mockReset();
    pushMsgMock.mockReset();
    reviewRiffCardMock.mockReset();
    setBlockAttrsMock.mockReset();
    skipReviewRiffCardMock.mockReset();
    sqlMock.mockReset();
    updateBlockMock.mockReset();
  });

  it('loads editable block markdown from the blocks table instead of kramdown', async () => {
    sqlMock.mockResolvedValue([{ markdown: 'Question **body**' }]);
    getBlockKramdownMock.mockResolvedValue({ kramdown: 'Question **body**\n{: id="block-1"}' });
    const adapter = new ReviewSiyuanAdapter();

    await expect(adapter.getEditableBlockMarkdown("block-'1")).resolves.toBe('Question **body**');

    expect(sqlMock).toHaveBeenCalledWith(expect.stringContaining("SELECT markdown"));
    expect(sqlMock).toHaveBeenCalledWith(expect.stringContaining("FROM blocks"));
    expect(sqlMock).toHaveBeenCalledWith(expect.stringContaining("WHERE id = 'block-''1'"));
    expect(getBlockKramdownMock).not.toHaveBeenCalled();
  });

  it('fails explicitly when editable block markdown is unavailable', async () => {
    sqlMock.mockResolvedValue([]);
    const adapter = new ReviewSiyuanAdapter();

    await expect(adapter.getEditableBlockMarkdown('missing-block')).rejects.toThrow(
      'Editable block markdown unavailable: missing-block',
    );
  });
});
