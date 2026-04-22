import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BrowserToolbar from '../BrowserToolbar.vue';

const baseProps = {
  i18n: {
    searchPlaceholderAdvanced: 'Search',
    startPractice: 'Start Practice',
    openInTab: 'Open in Tab',
    browserNavigator: 'Navigator',
    allCards: 'All',
    dueToday: 'Due Today',
    overdue: 'Overdue',
    leech: 'Leech',
    new: 'New',
    allFlashcards: 'All flashcards',
    cardTypeAll: 'All types',
    hierarchyView: 'Hierarchy',
    flatView: 'Flat',
  },
  searchQuery: '',
  currentPreset: 'all',
  currentCardType: 'all',
  cardCount: 12,
  showExitFocus: false,
  hasPlugin: true,
  canApplySortToQueue: false,
  viewMode: 'flat' as const,
  loading: false,
  showPreview: false,
  mode: 'dialog' as const,
  layoutProfile: 'dialog' as const,
  mobileMode: false,
  queueType: '',
  appliedFilter: null,
  activeQueueId: null,
  activeScopeDocIds: null,
  activeDocId: null,
  activeGlobalScope: '__all__' as const,
  selectedCount: 0,
  selectionMode: 'explicit' as const,
  canSelectAllMatching: true,
  showNavigatorToggle: false,
  navigatorOpen: false,
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

describe('BrowserToolbar surface actions', () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the open-in-tab action in dialog mode', () => {
    const wrapper = mount(BrowserToolbar, {
      props: baseProps,
    });

    const buttons = wrapper.findAll('button');
    const openInTabButton = buttons.find((button) => button.text().includes('Open in Tab'));

    expect(openInTabButton).toBeTruthy();
  });

  it('keeps the main search placeholder empty even when advanced placeholder copy exists', () => {
    const wrapper = mount(BrowserToolbar, {
      props: baseProps,
    });

    expect(wrapper.get('input.b3-text-field').attributes('placeholder')).toBe('');
  });

  it('hides the open-in-tab action in tab mode', () => {
    const wrapper = mount(BrowserToolbar, {
      props: {
        ...baseProps,
        mode: 'tab',
        layoutProfile: 'tab-wide',
      },
    });

    const buttons = wrapper.findAll('button');
    const openInTabButton = buttons.find((button) => button.text().includes('Open in Tab'));

    expect(openInTabButton).toBeUndefined();
  });

  it('emits toggleNavigator when the narrow navigator button is clicked', async () => {
    const wrapper = mount(BrowserToolbar, {
      props: {
        ...baseProps,
        mode: 'tab',
        layoutProfile: 'tab-narrow',
        showNavigatorToggle: true,
      },
    });

    const buttons = wrapper.findAll('button');
    const navigatorButton = buttons.find((button) => button.attributes('title') === 'Navigator');

    expect(navigatorButton).toBeTruthy();
    await navigatorButton!.trigger('click');

    expect(wrapper.emitted('toggleNavigator')).toBeTruthy();
  });

  it('renders scope chips in tab-narrow layout', () => {
    const wrapper = mount(BrowserToolbar, {
      props: {
        ...baseProps,
        mode: 'tab',
        layoutProfile: 'tab-narrow',
        activeQueueId: 'neural-roam',
        viewMode: 'hierarchy',
      },
    });

    const chips = wrapper.findAll('.toolbar__chip').map((chip) => chip.text());

    expect(chips.length).toBeGreaterThan(0);
    expect(chips.some((chip) => chip.includes('Hierarchy'))).toBe(true);
  });

  it('shows document-tree scope affordances when scoped doc ids are active', () => {
    const wrapper = mount(BrowserToolbar, {
      props: {
        ...baseProps,
        showExitFocus: true,
        layoutProfile: 'tab-narrow',
        mode: 'tab',
        activeScopeDocIds: ['doc-1', 'doc-1-child'],
      },
    });

    const exitButton = wrapper.findAll('button').find((button) => button.attributes('title') === 'Exit Doc Tree Scope');
    const chips = wrapper.findAll('.toolbar__chip').map((chip) => chip.text());

    expect(exitButton).toBeTruthy();
    expect(chips.some((chip) => chip.includes('Doc Tree (2)'))).toBe(true);
  });
});
