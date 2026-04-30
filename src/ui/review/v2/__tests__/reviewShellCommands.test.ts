// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStandardReviewQueueSwitchPresets,
  createReviewTitlebarQueueSwitchRuntime,
  handleQueueSwitchTriggerPointerDown,
  isReviewFullscreenActive,
  openQueueSwitchMenuAtAnchor,
  resolveCurrentMainQueueSwitchType,
  shouldApplyInitialReviewFullscreen,
  switchToStandardReviewQueue,
  toggleReviewFullscreen,
} from '../reviewShellCommands';
import { QueueType } from '@/types/unified-data-source';

const shellMenuMocks = vi.hoisted(() => {
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }> = [];

  class MockMenu {
    addItem = vi.fn();
    open = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return {
    instances,
    MockMenu,
  };
});

vi.mock('siyuan', () => ({
  Menu: shellMenuMocks.MockMenu,
}));

const t = (_key: string, fallback: string) => fallback;

describe('reviewShellCommands', () => {
  beforeEach(() => {
    shellMenuMocks.instances.length = 0;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('resolves standard review queue switch presets and active queue type', () => {
    const presets = buildStandardReviewQueueSwitchPresets(t);

    expect(presets.map((preset) => preset.queueType)).toEqual([
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FinalDrill,
      QueueType.FilterGroup,
      QueueType.NeuralRoam,
    ]);
    expect(presets.map((preset) => preset.title)).toEqual([
      '提取练习',
      '渐进学习',
      '刻意练习',
      '分组队列',
      '神经漫游',
    ]);

    expect(resolveCurrentMainQueueSwitchType({
      headerVariant: 'final-drill',
      activeQueueType: QueueType.RetrievalPractice,
    })).toBe(QueueType.FinalDrill);
    expect(resolveCurrentMainQueueSwitchType({
      activeQueueType: QueueType.FilterGroup,
    })).toBe(QueueType.FilterGroup);
    expect(resolveCurrentMainQueueSwitchType({
      activeQueueType: QueueType.Leech,
    })).toBeNull();
  });

  it('routes queue switches through dialog or tab managers and reports unavailable managers', () => {
    const dialogManager = {
      switchStandardReviewDialogQueue: vi.fn(),
    };
    const tabManager = {
      replaceCurrentReviewTabWithStandardQueue: vi.fn(),
    };
    const showMessage = vi.fn();

    switchToStandardReviewQueue({
      queueType: QueueType.RetrievalPractice,
      currentQueueType: QueueType.RetrievalPractice,
      mode: 'dialog',
      dialogManager,
      tabManager,
      t,
      showMessage,
    });
    expect(dialogManager.switchStandardReviewDialogQueue).not.toHaveBeenCalled();

    switchToStandardReviewQueue({
      queueType: QueueType.IncrementalLearning,
      currentQueueType: QueueType.RetrievalPractice,
      mode: 'dialog',
      dialogManager,
      tabManager,
      t,
      showMessage,
    });
    expect(dialogManager.switchStandardReviewDialogQueue).toHaveBeenCalledWith(QueueType.IncrementalLearning);

    switchToStandardReviewQueue({
      queueType: QueueType.FinalDrill,
      currentQueueType: QueueType.RetrievalPractice,
      mode: 'tab',
      dialogManager,
      tabManager,
      t,
      showMessage,
    });
    expect(tabManager.replaceCurrentReviewTabWithStandardQueue).toHaveBeenCalledWith(QueueType.FinalDrill);

    switchToStandardReviewQueue({
      queueType: QueueType.FilterGroup,
      currentQueueType: QueueType.RetrievalPractice,
      mode: 'dialog',
      dialogManager: null,
      tabManager: null,
      t,
      showMessage,
    });
    expect(showMessage).toHaveBeenLastCalledWith('Plugin not ready', 3000, 'error');
  });

  it('builds the queue switch menu with current item disabled and pointer events contained', async () => {
    const anchor = document.createElement('button');
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      bottom: 28,
      width: 40,
      height: 20,
    } as DOMRect);
    const switchQueue = vi.fn();

    openQueueSwitchMenuAtAnchor({
      anchor,
      event: new MouseEvent('click', { clientX: 8, clientY: 9 }),
      currentQueueType: QueueType.RetrievalPractice,
      presets: buildStandardReviewQueueSwitchPresets(t),
      switchQueue,
    });

    const menu = shellMenuMocks.instances.at(-1);
    expect(menu?.open).toHaveBeenCalledWith({ x: 10, y: 28 });
    expect(menu?.addItem).toHaveBeenCalledTimes(5);
    expect(menu?.addItem.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      id: QueueType.RetrievalPractice,
      icon: 'iconCheck',
      disabled: true,
    }));

    await menu?.addItem.mock.calls[1]?.[0].click();
    expect(switchQueue).toHaveBeenCalledWith(QueueType.IncrementalLearning);

    const pointerEvent = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    const stopPropagation = vi.fn();
    Object.defineProperty(pointerEvent, 'stopPropagation', { value: stopPropagation });
    handleQueueSwitchTriggerPointerDown(pointerEvent);
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('syncs and clears the native dialog titlebar queue trigger', async () => {
    vi.useFakeTimers();
    let enabled = true;
    let title = '提取练习';
    const container = document.createElement('div');
    container.className = 'b3-dialog__container siyuanmemo-review-dialog-container';
    container.innerHTML = '<div class="b3-dialog__header resize__move">提取练习</div>';
    document.body.appendChild(container);
    const click = vi.fn();

    const runtime = createReviewTitlebarQueueSwitchRuntime({
      isEnabled: () => enabled,
      getDialogContainer: () => container,
      getTitle: () => title,
      getAriaLabel: (nextTitle) => `切换复习队列：${nextTitle}`,
      onTriggerPointerDown: vi.fn(),
      onTriggerClick: click,
    });

    runtime.scheduleSync();
    await vi.runAllTimersAsync();

    const trigger = container.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
    expect(trigger?.textContent).toBe('提取练习');
    expect(trigger?.getAttribute('aria-label')).toBe('切换复习队列：提取练习');

    title = '渐进学习';
    runtime.scheduleSync();
    await vi.runAllTimersAsync();
    expect(container.querySelector('.siyuanmemo-review-titlebar__queue-switch')?.textContent).toBe('渐进学习');

    trigger?.click();
    expect(click).toHaveBeenCalledTimes(1);

    enabled = false;
    runtime.scheduleSync();
    await vi.runAllTimersAsync();
    expect(container.querySelector('.siyuanmemo-review-titlebar__queue-switch')).toBeNull();
    expect(container.querySelector('.b3-dialog__header')?.textContent).toBe('渐进学习');

    runtime.clear();
  });

  it('applies fullscreen only for eligible dialog review surfaces and resizes Protyle', async () => {
    vi.useFakeTimers();
    const dialogContainer = document.createElement('div');
    const contentMain = document.createElement('div');
    const protyleHost = document.createElement('div');
    const drag = document.createElement('div');
    const resize = vi.fn();
    dialogContainer.className = 'b3-dialog__container siyuanmemo-review-dialog-container';
    contentMain.className = 'fsrs-review-v2-content';
    protyleHost.className = 'fsrs-review-v2-content__protyle-host';
    drag.id = 'drag';
    contentMain.appendChild(protyleHost);
    document.body.append(dialogContainer, contentMain, drag);

    expect(shouldApplyInitialReviewFullscreen({
      startFullscreen: true,
      mode: 'dialog',
      isMobile: false,
      fullscreenActive: false,
    })).toBe(true);
    expect(shouldApplyInitialReviewFullscreen({
      startFullscreen: true,
      mode: 'tab',
      fullscreenActive: false,
    })).toBe(false);

    toggleReviewFullscreen({
      mode: 'dialog',
      isMobile: false,
      getDialogContainer: () => dialogContainer,
      getContentMain: () => contentMain,
      getProtyleFromHost: () => ({ resize }),
      logger: {},
    });

    expect(isReviewFullscreenActive({
      getDialogContainer: () => dialogContainer,
      getContentMain: () => contentMain,
    })).toBe(true);
    expect(dialogContainer.style.maxWidth).toBe('100vw');
    expect(drag.classList.contains('fn__hidden')).toBe(true);
    await vi.runAllTimersAsync();
    expect(resize).toHaveBeenCalledTimes(1);

    toggleReviewFullscreen({
      mode: 'dialog',
      isMobile: false,
      getDialogContainer: () => dialogContainer,
      getContentMain: () => contentMain,
      getProtyleFromHost: () => ({ resize }),
      logger: {},
    });
    expect(contentMain.classList.contains('fullscreen')).toBe(false);
    expect(dialogContainer.style.maxWidth).toBe('1024px');
    expect(drag.classList.contains('fn__hidden')).toBe(false);
  });
});
