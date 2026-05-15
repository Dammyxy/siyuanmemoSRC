import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuManager } from '@/application/managers/MenuManager';
import { showMessage } from 'siyuan';

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: vi.fn(),
}));

function createFixture(options?: {
  docScope?: {
    docIds: string[];
    cards: Array<{ id: string; blockId: string; type: string; due: number; skipped?: boolean }>;
  } | null;
}) {
  const autoCardSummary = {
    rootId: 'doc-1',
    scanned: 3,
    created: 1,
    skipped: 2,
    failed: 0,
    conflicted: 0,
    consumed: 1,
  };
  const tempAutoCardHandler = {
    scanDocumentByRootId: vi.fn().mockResolvedValue(autoCardSummary),
    dispose: vi.fn(),
  };
  const siyuanApi = {
    sql: vi.fn().mockResolvedValue([]),
    getBlockAttrs: vi.fn().mockResolvedValue({}),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  };
  const dialogManager = {
    openReviewDialog: vi.fn().mockResolvedValue(undefined),
    openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
    openIncrementalLearningDialog: vi.fn().mockResolvedValue(undefined),
    openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
    openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    openNeuralRoamDialog: vi.fn().mockResolvedValue(undefined),
    openFilterGroupPracticeDialog: vi.fn().mockResolvedValue(undefined),
    openBrowserDialog: vi.fn(),
    openSettingsDialog: vi.fn(),
  };

  const context = {
    getCardService: vi.fn().mockReturnValue({
      getDueCards: vi.fn().mockResolvedValue({ count: 0, total: 0 }),
    }),
    getStorage: vi.fn().mockReturnValue({
      getAllCards: vi.fn().mockReturnValue([]),
    }),
    getAutoCardHandler: vi.fn().mockReturnValue(null),
    createAutoCardHandler: vi.fn().mockResolvedValue(tempAutoCardHandler),
    getUnifiedDataSourceManager: vi.fn().mockReturnValue({
      getDayStartHour: vi.fn(() => 4),
    }),
    getDocTreeReviewScopeService: vi.fn().mockReturnValue({
      collectDocReviewScope: vi.fn(() => options?.docScope ?? ({
        docIds: ['doc-1', 'doc-child-1'],
        cards: [
          { id: 'due-card', blockId: 'due-block', type: 'item', due: Date.now() - 1, skipped: false },
          { id: 'future-card', blockId: 'future-block', type: 'item', due: Date.now() + 86400000, skipped: false },
        ],
      })),
      hydrate: vi.fn().mockResolvedValue(undefined),
    }),
  } as any;

  const menuManager = new MenuManager(
    context,
    {} as any,
    {
      oneClickSymbolCardsRunning: 'symbol-running',
      oneClickSymbolCardsDone: 'symbol-done-{scanned}-{created}-{skipped}-{failed}',
      oneClickSymbolCardsFailed: 'symbol-failed',
    } as Record<string, string>,
    dialogManager as any,
    siyuanApi as any,
  );
  return { menuManager, dialogManager, context, tempAutoCardHandler, autoCardSummary };
}

describe('MenuManager top bar quick entry actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('delegates start-review to openReviewDialog', async () => {
    const { menuManager, dialogManager } = createFixture();
    await menuManager.runTopBarQuickEntryAction('start-review');
    expect(dialogManager.openReviewDialog).toHaveBeenCalledTimes(1);
  });

  it('delegates open-srs-browser to openBrowserDialog', async () => {
    const { menuManager, dialogManager } = createFixture();
    await menuManager.runTopBarQuickEntryAction('open-srs-browser');
    expect(dialogManager.openBrowserDialog).toHaveBeenCalledTimes(1);
  });

  it('uses by-doc entry when doc context exists for one-click symbol', async () => {
    const { menuManager } = createFixture();
    const byDocSpy = vi.spyOn(menuManager, 'runOneClickSymbolCardCreationByDocId').mockResolvedValue(undefined);
    const currentSpy = vi.spyOn(menuManager, 'runOneClickSymbolCardCreationForCurrentDoc').mockResolvedValue(undefined);

    await menuManager.runTopBarQuickEntryAction('one-click-symbol-current-doc', { docId: 'doc-1' });

    expect(byDocSpy).toHaveBeenCalledWith('doc-1');
    expect(currentSpy).not.toHaveBeenCalled();
  });

  it('falls back to current-doc entry when one-click symbol has no doc context', async () => {
    const { menuManager } = createFixture();
    const byDocSpy = vi.spyOn(menuManager, 'runOneClickSymbolCardCreationByDocId').mockResolvedValue(undefined);
    const currentSpy = vi.spyOn(menuManager, 'runOneClickSymbolCardCreationForCurrentDoc').mockResolvedValue(undefined);

    await menuManager.runTopBarQuickEntryAction('one-click-symbol-current-doc');

    expect(byDocSpy).not.toHaveBeenCalled();
    expect(currentSpy).toHaveBeenCalledTimes(1);
  });

  it('uses ApplicationContext factory for one-click symbol scan when listener handler is inactive', async () => {
    const { menuManager, context, tempAutoCardHandler } = createFixture();

    await menuManager.runOneClickSymbolCardCreationByDocId('doc-1');

    expect(context.getAutoCardHandler).toHaveBeenCalledTimes(1);
    expect(context.createAutoCardHandler).toHaveBeenCalledTimes(1);
    expect(tempAutoCardHandler.scanDocumentByRootId).toHaveBeenCalledWith('doc-1');
    expect(tempAutoCardHandler.dispose).toHaveBeenCalledTimes(1);
  });

  it('reuses active AutoCardHandler for one-click symbol scan', async () => {
    const { menuManager, context, autoCardSummary, tempAutoCardHandler } = createFixture();
    const activeAutoCardHandler = {
      scanDocumentByRootId: vi.fn().mockResolvedValue(autoCardSummary),
    };
    context.getAutoCardHandler.mockReturnValue(activeAutoCardHandler);

    await menuManager.runOneClickSymbolCardCreationByDocId('doc-1');

    expect(context.createAutoCardHandler).not.toHaveBeenCalled();
    expect(activeAutoCardHandler.scanDocumentByRootId).toHaveBeenCalledWith('doc-1');
    expect(tempAutoCardHandler.dispose).not.toHaveBeenCalled();
  });

  it('uses by-doc entry when doc context exists for one-click cancel', async () => {
    const { menuManager } = createFixture();
    const byDocSpy = vi.spyOn(menuManager, 'runOneClickCancelCardsByDocId').mockResolvedValue(undefined);
    const currentSpy = vi.spyOn(menuManager, 'runOneClickCancelCardsForCurrentDoc').mockResolvedValue(undefined);

    await menuManager.runTopBarQuickEntryAction('one-click-cancel-current-doc', { docId: 'doc-1' });

    expect(byDocSpy).toHaveBeenCalledWith('doc-1');
    expect(currentSpy).not.toHaveBeenCalled();
  });

  it('falls back to current-doc entry when one-click cancel has no doc context', async () => {
    const { menuManager } = createFixture();
    const byDocSpy = vi.spyOn(menuManager, 'runOneClickCancelCardsByDocId').mockResolvedValue(undefined);
    const currentSpy = vi.spyOn(menuManager, 'runOneClickCancelCardsForCurrentDoc').mockResolvedValue(undefined);

    await menuManager.runTopBarQuickEntryAction('one-click-cancel-current-doc');

    expect(byDocSpy).not.toHaveBeenCalled();
    expect(currentSpy).toHaveBeenCalledTimes(1);
  });

  it('opens current document tree due review with only due cards and descendant doc scope', async () => {
    const { menuManager, dialogManager } = createFixture();

    await menuManager.runCurrentDocTreeDueReviewByDocId('doc-1');

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['due-block'],
      cardIds: ['due-card'],
      preferredCardId: 'due-card',
      scopeDocIds: ['doc-1', 'doc-child-1'],
      dueOnly: true,
    });
    expect(dialogManager.openReviewDialog).not.toHaveBeenCalled();
    expect(dialogManager.openTemporaryDrill).not.toHaveBeenCalled();
  });

  it('opens current document tree temporary drill with all scoped cards', async () => {
    const { menuManager, dialogManager } = createFixture();

    await menuManager.runCurrentDocTreeTemporaryDrillByDocId('doc-1');

    expect(dialogManager.openTemporaryDrill).toHaveBeenCalledWith(['due-block', 'future-block'], {
      cardIds: ['due-card', 'future-card'],
      preferredCardId: 'due-card',
    });
    expect(dialogManager.openReviewDialog).not.toHaveBeenCalled();
  });

  it('does not fall back to global review when current document is unavailable', async () => {
    const { menuManager, dialogManager } = createFixture();

    await menuManager.runCurrentDocTreeDueReviewForCurrentDoc();

    expect(showMessage).toHaveBeenCalledWith('无法定位当前文档');
    expect(dialogManager.openReviewDialog).not.toHaveBeenCalled();
    expect(dialogManager.openRetrievalPracticeWithFilter).not.toHaveBeenCalled();
  });

  it('does not fall back when current document tree has no due cards', async () => {
    const { menuManager, dialogManager } = createFixture({
      docScope: {
        docIds: ['doc-1'],
        cards: [
          { id: 'future-card', blockId: 'future-block', type: 'item', due: Date.now() + 86400000, skipped: false },
        ],
      },
    });

    await menuManager.runCurrentDocTreeDueReviewByDocId('doc-1');

    expect(showMessage).toHaveBeenCalledWith('当前文档及子文档内没有到期卡片');
    expect(dialogManager.openReviewDialog).not.toHaveBeenCalled();
    expect(dialogManager.openRetrievalPracticeWithFilter).not.toHaveBeenCalled();
  });

  it('does not fall back when current document tree has no practiceable cards', async () => {
    const { menuManager, dialogManager } = createFixture({
      docScope: {
        docIds: ['doc-1'],
        cards: [],
      },
    });

    await menuManager.runCurrentDocTreeTemporaryDrillByDocId('doc-1');

    expect(showMessage).toHaveBeenCalledWith('当前文档及子文档内没有可练习卡片');
    expect(dialogManager.openReviewDialog).not.toHaveBeenCalled();
    expect(dialogManager.openTemporaryDrill).not.toHaveBeenCalled();
  });
});
