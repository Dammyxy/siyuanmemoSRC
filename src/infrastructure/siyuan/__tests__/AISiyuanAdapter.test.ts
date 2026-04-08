import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AISiyuanAdapter } from '../AISiyuanAdapter';

const appendBlockMock = vi.fn();
const copyStdMarkdownMock = vi.fn();
const createDailyNoteMock = vi.fn();
const createDocWithMdMock = vi.fn();
const deleteBlockMock = vi.fn();
const getNotebookConfMock = vi.fn();
const insertBlockMock = vi.fn();
const renderSprigMock = vi.fn();
const setBlockAttrsMock = vi.fn();
const sqlMock = vi.fn();
const updateBlockMock = vi.fn();

vi.mock('../api', () => ({
  appendBlock: (...args: unknown[]) => appendBlockMock(...args),
  copyStdMarkdown: (...args: unknown[]) => copyStdMarkdownMock(...args),
  createDailyNote: (...args: unknown[]) => createDailyNoteMock(...args),
  createDocWithMd: (...args: unknown[]) => createDocWithMdMock(...args),
  deleteBlock: (...args: unknown[]) => deleteBlockMock(...args),
  getNotebookConf: (...args: unknown[]) => getNotebookConfMock(...args),
  insertBlock: (...args: unknown[]) => insertBlockMock(...args),
  renderSprig: (...args: unknown[]) => renderSprigMock(...args),
  setBlockAttrs: (...args: unknown[]) => setBlockAttrsMock(...args),
  sql: (...args: unknown[]) => sqlMock(...args),
  updateBlock: (...args: unknown[]) => updateBlockMock(...args),
}));

describe('AISiyuanAdapter', () => {
  beforeEach(() => {
    appendBlockMock.mockReset();
    copyStdMarkdownMock.mockReset();
    createDailyNoteMock.mockReset();
    createDocWithMdMock.mockReset();
    deleteBlockMock.mockReset();
    getNotebookConfMock.mockReset();
    insertBlockMock.mockReset();
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
});
