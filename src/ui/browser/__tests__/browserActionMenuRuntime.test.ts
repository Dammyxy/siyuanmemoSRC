import { describe, expect, it, vi } from 'vitest';
import type { ICardDataSource } from '../datasource/types';
import type { BrowserCard } from '../types';
import { createBrowserActionMenuRuntime, type BrowserMenuItem } from '../browserActionMenuRuntime';

function ref<T>(value: T): { value: T } {
  return { value };
}

function card(id: string): BrowserCard {
  return { id, blockId: `block-${id}` } as BrowserCard;
}

function cdfCard(id: string, meta: Record<string, unknown>): BrowserCard {
  return {
    ...card(id),
    meta: {
      relationAuthority: 'live-backlink',
      liveRelationKey: 'source:concept:descriptor-forward',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [],
      ...meta,
    },
  } as BrowserCard;
}

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function createMenuRecorder() {
  const menus: Array<{
    id: string;
    items: BrowserMenuItem[];
    open: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    menus,
    createMenu: (id: string) => {
      const menu = {
        id,
        items: [] as BrowserMenuItem[],
        open: vi.fn(),
        addItem(item: BrowserMenuItem) {
          this.items.push(item);
        },
      };
      menus.push(menu);
      return menu;
    },
  };
}

function createRuntimeDeps(overrides: Record<string, unknown> = {}) {
  const dataSource = {
    id: 'deck',
    label: 'Deck',
    getSupportedActions: vi.fn(() => [{ id: 'custom-action', label: 'Custom Action' }]),
    fetchRows: vi.fn(),
    performAction: vi.fn(async () => ({ updated: 1, skipped: 0 })),
  } as unknown as ICardDataSource;
  const menuRecorder = createMenuRecorder();
  const openReviewDialog = vi.fn();
  const openSrsCardSemanticsRepairDialog = vi.fn();
  const deps = {
    applyRandomSort: vi.fn(),
    applySort: vi.fn(),
    currentDataSource: ref<ICardDataSource | null>(dataSource),
    createMenu: menuRecorder.createMenu,
    defer: (fn: () => void) => fn(),
    describeCurrentFilterSummary: vi.fn(() => 'Scope: all'),
    ensureAllRowsSnapshotReady: vi.fn(async () => []),
    getDialogManager: vi.fn(() => ({
      openReviewDialog,
      openIncrementalLearningDialog: vi.fn(),
      openFinalDrillDialog: vi.fn(),
      openNeuralRoamDialog: vi.fn(),
      openFilterGroupPracticeDialog: vi.fn(),
      openSrsCardSemanticsRepairDialog,
    })),
    getNeuralRoamQueue: vi.fn(() => null),
    getPlugin: vi.fn(() => null),
    getQueueById: vi.fn(() => undefined),
    getStorage: vi.fn(() => null),
    globalSelection: {
      mode: ref('none'),
      explicitIds: ref(new Set<string>()),
      resolveSelectedIds: vi.fn((ids: string[]) => ids),
    },
    gridApi: ref({ refreshCells: vi.fn() }),
    i18n: {},
    invalidateCardCache: vi.fn(),
    isMobileMode: ref(false),
    isNeuralRoamQueueActive: ref(false),
    loadAllRowsForCurrentView: vi.fn(async () => []),
    loadData: vi.fn(async () => undefined),
    logger: createLogger(),
    neuralSubview: ref('concept-cards'),
    openDocumentTabById: vi.fn(async () => true),
    pushErrMsg: vi.fn(async () => undefined),
    pushMsg: vi.fn(async () => undefined),
    refreshGlobalStats: vi.fn(),
    refreshNeuralSubviewData: vi.fn(async () => undefined),
    refreshQueueCounts: vi.fn(async () => undefined),
    resolveNeuralSourceLabels: vi.fn(() => ({ addItem: 'Add source', removeItem: 'Remove source' })),
    selectedRows: ref<BrowserCard[]>([]),
    t: (_key: string, fallback: string) => fallback,
    ...overrides,
  };

  return { dataSource, deps, menuRecorder, openReviewDialog, openSrsCardSemanticsRepairDialog };
}

describe('browserActionMenuRuntime', () => {
  it('executes data source actions and keeps browser refresh feedback centralized', async () => {
    const { dataSource, deps } = createRuntimeDeps();
    const runtime = createBrowserActionMenuRuntime(deps);

    await runtime.handleAction('custom-action', [card('a')]);

    expect(dataSource.performAction).toHaveBeenCalledWith(
      'custom-action',
      [expect.objectContaining({ blockId: 'block-a' })],
      expect.objectContaining({ refresh: expect.any(Function) }),
    );
    expect(deps.gridApi.value?.refreshCells).toHaveBeenCalledWith({ force: true });
    expect(deps.refreshQueueCounts).toHaveBeenCalledTimes(1);
    expect(deps.pushMsg).toHaveBeenCalledWith('Success');
  });

  it('reports relative priority results and reloads the current view', async () => {
    const { dataSource, deps } = createRuntimeDeps({
      t: (key: string, fallback: string) => {
        const messages: Record<string, string> = {
          priorityRelativeIncreased: '已调整 {count} 张卡片优先级数值',
          priorityReachedUpperBound: '部分已到 100',
          priorityBoundSuffix: '，{bounds}',
        };
        return messages[key] || fallback;
      },
    });
    dataSource.performAction = vi.fn(async () => ({
      delta: 10,
      lowerBoundReached: false,
      skipped: 0,
      updated: 2,
      upperBoundReached: true,
    })) as never;
    const runtime = createBrowserActionMenuRuntime(deps);

    await runtime.handleAction('priority-plus-10', [card('a'), card('b')]);

    expect(dataSource.performAction).toHaveBeenCalledWith(
      'priority-plus-10',
      [expect.objectContaining({ blockId: 'block-a' }), expect.objectContaining({ blockId: 'block-b' })],
      expect.objectContaining({ refresh: expect.any(Function) }),
    );
    expect(deps.loadData).toHaveBeenCalledWith(false);
    expect(deps.pushMsg).toHaveBeenCalledWith('已调整 2 张卡片优先级数值，部分已到 100');
  });

  it('routes open action through tab bridge without requiring a data source', async () => {
    const { deps } = createRuntimeDeps({ currentDataSource: ref<ICardDataSource | null>(null) });
    const runtime = createBrowserActionMenuRuntime(deps);

    await runtime.handleAction('open', [card('a')], card('anchor'));

    expect(deps.openDocumentTabById).toHaveBeenCalledWith('block-anchor');
    expect(deps.pushErrMsg).not.toHaveBeenCalled();
  });

  it('routes review-subset through plugin facade with exact selected card ids', async () => {
    const openSubsetReviewDialog = vi.fn();
    const { dataSource, deps } = createRuntimeDeps({
      getPlugin: vi.fn(() => ({ openSubsetReviewDialog })),
    });
    const runtime = createBrowserActionMenuRuntime(deps);
    const selected = [
      { ...card('card-a'), blockId: 'shared-block' },
      { ...card('card-b'), blockId: 'shared-block' },
    ];
    const anchor = { ...card('card-b'), blockId: 'shared-block' };

    await runtime.handleAction('review-subset', selected, anchor);

    expect(openSubsetReviewDialog).toHaveBeenCalledWith(['shared-block'], {
      cardIds: ['card-a', 'card-b'],
      preferredCardId: 'card-b',
    });
    expect(dataSource.performAction).not.toHaveBeenCalled();
  });

  it('resolves all-matching action ids and action targets at action time', async () => {
    const allIds = Array.from({ length: 501 }, (_value, index) => `card-${index + 1}`);
    const selectedIds = allIds.filter((_id, index) => index < 500 || index === 500);
    const getAllMatchedIds = vi.fn(async () => allIds);
    const getActionTargetsByIds = vi.fn(async (ids: string[]) => ids.map((id) => ({
      id,
      blockId: `block-${id}`,
      fsrsCardId: id,
    })));
    const { dataSource, deps } = createRuntimeDeps({
      globalSelection: {
        mode: ref('all-matching'),
        explicitIds: ref(new Set<string>()),
        resolveSelectedIds: vi.fn(() => selectedIds),
      },
    });
    Object.assign(dataSource, {
      getQueryFingerprint: vi.fn(() => 'query:fingerprint'),
      getAllMatchedIds,
      getRowsByIds: vi.fn(),
      getActionTargetsByIds,
    });
    const runtime = createBrowserActionMenuRuntime(deps);

    await runtime.handleAction('custom-action', [card('visible')]);

    expect(getAllMatchedIds).toHaveBeenCalledWith('all-select');
    expect(deps.globalSelection.resolveSelectedIds).toHaveBeenCalledWith(allIds);
    expect(getActionTargetsByIds).toHaveBeenCalledTimes(2);
    expect(getActionTargetsByIds).toHaveBeenNthCalledWith(1, selectedIds.slice(0, 500), 'action-targets');
    expect(getActionTargetsByIds).toHaveBeenNthCalledWith(2, selectedIds.slice(500), 'action-targets');
    expect(dataSource.performAction).toHaveBeenCalledWith(
      'custom-action',
      expect.arrayContaining([
        expect.objectContaining({ fsrsCardId: 'card-1' }),
        expect.objectContaining({ fsrsCardId: 'card-501' }),
      ]),
      expect.objectContaining({ refresh: expect.any(Function) }),
    );
  });

  it('builds practice menu through dialog manager and opens at trigger rect', () => {
    const { deps, menuRecorder, openReviewDialog } = createRuntimeDeps();
    const runtime = createBrowserActionMenuRuntime(deps);
    const target = {
      getBoundingClientRect: () => ({ left: 42, bottom: 84 }),
    };
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: target,
      target,
      clientX: 1,
      clientY: 2,
    } as unknown as MouseEvent;

    runtime.openPracticeMenu(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(menuRecorder.menus[0].id).toBe('fsrs-browser-practice-menu');
    expect(menuRecorder.menus[0].open).toHaveBeenCalledWith({ x: 42, y: 84, isLeft: true });

    menuRecorder.menus[0].items[0].click?.();
    expect(openReviewDialog).toHaveBeenCalledTimes(1);
  });

  it('builds maintenance menu through dialog manager and routes semantic repair', () => {
    const { deps, menuRecorder, openSrsCardSemanticsRepairDialog } = createRuntimeDeps({
      t: (key: string, fallback: string) => ({
        repairSrsCardSemantics: '诊断并修复卡片类型',
      } as Record<string, string>)[key] || fallback,
    });
    const runtime = createBrowserActionMenuRuntime(deps);
    const target = {
      getBoundingClientRect: () => ({ left: 11, bottom: 22 }),
    };
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: target,
      target,
      clientX: 1,
      clientY: 2,
    } as unknown as MouseEvent;

    runtime.openMaintenanceMenu(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(menuRecorder.menus[0].id).toBe('fsrs-browser-maintenance-menu');
    expect(menuRecorder.menus[0].open).toHaveBeenCalledWith({ x: 11, y: 22, isLeft: true });
    expect(menuRecorder.menus[0].items[0].label).toBe('诊断并修复卡片类型');

    menuRecorder.menus[0].items[0].click?.();
    expect(openSrsCardSemanticsRepairDialog).toHaveBeenCalledTimes(1);
  });

  it('prepends state-specific CDF diagnostic actions to row context menus', async () => {
    const { dataSource, deps, menuRecorder } = createRuntimeDeps({
      t: (key: string, fallback: string) => ({
        cdfViewCanonical: 'View canonical',
        cdfKeepDuplicatePaused: 'Keep duplicate paused',
        cdfRepairActionUnavailable: 'CDF repair unavailable',
      } as Record<string, string>)[key] || fallback,
    });
    dataSource.getSupportedActions = vi.fn(() => [
      { id: 'open', label: 'Open' },
      { id: 'delete-card', label: 'Delete card' },
      { id: 'custom-action', label: 'Custom Action' },
    ]) as never;
    const runtime = createBrowserActionMenuRuntime(deps);
    const row = cdfCard('duplicate', {
      liveRelationStatus: 'duplicate-live-relation',
      liveContentStatus: 'content-incomplete',
    });
    const event = {
      data: row,
      event: {
        preventDefault: vi.fn(),
        clientX: 10,
        clientY: 20,
      },
    };

    runtime.onCellContextMenu(event as never);

    const menu = menuRecorder.menus.find((entry) => entry.id === 'card-browser-context');
    const labels = menu?.items.map((item) => item.label).filter(Boolean) || [];
    expect(labels).toEqual(expect.arrayContaining([
      'View canonical',
      'Keep duplicate paused',
      'Open',
      'Delete card',
      'Custom Action',
    ]));
    expect(labels.indexOf('View canonical')).toBeLessThan(labels.indexOf('Open'));

    const viewCanonical = menu?.items.find((item) => item.label === 'View canonical');
    viewCanonical?.click?.();
    await Promise.resolve();

    expect(dataSource.performAction).not.toHaveBeenCalledWith(
      'cdf-view-canonical',
      expect.anything(),
      expect.anything(),
    );
    expect(deps.pushErrMsg).toHaveBeenCalledWith('CDF repair unavailable');
  });
});
