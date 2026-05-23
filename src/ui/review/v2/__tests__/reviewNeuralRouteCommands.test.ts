import { describe, expect, it, vi } from 'vitest';
import type {
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewState,
  NeuralRoamSessionQueue,
} from '@/types/unified-data-source';
import type { NeuralRoamRouteListItem } from '@/core/queue/neural/routes';
import {
  createReviewNeuralRouteCommandRuntime,
  formatReviewNeuralRouteDetail,
  isReviewNeuralRouteMenuSeparator,
} from '../reviewNeuralRouteCommands';

const t = (_key: string, fallback: string) => fallback;

function route(overrides: Partial<NeuralRoamRouteListItem> = {}): NeuralRoamRouteListItem {
  return {
    id: 'route-alpha',
    name: 'Alpha',
    temporary: false,
    previousRouteId: null,
    initialSeedNodeIds: [],
    createdAt: 1,
    updatedAt: 2,
    lastUsedAt: 3,
    isActive: true,
    stats: {
      routeId: 'route-alpha',
      seedCount: 3,
      anchorCount: 2,
      historyCount: 7,
      totalPoolEntries: 5,
    },
    ...overrides,
  };
}

function commandResult(routes: NeuralRoamRouteListItem[]): BackendNeuralRoamCommandResult {
  return {
    queueType: 'neural-roam',
    status: 'ok',
    queueState: { version: 8 },
    unavailableReason: null,
    message: null,
    viewState: {
      version: 1,
      queueType: 'neural-roam',
      route: {
        id: routes[0]?.id ?? 'route-alpha',
        name: routes[0]?.name ?? 'Alpha',
        temporary: routes[0]?.temporary === true,
        previousRouteId: routes[0]?.previousRouteId ?? null,
      },
      routes,
    } as BackendNeuralRoamViewState,
  };
}

function createHarness(options: {
  runCommand?: ((request: BackendNeuralRoamCommandRequest) => Promise<BackendNeuralRoamCommandResult>) | null;
  initialRoutes?: NeuralRoamRouteListItem[];
} = {}) {
  let routes = options.initialRoutes ?? [
    route({ id: 'route-alpha', name: 'Alpha', isActive: true }),
    route({ id: 'route-beta', name: 'Beta', isActive: false, stats: { routeId: 'route-beta', seedCount: 1, anchorCount: 0, historyCount: 4, totalPoolEntries: 1 } }),
  ];
  const queue = {
    getBackendViewState: vi.fn(() => null),
    listRoutes: vi.fn(async () => routes),
    syncFromBackendState: vi.fn(async () => undefined),
    setBackendViewState: vi.fn(),
  };
  const showMessage = vi.fn();
  const reload = vi.fn(async () => undefined);
  const openNeuralBrowserSubview = vi.fn();
  const promptRouteName = vi.fn(async () => '  Named route  ');
  const confirmRouteDelete = vi.fn(async () => true);
  const runCommand = options.runCommand === undefined
    ? vi.fn(async () => commandResult([route({ id: 'route-beta', name: 'Beta', isActive: true })]))
    : options.runCommand;

  const runtime = createReviewNeuralRouteCommandRuntime({
    t,
    getNeuralQueue: () => queue as unknown as NeuralRoamSessionQueue,
    getRouteCommand: () => runCommand ?? null,
    getRoutes: () => routes,
    setRoutes: (nextRoutes) => {
      routes = nextRoutes;
    },
    showMessage,
    reload,
    promptRouteName,
    confirmRouteDelete,
    openNeuralBrowserSubview,
    logger: { warn: vi.fn() },
  });

  return {
    confirmRouteDelete,
    openNeuralBrowserSubview,
    promptRouteName,
    queue,
    reload,
    routes: () => routes,
    runCommand,
    runtime,
    showMessage,
  };
}

describe('reviewNeuralRouteCommands', () => {
  it('formats active route detail without exposing stats math to the view', () => {
    expect(formatReviewNeuralRouteDetail(route(), t)).toBe('概念 3 · 空间站 2 · 日志 7');
  });

  it('routes switch commands through backend ownership and syncs returned route state', async () => {
    const { queue, reload, routes, runCommand, runtime } = createHarness();

    await runtime.switchRoute('route-beta');

    expect(runCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'switch-route', routeId: 'route-beta' },
    });
    expect(queue.syncFromBackendState).toHaveBeenCalledWith({ version: 8 });
    expect(queue.setBackendViewState).toHaveBeenCalledWith(expect.objectContaining({
      routes: [expect.objectContaining({ id: 'route-beta' })],
    }));
    expect(routes()).toEqual([expect.objectContaining({ id: 'route-beta', isActive: true })]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reports backend command unavailable without falling back to queue-local route mutation', async () => {
    const { queue, reload, runtime, showMessage } = createHarness({ runCommand: null });

    await runtime.switchRoute('route-beta');

    expect(showMessage).toHaveBeenCalledWith('航线切换不可用', 3000, 'error');
    expect(queue.syncFromBackendState).not.toHaveBeenCalled();
    expect(queue.setBackendViewState).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps local route state unchanged when backend reports route mismatch', async () => {
    const mismatch = vi.fn(async () => ({
      queueType: 'neural-roam',
      status: 'mismatch',
      viewState: null,
      queueState: null,
      unavailableReason: 'route-mismatch',
      message: 'NeuralRoam command route is no longer active',
    }) as BackendNeuralRoamCommandResult);
    const { queue, reload, routes, runtime, showMessage } = createHarness({ runCommand: mismatch });
    const before = routes();

    await runtime.switchRoute('route-beta');

    expect(showMessage).toHaveBeenCalledWith('NeuralRoam command route is no longer active', 3000, 'error');
    expect(routes()).toBe(before);
    expect(queue.syncFromBackendState).not.toHaveBeenCalled();
    expect(queue.setBackendViewState).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('builds route menu items whose clicks call the command runtime interface', async () => {
    const { openNeuralBrowserSubview, runtime, runCommand } = createHarness({
      initialRoutes: [
        route({ id: 'route-temp', name: 'Temp', temporary: true, previousRouteId: 'route-alpha', isActive: true }),
        route({ id: 'route-beta', name: 'Beta', isActive: false }),
      ],
    });

    const items = runtime.buildMenuItems();

    expect(items.find((item) => item.label === 'Temp')).toEqual(expect.objectContaining({
      disabled: true,
      accelerator: '概念 3 · 空间站 2 · 日志 7',
    }));
    expect(items.some(isReviewNeuralRouteMenuSeparator)).toBe(true);

    await items.find((item) => item.label === 'Beta')?.click?.();
    expect(runCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'switch-route', routeId: 'route-beta' },
    });

    items.find((item) => item.label === '航线日志')?.click?.();
    items.find((item) => item.label === '打开浏览器神经漫游面板')?.click?.();
    expect(openNeuralBrowserSubview).toHaveBeenCalledWith('roam-history');
    expect(openNeuralBrowserSubview).toHaveBeenCalledWith('concept-cards');
  });
});
