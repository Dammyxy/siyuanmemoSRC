import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuManager } from '@/application/managers/MenuManager';

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: vi.fn(),
}));

vi.mock('@/infrastructure/siyuan/ManagerSiyuanAdapter', () => ({
  ManagerSiyuanAdapter: vi.fn().mockImplementation(() => ({
    sql: vi.fn().mockResolvedValue([]),
    getBlockAttrs: vi.fn().mockResolvedValue({}),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  })),
}));

function createFixture() {
  const dialogManager = {
    openReviewDialog: vi.fn().mockResolvedValue(undefined),
    openIncrementalLearningDialog: vi.fn().mockResolvedValue(undefined),
    openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
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
  } as any;

  const menuManager = new MenuManager(context, {} as any, {} as Record<string, string>, dialogManager as any);
  return { menuManager, dialogManager };
}

describe('MenuManager top bar quick entry actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
