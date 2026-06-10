import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showMessage } from 'siyuan';
import { TopBarManager, type TopBarRuntimePlugin } from '../TopBar';

vi.mock('siyuan', () => ({
  Menu: class {
    addItem() {}
    addSeparator() {}
    open() {}
  },
  showMessage: vi.fn(),
}));

type TopBarOptions = Parameters<TopBarRuntimePlugin['addTopBar']>[0];

function createPlugin(options: { initialized: boolean }) {
  const topbarElement = document.createElement('button');
  const addTopBar = vi.fn((topbarOptions: TopBarOptions) => {
    void topbarOptions;
    return topbarElement;
  });
  return {
    topbarElement,
    plugin: {
      isInitialized: options.initialized,
      i18n: {
        loading: 'Loading',
        topbarTitle: 'SRS',
      },
      addIcons: vi.fn(),
      addTopBar,
      openSRSBrowser: vi.fn(),
      openSettings: vi.fn(),
      getContext: vi.fn(() => ({
        getDialogManager: vi.fn(() => ({
          openReviewDialog: vi.fn(),
          openFinalDrillDialog: vi.fn(),
          openNeuralRoamDialog: vi.fn(),
          openFilterGroupPracticeDialog: vi.fn(),
        })),
        getCardService: vi.fn(() => ({
          getDueCount: vi.fn(async () => 0),
          getTotalCount: vi.fn(async () => 0),
        })),
      })),
    } satisfies TopBarRuntimePlugin,
  };
}

function getTopBarCallback(plugin: ReturnType<typeof createPlugin>['plugin']): () => void {
  const [options] = plugin.addTopBar.mock.calls[0] ?? [];
  if (!options) {
    throw new Error('TopBar was not registered');
  }
  return options.callback;
}

describe('TopBarManager runtime typing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks Browser open while the plugin is not initialized', () => {
    const { plugin } = createPlugin({ initialized: false });
    const manager = new TopBarManager(plugin);

    manager.init();
    const callback = getTopBarCallback(plugin);
    callback();

    expect(showMessage).toHaveBeenCalledWith('Loading');
    expect(plugin.openSRSBrowser).not.toHaveBeenCalled();
  });

  it('opens Browser through the existing plugin entrypoint after initialization', () => {
    const { plugin } = createPlugin({ initialized: true });
    const manager = new TopBarManager(plugin);

    manager.init();
    const callback = getTopBarCallback(plugin);
    callback();

    expect(showMessage).not.toHaveBeenCalled();
    expect(plugin.openSRSBrowser).toHaveBeenCalledTimes(1);
  });

  it('keeps the topbar initialization gate free of TypeScript suppression', () => {
    const source = readFileSync(resolve(__dirname, '../TopBar.ts'), 'utf8');

    expect(source).not.toContain('@ts-ignore');
    expect(source).not.toContain('@ts-expect-error');
  });
});
