import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showMessage } from 'siyuan';
import { MenuManager } from '../MenuManager';

const sqlMock = vi.fn();
const getBlockAttrsMock = vi.fn();
const setBlockAttrsMock = vi.fn();

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: vi.fn(),
}));

describe('MenuManager one-click cancel current doc cards', () => {
  const mockCardService = {
    getDueCards: vi.fn().mockResolvedValue({ count: 0, total: 0 }),
    deleteCards: vi.fn(),
  };

  const mockStorage = {
    getAllCards: vi.fn(),
    getCard: vi.fn(),
    removeCard: vi.fn(),
    saveCards: vi.fn(),
  };

  const i18n = {
    oneClickCancelCardsNoDoc: 'no-doc',
    oneClickCancelCardsNoCards: 'no-cards',
    oneClickCancelCardsNoCancelableCards: 'no-cancelable',
    oneClickCancelCardsDone: 'done-{deleted}',
    oneClickCancelCardsKeepImageOcclusionHint: 'keep-{count}',
    oneClickCancelCardsRunning: 'running',
  } as Record<string, string>;

  let menuManager: MenuManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    getBlockAttrsMock.mockResolvedValue({});
    setBlockAttrsMock.mockResolvedValue(undefined);

    const mockContext = {
      getCardService: vi.fn().mockReturnValue(mockCardService),
      getStorage: vi.fn().mockReturnValue(mockStorage),
      getAutoCardHandler: vi.fn().mockReturnValue(null),
    } as any;

    menuManager = new MenuManager(
      mockContext,
      {} as any,
      i18n,
      {} as any,
      {
        sql: sqlMock,
        getBlockAttrs: getBlockAttrsMock,
        setBlockAttrs: setBlockAttrsMock,
      } as any,
    );
  });

  it('deletes cards by document block mapping even when card meta.rootId is missing', async () => {
    vi.spyOn(menuManager as any, 'getCurrentDocId').mockReturnValue('doc-1');
    sqlMock
      .mockResolvedValueOnce([{ root_id: 'doc-1' }])
      .mockResolvedValueOnce([{ id: 'block-1' }, { id: 'block-3' }]);
    mockStorage.getAllCards.mockReturnValue([
      { id: 'card-1', blockId: 'block-1', meta: {} },
      { id: 'card-2', blockId: 'block-2', meta: {} },
      { id: 'card-3', blockId: 'block-3', meta: {} },
    ]);
    mockCardService.deleteCards.mockResolvedValue({
      ok: true,
      value: { deletedCount: 2, failedCardIds: [] },
    });

    await menuManager.runOneClickCancelCardsForCurrentDoc();

    expect(sqlMock).toHaveBeenCalled();
    expect(mockCardService.deleteCards).toHaveBeenCalledWith({ cardIds: ['card-1', 'card-3'] });
    expect(vi.mocked(showMessage)).toHaveBeenLastCalledWith('done-2');
  });

  it('shows no-card message and skips delete when current document has no cards', async () => {
    vi.spyOn(menuManager as any, 'getCurrentDocId').mockReturnValue('doc-1');
    sqlMock
      .mockResolvedValueOnce([{ root_id: 'doc-1' }])
      .mockResolvedValueOnce([]);
    mockStorage.getAllCards.mockReturnValue([
      { id: 'card-2', blockId: 'block-2', meta: { rootId: 'doc-2' } },
    ]);

    await menuManager.runOneClickCancelCardsForCurrentDoc();

    expect(mockCardService.deleteCards).not.toHaveBeenCalled();
    expect(vi.mocked(showMessage)).toHaveBeenLastCalledWith('no-cards');
  });

  it('falls back to local cleanup for stale failed card ids', async () => {
    vi.spyOn(menuManager as any, 'getCurrentDocId').mockReturnValue('doc-1');
    sqlMock
      .mockResolvedValueOnce([{ root_id: 'doc-1' }])
      .mockResolvedValueOnce([{ id: 'block-1' }]);
    mockStorage.getAllCards.mockReturnValue([
      { id: 'card-1', blockId: 'block-1', meta: {} },
    ]);
    mockStorage.getCard.mockReturnValue({ id: 'card-1', blockId: 'block-1', meta: {} });
    mockStorage.removeCard.mockReturnValue(true);
    mockStorage.saveCards.mockResolvedValue(undefined);
    getBlockAttrsMock.mockResolvedValue({ 'custom-xiuyuan-id': 'xy_1' });
    mockCardService.deleteCards.mockResolvedValue({
      ok: true,
      value: { deletedCount: 0, failedCardIds: ['card-1'] },
    });

    await menuManager.runOneClickCancelCardsForCurrentDoc();

    expect(mockStorage.removeCard).toHaveBeenCalledWith('card-1');
    expect(setBlockAttrsMock).toHaveBeenCalled();
    expect(vi.mocked(showMessage)).toHaveBeenLastCalledWith('done-1');
  });

  it('excludes image occlusion cards from one-click cancel and reports kept count', async () => {
    vi.spyOn(menuManager as any, 'getCurrentDocId').mockReturnValue('doc-1');
    sqlMock
      .mockResolvedValueOnce([{ root_id: 'doc-1' }])
      .mockResolvedValueOnce([{ id: 'block-1' }, { id: 'block-2' }]);
    mockStorage.getAllCards.mockReturnValue([
      { id: 'card-1', blockId: 'block-1', meta: {} },
      { id: 'card-2', blockId: 'block-2', meta: { source: 'image-occlusion', imageOcclusion: true } },
    ]);
    mockCardService.deleteCards.mockResolvedValue({
      ok: true,
      value: { deletedCount: 1, failedCardIds: [] },
    });

    await menuManager.runOneClickCancelCardsForCurrentDoc();

    expect(mockCardService.deleteCards).toHaveBeenCalledWith({ cardIds: ['card-1'] });
    expect(vi.mocked(showMessage)).toHaveBeenLastCalledWith('done-1（keep-1）');
  });

  it('shows no-cancelable message when current document only has image occlusion cards', async () => {
    vi.spyOn(menuManager as any, 'getCurrentDocId').mockReturnValue('doc-1');
    sqlMock
      .mockResolvedValueOnce([{ root_id: 'doc-1' }])
      .mockResolvedValueOnce([{ id: 'block-2' }]);
    mockStorage.getAllCards.mockReturnValue([
      { id: 'card-2', blockId: 'block-2', meta: { source: 'image-occlusion', imageOcclusion: true } },
    ]);

    await menuManager.runOneClickCancelCardsForCurrentDoc();

    expect(mockCardService.deleteCards).not.toHaveBeenCalled();
    expect(vi.mocked(showMessage)).toHaveBeenLastCalledWith('no-cancelable');
  });

  it('shows no-doc message when no active document is found', async () => {
    vi.spyOn(menuManager as any, 'getCurrentDocId').mockReturnValue(null);

    await menuManager.runOneClickCancelCardsForCurrentDoc();

    expect(mockCardService.deleteCards).not.toHaveBeenCalled();
    expect(vi.mocked(showMessage)).toHaveBeenLastCalledWith('no-doc');
  });
});
