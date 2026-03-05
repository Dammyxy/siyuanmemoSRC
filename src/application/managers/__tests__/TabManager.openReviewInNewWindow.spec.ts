import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'siyuan';
import { QueueType } from '@/types/unified-data-source';
import { TabManager } from '../TabManager';

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  ipcSend: vi.fn(),
}));

vi.mock('siyuan', () => ({
  openTab: mocks.openTab,
  Constants: {
    SIYUAN_OPEN_WINDOW: 'siyuan-open-window',
    SIYUAN_VERSION: '3.1.0',
  },
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    send: mocks.ipcSend,
  },
}));

vi.mock('vue', () => ({
  createApp: vi.fn(() => ({
    mount: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function parseOpenWindowJson(url: string): unknown[] {
  const parsed = new URL(url);
  const encodedJson = parsed.searchParams.get('json');
  if (!encodedJson) {
    return [];
  }
  const decoded = decodeURIComponent(encodedJson);
  return JSON.parse(decoded) as unknown[];
}

function createReviewOptions() {
  return {
    title: 'Review',
    queue: {
      getType: () => QueueType.RetrievalPractice,
    },
  };
}

function createManager(prepareBeforeReview: (() => Promise<void>) | null = null) {
  const pushErrMsg = vi.fn();

  const context = {
    getI18n: vi.fn(() => ({
      openFailed: 'Open failed',
    })),
    getReviewQueuePreparationService: vi.fn(() => (
      prepareBeforeReview
        ? { prepareBeforeReview }
        : undefined
    )),
  };

  const plugin: Plugin = {
    name: 'test-plugin',
    app: {} as Plugin['app'],
    addTab: vi.fn(),
  } as unknown as Plugin;

  const tabManager = new TabManager(
    context as never,
    plugin,
    {
      siyuanApi: {
        pushErrMsg,
      } as never,
    }
  );

  return {
    tabManager,
    pushErrMsg,
  };
}

describe('TabManager.openReviewInNewWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens new window immediately without waiting for queue preparation', async () => {
    const deferred = createDeferred<void>();
    const prepareBeforeReview = vi.fn(() => deferred.promise);
    const { tabManager } = createManager(prepareBeforeReview);

    tabManager.openReviewInNewWindow(createReviewOptions());
    await flushMicrotasks();

    expect(prepareBeforeReview).toHaveBeenCalledWith(QueueType.RetrievalPractice);
    expect(mocks.ipcSend).toHaveBeenCalledTimes(1);
    const [channel, payload] = mocks.ipcSend.mock.calls[0] as [string, { url: string }];
    expect(channel).toBe('siyuan-open-window');
    expect(payload.url).toContain('window.html?v=3.1.0');
    const windowJson = parseOpenWindowJson(payload.url) as Array<{
      children?: { customModelType?: string };
    }>;
    expect(windowJson[0]?.children?.customModelType).toBe('test-plugintest-plugin-review');

    deferred.resolve();
    await flushMicrotasks();
  });

  it('still opens new window when background preparation fails', async () => {
    const prepareBeforeReview = vi.fn(async () => {
      throw new Error('prepare failed');
    });
    const { tabManager, pushErrMsg } = createManager(prepareBeforeReview);

    tabManager.openReviewInNewWindow(createReviewOptions());
    await flushMicrotasks();

    expect(prepareBeforeReview).toHaveBeenCalledWith(QueueType.RetrievalPractice);
    expect(mocks.ipcSend).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.ipcSend.mock.calls[0] as [string, { url: string }];
    const windowJson = parseOpenWindowJson(payload.url) as Array<{
      children?: { customModelType?: string };
    }>;
    expect(windowJson[0]?.children?.customModelType).toBe('test-plugintest-plugin-review');
    expect(pushErrMsg).not.toHaveBeenCalled();
  });
});
