import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AISiyuanAdapter } from '../AISiyuanAdapter';

const appendBlockMock = vi.fn();
const appendBlockDetailedMock = vi.fn();
const copyStdMarkdownMock = vi.fn();
const createDailyNoteMock = vi.fn();
const createDocWithMdMock = vi.fn();
const deleteBlockMock = vi.fn();
const getBlockKramdownMock = vi.fn();
const getNotebookConfMock = vi.fn();
const insertBlockMock = vi.fn();
const insertBlockDetailedMock = vi.fn();
const listNotebooksMock = vi.fn();
const renderSprigMock = vi.fn();
const setBlockAttrsMock = vi.fn();
const sqlMock = vi.fn();
const updateBlockMock = vi.fn();

vi.mock('../api', () => ({
  appendBlock: (...args: unknown[]) => appendBlockMock(...args),
  appendBlockDetailed: (...args: unknown[]) => appendBlockDetailedMock(...args),
  copyStdMarkdown: (...args: unknown[]) => copyStdMarkdownMock(...args),
  createDailyNote: (...args: unknown[]) => createDailyNoteMock(...args),
  createDocWithMd: (...args: unknown[]) => createDocWithMdMock(...args),
  deleteBlock: (...args: unknown[]) => deleteBlockMock(...args),
  getBlockKramdown: (...args: unknown[]) => getBlockKramdownMock(...args),
  getNotebookConf: (...args: unknown[]) => getNotebookConfMock(...args),
  insertBlock: (...args: unknown[]) => insertBlockMock(...args),
  insertBlockDetailed: (...args: unknown[]) => insertBlockDetailedMock(...args),
  listNotebooks: (...args: unknown[]) => listNotebooksMock(...args),
  renderSprig: (...args: unknown[]) => renderSprigMock(...args),
  setBlockAttrs: (...args: unknown[]) => setBlockAttrsMock(...args),
  sql: (...args: unknown[]) => sqlMock(...args),
  updateBlock: (...args: unknown[]) => updateBlockMock(...args),
}));

describe('AISiyuanAdapter', () => {
  beforeEach(() => {
    appendBlockMock.mockReset();
    appendBlockDetailedMock.mockReset();
    copyStdMarkdownMock.mockReset();
    createDailyNoteMock.mockReset();
    createDocWithMdMock.mockReset();
    deleteBlockMock.mockReset();
    getBlockKramdownMock.mockReset();
    getNotebookConfMock.mockReset();
    insertBlockMock.mockReset();
    insertBlockDetailedMock.mockReset();
    listNotebooksMock.mockReset();
    renderSprigMock.mockReset();
    setBlockAttrsMock.mockReset();
    sqlMock.mockReset();
    updateBlockMock.mockReset();
  });

  it('delegates copyStdMarkdown to siyuan api', async () => {
    copyStdMarkdownMock.mockResolvedValue('# Doc body');
    const adapter = new AISiyuanAdapter();

    await expect(adapter.copyStdMarkdown('doc-1')).resolves.toBe('# Doc body');
    expect(copyStdMarkdownMock).toHaveBeenCalledWith('doc-1');
  });

  it('delegates listNotebooks to siyuan api', async () => {
    listNotebooksMock.mockResolvedValue([{ id: 'box-1', name: 'Box 1', icon: '', closed: false }]);
    const adapter = new AISiyuanAdapter();

    await expect(adapter.listNotebooks()).resolves.toEqual([{ id: 'box-1', name: 'Box 1', icon: '', closed: false }]);
  });

  it('delegates getBlockKramdown to siyuan api', async () => {
    getBlockKramdownMock.mockResolvedValue({ kramdown: '* {: id="item-1"}Question' });
    const adapter = new AISiyuanAdapter();

    await expect(adapter.getBlockKramdown('item-1')).resolves.toEqual({ kramdown: '* {: id="item-1"}Question' });
    expect(getBlockKramdownMock).toHaveBeenCalledWith('item-1');
  });

  it('reuses today daily note when the native custom-dailynote attr already exists', async () => {
    sqlMock.mockResolvedValue([{ id: 'daily-doc-1' }]);
    const adapter = new AISiyuanAdapter({ appId: 'app-1' });

    await expect(adapter.ensureTodayDailyNote('box-1')).resolves.toBe('daily-doc-1');
    expect(createDailyNoteMock).not.toHaveBeenCalled();
  });

  it('creates today daily note through the native API when no current daily note exists', async () => {
    sqlMock.mockResolvedValue([]);
    createDailyNoteMock.mockResolvedValue({ id: 'daily-doc-2' });
    const adapter = new AISiyuanAdapter({ appId: 'app-1' });

    await expect(adapter.ensureTodayDailyNote('box-1')).resolves.toBe('daily-doc-2');
    expect(createDailyNoteMock).toHaveBeenCalledWith('box-1', 'app-1');
  });

  it('delegates update and delete block mutations to siyuan api', async () => {
    updateBlockMock.mockResolvedValue('block-1');
    deleteBlockMock.mockResolvedValue(undefined);
    const adapter = new AISiyuanAdapter();

    await expect(adapter.updateBlockMarkdown('block-1', 'Updated body')).resolves.toBe('block-1');
    await expect(adapter.deleteBlock('block-1')).resolves.toBeUndefined();

    expect(updateBlockMock).toHaveBeenCalledWith({
      dataType: 'markdown',
      data: 'Updated body',
      id: 'block-1',
    });
    expect(deleteBlockMock).toHaveBeenCalledWith('block-1');
  });

  it('delegates detailed insert and append mutations to siyuan api', async () => {
    insertBlockDetailedMock.mockResolvedValue({ doOperations: [{ id: 'inserted-item-1', previousID: 'prev-1' }] });
    appendBlockDetailedMock.mockResolvedValue({ doOperations: [{ id: 'appended-item-1', parentID: 'parent-1' }] });
    const adapter = new AISiyuanAdapter();

    await expect(adapter.insertBlockAfterDetailed('* Question', 'prev-1')).resolves.toEqual({
      doOperations: [{ id: 'inserted-item-1', previousID: 'prev-1' }],
    });
    await expect(adapter.appendBlockUnderParentDetailed('* Answer', 'parent-1')).resolves.toEqual({
      doOperations: [{ id: 'appended-item-1', parentID: 'parent-1' }],
    });

    expect(insertBlockDetailedMock).toHaveBeenCalledWith({
      dataType: 'markdown',
      data: '* Question',
      previousID: 'prev-1',
    });
    expect(appendBlockDetailedMock).toHaveBeenCalledWith({
      dataType: 'markdown',
      data: '* Answer',
      parentID: 'parent-1',
    });
  });
});
