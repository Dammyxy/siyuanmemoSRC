import { describe, expect, it, vi } from 'vitest';
import { ConfiguredCaptureStorageService } from '@/application/services/ConfiguredCaptureStorageService';
import type { ConfiguredCaptureStoragePort } from '@/application/ports/ConfiguredCaptureStoragePort';

function createPort(overrides: Partial<ConfiguredCaptureStoragePort> = {}): ConfiguredCaptureStoragePort {
  return {
    listNotebooks: vi.fn(async () => []),
    sql: vi.fn(async () => []),
    getDocInfo: vi.fn(async (docId: string) => ({
      id: docId,
      box: 'box-1',
      path: `/${docId}.sy`,
      hpath: `/${docId}`,
      name: docId,
    })),
    createDocWithMarkdown: vi.fn(async () => 'created-doc-1'),
    ensureTodayDailyNote: vi.fn(async () => 'daily-doc-1'),
    ...overrides,
  };
}

describe('ConfiguredCaptureStorageService', () => {
  it('lists only open notebooks sorted by name', async () => {
    const service = new ConfiguredCaptureStorageService(createPort({
      listNotebooks: vi.fn(async () => [
        { id: 'b', name: 'Beta', closed: false },
        { id: 'c', name: 'Closed', closed: true },
        { id: 'a', name: 'Alpha', closed: false },
      ]),
    }));

    await expect(service.listOpenNotebooks()).resolves.toEqual([
      { id: 'a', name: 'Alpha', closed: false },
      { id: 'b', name: 'Beta', closed: false },
    ]);
  });

  it('creates or reuses the feature root doc when library mode has no explicit target block', async () => {
    const sql = vi.fn(async (stmt: string) => {
      if (stmt.includes("hpath = '/SiYuanMemo 摘录库'")) {
        return [];
      }
      return [];
    });
    const getDocInfo = vi.fn(async () => ({
      id: 'created-doc-1',
      box: 'box-1',
      path: '/SiYuanMemo 摘录库.sy',
      hpath: '/SiYuanMemo 摘录库',
      name: 'SiYuanMemo 摘录库',
    }));
    const createDocWithMarkdown = vi.fn(async () => 'created-doc-1');
    const service = new ConfiguredCaptureStorageService(createPort({
      sql,
      getDocInfo,
      createDocWithMarkdown,
    }));

    const target = await service.resolveLibraryTarget({
      mode: 'library',
      notebookId: 'box-1',
      targetBlockId: '',
    }, {
      feature: 'progressive-excerpt',
      allowNonDocTarget: false,
    });

    expect(createDocWithMarkdown).toHaveBeenCalledWith('box-1', '/SiYuanMemo 摘录库', '# SiYuanMemo 摘录库');
    expect(target).toEqual({
      notebookId: 'box-1',
      containerDocId: 'created-doc-1',
      parentBlockId: 'created-doc-1',
      parentDoc: {
        id: 'created-doc-1',
        box: 'box-1',
        path: '/SiYuanMemo 摘录库.sy',
        hpath: '/SiYuanMemo 摘录库',
        name: 'SiYuanMemo 摘录库',
      },
      targetKind: 'root-doc',
    });
  });

  it('rejects non-document excerpt targets when the feature only supports document roots', async () => {
    const sql = vi.fn(async () => [{
      id: 'paragraph-1',
      box: 'box-1',
      root_id: 'doc-1',
      type: 'p',
      path: '/doc-1.sy',
      hpath: '/doc-1',
      content: 'Paragraph',
    }]);
    const service = new ConfiguredCaptureStorageService(createPort({ sql }));

    await expect(service.resolveLibraryTarget({
      mode: 'library',
      notebookId: 'box-1',
      targetBlockId: 'paragraph-1',
    }, {
      feature: 'progressive-excerpt',
      allowNonDocTarget: false,
    })).rejects.toThrow('当前配置只支持把内容存放到目标文档块下');
  });

  it('resolves daily-note mode through native today-daily-note lookup', async () => {
    const ensureTodayDailyNote = vi.fn(async () => 'daily-doc-42');
    const service = new ConfiguredCaptureStorageService(createPort({
      ensureTodayDailyNote,
    }));

    const target = await service.resolveDailyNoteTarget({
      mode: 'daily-note',
      notebookId: 'box-42',
      targetBlockId: '',
    });

    expect(ensureTodayDailyNote).toHaveBeenCalledWith('box-42');
    expect(target).toEqual({
      notebookId: 'box-42',
      containerDocId: 'daily-doc-42',
    });
  });
});
