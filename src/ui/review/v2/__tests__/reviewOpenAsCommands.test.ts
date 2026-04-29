import { describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import {
  buildReviewOpenAsMenuItems,
  type BuildReviewOpenAsMenuItemsOptions,
  type ReviewTabOpenOptions,
} from '../reviewOpenAsCommands';

const siyuanMocks = vi.hoisted(() => ({
  openTab: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Constants: { CB_GET_FOCUS: 'cb-get-focus' },
  openTab: siyuanMocks.openTab,
}));

const t = (_key: string, fallback: string) => fallback;

function buildOptions(
  overrides: Partial<BuildReviewOpenAsMenuItemsOptions> = {},
): BuildReviewOpenAsMenuItemsOptions & {
  tabManager: NonNullable<BuildReviewOpenAsMenuItemsOptions['tabManager']>;
  closeCurrentReviewSurface: ReturnType<typeof vi.fn>;
  openBlockAtSource: ReturnType<typeof vi.fn>;
  openManagedReviewSplit: ReturnType<typeof vi.fn>;
} {
  const tabManager = {
    openReviewTab: vi.fn(),
    openReviewTabInNewTab: vi.fn(),
    openReviewInNewWindow: vi.fn(),
  };
  const closeCurrentReviewSurface = vi.fn();
  const openBlockAtSource = vi.fn(async () => undefined);
  const openManagedReviewSplit = vi.fn();

  return {
    app: {} as never,
    mode: 'dialog',
    title: 'Review',
    currentSourceBlockId: 'source-block',
    tabManager,
    dialogManager: null,
    standardDialogTarget: null,
    t,
    buildReviewTabOpenOptions: vi.fn((options?: Partial<ReviewTabOpenOptions>) => ({
      title: 'Review',
      position: options?.position,
      reviewState: options?.reviewState ?? null,
    })),
    buildReviewTabRuntimeState: vi.fn(() => ({ version: 1 }) as never),
    getInitialReviewSessionState: vi.fn(() => ({ initialTotal: 3, answeredCount: 1, correctCount: 1 })),
    getUnderlyingQueue: vi.fn(() => ({ queue: true })),
    openManagedReviewSplit,
    closeCurrentReviewSurface,
    openBlockAtSource,
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
    },
    ...overrides,
  };
}

describe('reviewOpenAsCommands', () => {
  it('returns no actions without a review tab manager', () => {
    expect(buildReviewOpenAsMenuItems(buildOptions({ tabManager: null }))).toEqual([]);
  });

  it('builds dialog open-as actions and transfers review state', async () => {
    const options = buildOptions();
    const items = buildReviewOpenAsMenuItems(options);

    expect(items.map((item) => item.id)).toEqual([
      'locateSourceBlock',
      'openRightReviewAndLocateSource',
      'openByTab',
      'insertRight',
      'openByNewWindow',
    ]);

    items.find((item) => item.id === 'locateSourceBlock')?.click?.();
    expect(options.openBlockAtSource).toHaveBeenCalledWith({
      app: {},
      blockId: 'source-block',
    });

    await items.find((item) => item.id === 'openRightReviewAndLocateSource')?.click?.();
    expect(options.tabManager.openReviewTab).toHaveBeenCalledWith(expect.objectContaining({
      position: 'right',
      reviewState: { version: 1 },
    }));
    expect(options.closeCurrentReviewSurface).toHaveBeenCalledTimes(1);

    items.find((item) => item.id === 'openByTab')?.click?.();
    expect(options.tabManager.openReviewTabInNewTab).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review',
    }));
  });

  it('builds tab split actions and standard dialog conversion', () => {
    const dialogManager = {
      openStandardReviewDialog: vi.fn(),
    };
    const options = buildOptions({
      mode: 'tab',
      dialogManager,
      standardDialogTarget: {
        queueType: QueueType.RetrievalPractice,
        headerVariant: 'retrieval-practice',
      },
    });

    const items = buildReviewOpenAsMenuItems(options);
    expect(items.map((item) => item.id)).toEqual([
      'locateSourceBlock',
      'openRightReviewAndLocateSource',
      'managedSplitRight',
      'managedSplitBottom',
      'openInDialog',
    ]);

    items.find((item) => item.id === 'managedSplitRight')?.click?.();
    expect(options.openManagedReviewSplit).toHaveBeenCalledWith('right');

    items.find((item) => item.id === 'openInDialog')?.click?.();
    expect(dialogManager.openStandardReviewDialog).toHaveBeenCalledWith({
      queueType: QueueType.RetrievalPractice,
      title: 'Review',
      headerVariant: 'retrieval-practice',
      queueInstance: { queue: true },
      initialSessionState: { initialTotal: 3, answeredCount: 1, correctCount: 1 },
    });
    expect(options.closeCurrentReviewSurface).toHaveBeenCalledTimes(1);
  });
});
