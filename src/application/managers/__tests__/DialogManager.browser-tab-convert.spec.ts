import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVueDialog } from '@/utils/dialog';
import { DialogManager } from '../DialogManager';
import type { BrowserOpenState } from '@/types/browser';

const mocks = vi.hoisted(() => ({
  dialogDestroy: vi.fn(),
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: vi.fn(() => ({ destroy: mocks.dialogDestroy })),
}));

vi.mock('@/ui/settings', () => ({
  SettingsPanel: {},
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/mobile/MobileReviewLauncher.vue', () => ({
  default: {},
}));

vi.mock('@/ui/xiuyuan', () => ({
  TemplateSelectDialog: {},
}));

vi.mock('@/application/factories/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: vi.fn(),
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

function createManager(
  opened = true,
  options?: {
    backendWorkerAvailable?: boolean;
    srsBackendClient?: unknown;
    backendStartupError?: string | null;
  },
) {
  const tabManager = {
    openBrowserTab: vi.fn(() => opened),
  };
  const siyuanApi = {
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
  const context = {
    getStorage: vi.fn(),
    getScheduler: vi.fn(),
    getBrowserService: vi.fn(),
    getTabApplicationService: vi.fn(),
    getTabManager: vi.fn(() => tabManager),
    getI18n: vi.fn(() => ({
      srsBrowser: 'SRS Browser',
      openBrowserTabFailed: 'Failed to open browser tab',
    })),
    getBackendMigrationRuntimePolicy: vi.fn().mockReturnValue({
      capabilities: {
        backendWorkerAvailable: options?.backendWorkerAvailable ?? true,
      },
    }),
    getSrsBackendClient: vi.fn().mockReturnValue(
      options && 'srsBackendClient' in options ? options.srsBackendClient : {},
    ),
    getBackendStartupError: vi.fn().mockReturnValue(options?.backendStartupError ?? null),
  } as any;

  const dialogManager = new DialogManager(context, { app: {} } as any, {
    siyuanApi: siyuanApi as any,
    progressiveSiyuanApi: {} as any,
    leechActionEffects: {} as any,
  });

  return {
    dialogManager,
    tabManager,
    siyuanApi,
  };
}

describe('DialogManager browser dialog convert-to-tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a browser tab with preserved state and closes the dialog on success', async () => {
    const { dialogManager, tabManager } = createManager(true);
    const state: BrowserOpenState = {
      queueId: 'neural-roam',
      neuralSubview: 'roam-history',
      scopeDocIds: ['doc-1', 'doc-1-child'],
      queryText: 'michael nielsen',
    };

    await dialogManager.openBrowserDialog();

    const config = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      events?: { convertToTab?: (value: BrowserOpenState) => void };
    };
    config.events?.convertToTab?.(state);

    expect(tabManager.openBrowserTab).toHaveBeenCalledWith({
      initialState: state,
    });
    expect(mocks.dialogDestroy).toHaveBeenCalledTimes(1);
  });

  it('passes initialOpenState into the browser dialog props when provided', async () => {
    const { dialogManager } = createManager(true);
    const initialOpenState: BrowserOpenState = {
      scopeDocIds: ['doc-1', 'doc-1-child'],
      preset: 'all',
    };

    await dialogManager.openBrowserDialog({
      initialOpenState,
      initialQueueId: 'retrieval',
    });

    const config = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      props?: { initialOpenState?: BrowserOpenState | null; initialQueueId?: string };
    };

    expect(config.props?.initialOpenState).toEqual(initialOpenState);
    expect(config.props?.initialQueueId).toBe('retrieval');
  });

  it('blocks the browser dialog when backend storage startup failed', async () => {
    const { dialogManager, siyuanApi, tabManager } = createManager(true, {
      srsBackendClient: null,
      backendStartupError: 'LEGACY_DIVERGENCE_DETECTED: legacy source changed',
    });

    await dialogManager.openBrowserDialog();

    expect(createVueDialog).not.toHaveBeenCalled();
    expect(tabManager.openBrowserTab).not.toHaveBeenCalled();
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith(
      expect.stringContaining('LEGACY_DIVERGENCE_DETECTED'),
    );
  });

  it('keeps the dialog open and reports an error when opening the tab fails', async () => {
    const { dialogManager, tabManager, siyuanApi } = createManager(false);

    await dialogManager.openBrowserDialog();

    const config = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      events?: { convertToTab?: (value: BrowserOpenState) => void };
    };
    config.events?.convertToTab?.({
      queueId: 'retrieval',
    });

    expect(tabManager.openBrowserTab).toHaveBeenCalledTimes(1);
    expect(mocks.dialogDestroy).not.toHaveBeenCalled();
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('Failed to open browser tab');
  });
});
