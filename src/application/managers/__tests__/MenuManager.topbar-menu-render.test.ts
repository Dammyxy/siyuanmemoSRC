import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from 'siyuan';
import { MenuManager } from '@/application/managers/MenuManager';
import {
  TOPBAR_QUICK_ENTRY_DEFINITIONS,
  type TopBarQuickEntryActionId,
} from '@/application/entries/TopBarQuickEntryRegistry';

const menuInstances: Array<{
  addItem: ReturnType<typeof vi.fn>;
  addSeparator: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => {
    const instance = {
      addItem: vi.fn(),
      addSeparator: vi.fn(),
      open: vi.fn(),
    };
    menuInstances.push(instance);
    return instance;
  }),
  showMessage: vi.fn(),
}));

vi.mock('@/infrastructure/siyuan/ManagerSiyuanAdapter', () => ({
  ManagerSiyuanAdapter: vi.fn().mockImplementation(() => ({
    sql: vi.fn().mockResolvedValue([]),
    getBlockAttrs: vi.fn().mockResolvedValue({}),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('MenuManager top bar menu rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    menuInstances.length = 0;
  });

  it('renders top bar quick entries without hidden one-click items and preserves order', async () => {
    const dialogManager = {
      openReviewDialog: vi.fn().mockResolvedValue(undefined),
      openIncrementalLearningDialog: vi.fn().mockResolvedValue(undefined),
      openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
      openNeuralRoamDialog: vi.fn().mockResolvedValue(undefined),
      openFilterGroupPracticeDialog: vi.fn().mockResolvedValue(undefined),
      openBrowserDialog: vi.fn(),
      openSettingsDialog: vi.fn(),
    };
    const getDueCards = vi.fn().mockResolvedValue({ count: 3, total: 10 });

    const context = {
      getCardService: vi.fn().mockReturnValue({
        getDueCards,
      }),
      getStorage: vi.fn().mockReturnValue({
        getAllCards: vi.fn().mockReturnValue([]),
      }),
      getAutoCardHandler: vi.fn().mockReturnValue(null),
      getTabManager: vi.fn().mockReturnValue({
        openBrowserTab: vi.fn().mockReturnValue(true),
      }),
    } as any;

    const i18n = {
      startReview: 'L1',
      startIncrementalLearning: 'L2',
      startDeliberatePractice: 'L3',
      startNeuralReview: 'L4',
      startFilterGroupPractice: 'L5',
      srsBrowser: 'L6',
      openSrsBrowserTab: 'L7',
      oneClickSymbolCardsCurrentDoc: 'L7',
      oneClickCancelCardsCurrentDoc: 'L8',
      settings: 'Settings',
    } as Record<string, string>;

    const menuManager = new MenuManager(context, {} as any, i18n, dialogManager as any);
    const runSpy = vi.spyOn(menuManager, 'runTopBarQuickEntryAction').mockResolvedValue(undefined);

    await menuManager.openTopBarMenu({
      clientX: 0,
      clientY: 0,
      currentTarget: {
        getBoundingClientRect: () => ({ right: 12, bottom: 34 }),
      },
    } as unknown as MouseEvent);

    expect(vi.mocked(Menu)).toHaveBeenCalledTimes(1);
    const menu = menuInstances[0];
    const allItemArgs = menu.addItem.mock.calls.map((call) => call[0]);
    const visibleTopbarItems = allItemArgs.slice(0, 6);
    const browserTabItem = allItemArgs[6];
    const settingsItem = allItemArgs[7];
    const hiddenActionIds = new Set<TopBarQuickEntryActionId>([
      'one-click-symbol-current-doc',
      'one-click-cancel-current-doc',
    ]);
    const visibleDefinitions = TOPBAR_QUICK_ENTRY_DEFINITIONS.filter(
      (definition) => !hiddenActionIds.has(definition.id),
    );

    expect(visibleTopbarItems.map((item) => item.label)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    expect(browserTabItem.label).toBe('L7');
    expect(settingsItem.label).toBe('Settings');
    expect(visibleTopbarItems.map((item) => item.label)).not.toContain('L7');
    expect(visibleTopbarItems.map((item) => item.label)).not.toContain('L8');
    expect(allItemArgs.some((item) => item.type === 'readonly')).toBe(false);
    expect(context.getCardService).not.toHaveBeenCalled();
    expect(getDueCards).not.toHaveBeenCalled();

    for (const item of visibleTopbarItems) {
      expect(item.accelerator).toBeUndefined();
    }

    visibleTopbarItems.forEach((item) => item.click?.());
    visibleDefinitions.forEach((definition, index) => {
      expect(runSpy).toHaveBeenNthCalledWith(index + 1, definition.id);
    });

    browserTabItem.click?.();
    expect(context.getTabManager().openBrowserTab).toHaveBeenCalledTimes(1);
    settingsItem.click?.();
    expect(dialogManager.openSettingsDialog).toHaveBeenCalledTimes(1);
  });
});
