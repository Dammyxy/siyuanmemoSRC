import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BrowserToolbar from '../BrowserToolbar.vue';

const baseProps = {
  i18n: {
    selectAllMatching: 'Select All Matching',
    cancelSelectAll: 'Cancel Select All',
    cancelSelectAllShort: 'Cancel',
    clearSelection: 'Clear Selection',
    selectAllShort: 'Select All',
    clearShort: 'Clear',
    startPractice: 'Start Practice',
    startPracticeShort: 'Practice',
    allCards: 'All',
    dueToday: 'Due Today',
    overdue: 'Overdue',
    leech: 'Leech',
    new: 'New',
    cards: 'cards',
    togglePreview: 'Toggle Preview',
  },
  searchQuery: '',
  currentPreset: 'all',
  currentCardType: 'all',
  cardCount: 100,
  showExitFocus: false,
  hasPlugin: true,
  canApplySortToQueue: false,
  viewMode: 'flat' as const,
  loading: false,
  showPreview: false,
  mode: 'dialog' as const,
  mobileMode: false,
  queueType: '',
  appliedFilter: null,
  activeQueueId: null,
  selectedCount: 0,
  selectionMode: 'explicit' as const,
  canSelectAllMatching: true,
};

let resizeObserverCallback: ResizeObserverCallback | null = null;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mountToolbar(overrides: Partial<typeof baseProps> = {}) {
  return mount(BrowserToolbar, {
    props: { ...baseProps, ...overrides },
  });
}

async function triggerToolbarWidth(width: number): Promise<void> {
  if (!resizeObserverCallback) {
    throw new Error('ResizeObserver callback was not registered.');
  }

  resizeObserverCallback(
    [{ contentRect: { width } } as ResizeObserverEntry],
    {} as ResizeObserver
  );
  await nextTick();
}

function findSelectionToggleButton(wrapper: ReturnType<typeof mountToolbar>) {
  return wrapper.findAll('button').find((button) => {
    const title = button.attributes('title') || '';
    return title === 'Select All Matching' || title === 'Cancel Select All';
  });
}

function findButtonByTitle(wrapper: ReturnType<typeof mountToolbar>, title: string) {
  return wrapper.findAll('button').find((button) => button.attributes('title') === title);
}

describe('BrowserToolbar selection actions', () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits selectAllMatching when toggle clicked in explicit mode', async () => {
    const wrapper = mountToolbar();

    const button = findSelectionToggleButton(wrapper);
    expect(button).toBeTruthy();
    await button!.trigger('click');

    expect(wrapper.emitted('selectAllMatching')).toBeTruthy();
  });

  it('emits clearSelection when toggle clicked in all-matching mode', async () => {
    const wrapper = mountToolbar({
      selectedCount: 12,
      selectionMode: 'all-matching',
    });

    const button = findSelectionToggleButton(wrapper);
    expect(button).toBeTruthy();
    await button!.trigger('click');

    expect(wrapper.emitted('clearSelection')).toBeTruthy();
  });

  it('uses normal density class and long labels at >=1680', async () => {
    const wrapper = mountToolbar();
    await triggerToolbarWidth(1800);

    const toolbarRoot = wrapper.find('.card-browser__toolbar');
    expect(toolbarRoot.classes()).toContain('card-browser__toolbar--normal');
    expect(toolbarRoot.classes()).not.toContain('card-browser__toolbar--compact');
    expect(toolbarRoot.classes()).not.toContain('card-browser__toolbar--tight');
    expect(wrapper.find('.toolbar__left').exists()).toBe(true);
    expect(wrapper.find('.toolbar__center').exists()).toBe(true);
    expect(wrapper.find('.toolbar__right').exists()).toBe(true);

    const toggleButton = findSelectionToggleButton(wrapper);
    expect(toggleButton?.text()).toContain('Select All Matching');

    const startPracticeButton = findButtonByTitle(wrapper, 'Start Practice');
    expect(startPracticeButton?.text()).toContain('Start Practice');
  });

  it('uses compact density class and short labels at 1366-1679', async () => {
    const wrapper = mountToolbar({
      selectedCount: 3,
    });
    await triggerToolbarWidth(1500);

    const toolbarRoot = wrapper.find('.card-browser__toolbar');
    expect(toolbarRoot.classes()).toContain('card-browser__toolbar--compact');
    expect(toolbarRoot.classes()).not.toContain('card-browser__toolbar--tight');

    const toggleButton = findSelectionToggleButton(wrapper);
    expect(toggleButton?.text()).toContain('Select All');

    const clearSelectionButton = findButtonByTitle(wrapper, 'Clear Selection');
    expect(clearSelectionButton?.text()).toContain('Clear');

    const startPracticeButton = findButtonByTitle(wrapper, 'Start Practice');
    expect(startPracticeButton?.text()).toContain('Practice');
  });

  it('uses short cancel label in all-matching compact mode', async () => {
    const wrapper = mountToolbar({
      selectedCount: 8,
      selectionMode: 'all-matching',
    });
    await triggerToolbarWidth(1500);

    const toggleButton = findSelectionToggleButton(wrapper);
    expect(toggleButton?.text()).toContain('Cancel');
    expect(toggleButton?.text()).not.toContain('Cancel Select All');
  });

  it('uses tight density class below 1366', async () => {
    const wrapper = mountToolbar();
    await triggerToolbarWidth(1200);

    const toolbarRoot = wrapper.find('.card-browser__toolbar');
    expect(toolbarRoot.classes()).toContain('card-browser__toolbar--tight');
    expect(toolbarRoot.classes()).not.toContain('card-browser__toolbar--compact');
  });
});
