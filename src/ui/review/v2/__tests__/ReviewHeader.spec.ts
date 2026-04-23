import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewHeader from '../ReviewHeader.vue';
import type { ReviewUIState } from '../types';

const reviewHeaderSiyuanMocks = vi.hoisted(() => ({
  showMessage: vi.fn(),
}));

vi.mock('siyuan', () => ({
  showMessage: reviewHeaderSiyuanMocks.showMessage,
}));

function createHeaderState(): ReviewUIState['header'] {
  return {
    stats: {
      current: 3,
      total: 3,
      label: '',
      queueName: 'retrieval',
    },
    counterSummary: {
      kind: 'ratio',
      text: '(2+1)/3',
      tooltip: 'Item 2/2 · Descriptor 1/1',
      ariaLabel: 'Item 2/2 · Descriptor 1/1',
      parts: [
        { id: 'item', label: 'Item', remaining: 2, total: 2, tone: 'item' },
        { id: 'descriptor', label: 'Descriptor', remaining: 1, total: 1, tone: 'descriptor' },
      ],
      total: 3,
      forceParentheses: false,
    },
    counterBadges: [
      {
        id: 'answered',
        label: '\u5df2\u7b54',
        kind: 'value',
        tone: 'progress',
        text: '3',
        value: 3,
        ariaLabel: '\u5df2\u7b54 3',
      },
    ],
    priorityBadge: {
      label: 'P',
      value: '12',
      priority: 12,
      ariaLabel: 'Priority 12',
    },
    breadcrumbs: [],
    toolbar: [
      { type: 'fullscreen', icon: '#iconFullscreen', ariaLabel: 'Fullscreen' },
      { type: 'edit-srs', icon: '#iconEdit', ariaLabel: 'Edit SRS' },
    ],
  };
}

function createMetaState(): ReviewUIState['meta'] {
  return {
    transition: 'slide-left',
    queueProgress: {
      queueType: 'retrieval-practice',
      queueLabel: 'retrieval',
      completed: 0,
      remaining: 3,
      total: 3,
    },
  };
}

describe('ReviewHeader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    reviewHeaderSiyuanMocks.showMessage.mockReset();
    (window as unknown as { siyuan?: unknown }).siyuan = {
      languages: {
        flashcard: {},
      },
    };
  });

  it('renders only the centered counter chip and reveals breakdown details on desktop hover', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        title: '提取练习',
        isMobile: false,
        mode: 'dialog',
      },
    });

    const summary = wrapper.get('.siyuanmemo-review-header__summary');
    const summaryWrap = wrapper.get('.siyuanmemo-review-header__summary-wrap');
    const brand = wrapper.get('.siyuanmemo-review-header__brand');
    expect(summary.text()).toBe('3');
    expect(brand.attributes('title')).toBe('提取练习');
    expect(wrapper.get('.siyuanmemo-review-header__brand-text').text()).toBe('提取练习');
    expect(summary.attributes('aria-label')).toBe('\u5269\u4f59 3\uff0c\u70b9\u51fb\u9690\u85cf\u5361\u7247\u6570\u91cf');
    expect(summary.attributes('title')).toContain('\u603b\u6570 3');
    expect(summary.attributes('title')).toContain('\u60ac\u505c\u67e5\u770b\u590d\u4e60\u8be6\u60c5');
    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(false);
    expect(wrapper.find('.siyuanmemo-review-header__priority').exists()).toBe(false);
    expect(wrapper.findAll('.siyuanmemo-review-header__badge')).toHaveLength(0);
    expect(wrapper.find('.siyuanmemo-review-header__title').exists()).toBe(false);

    await summaryWrap.trigger('mouseenter');

    const popover = wrapper.get('.siyuanmemo-review-header__popover');
    expect(popover.text()).toContain('\u590d\u4e60\u8be6\u60c5');
    expect(popover.text()).toContain('\u5df2\u7b54');
    expect(popover.text()).toContain('3');
    expect(popover.text()).toContain('Priority');
    expect(popover.text()).toContain('12');

    await summaryWrap.trigger('mouseleave');
    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(false);
  });

  it('exposes left and right desktop drag surfaces while keeping controls outside the drag hit layers', () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    expect(wrapper.find('.siyuanmemo-review-header__drag').exists()).toBe(false);
    expect(wrapper.get('.siyuanmemo-review-header__brand').classes()).toContain('resize__move');
    expect(wrapper.get('.siyuanmemo-review-header__brand').classes()).toContain('siyuanmemo-review-header__drag-zone');
    expect(wrapper.findAll('.siyuanmemo-review-header__drag-surface')).toHaveLength(2);
    expect(wrapper.find('.siyuanmemo-review-header__drag-surface--left').exists()).toBe(true);
    expect(wrapper.find('.siyuanmemo-review-header__drag-surface--right').exists()).toBe(true);

    const summary = wrapper.get('.siyuanmemo-review-header__summary');
    const toolbarButton = wrapper.get('.siyuanmemo-review-header__toolbar-button');

    expect(summary.classes()).not.toContain('resize__move');
    expect(toolbarButton.classes()).not.toContain('resize__move');
    expect(summary.element.closest('.siyuanmemo-review-header__drag-surface')).toBeNull();
    expect(toolbarButton.element.closest('.siyuanmemo-review-header__drag-surface')).toBeNull();
  });

  it('falls back from props.title to header.title and then stats.queueName for the brand text', () => {
    const header = createHeaderState();
    header.title = '神经漫游';
    header.stats.queueName = '提取练习';

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        meta: createMetaState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    expect(wrapper.get('.siyuanmemo-review-header__brand-text').text()).toBe('神经漫游');

    header.title = '';
    const wrapper2 = mount(ReviewHeader, {
      props: {
        header,
        meta: createMetaState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    expect(wrapper2.get('.siyuanmemo-review-header__brand-text').text()).toBe('提取练习');
  });

  it('closes the counter popover on Escape', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    await wrapper.get('.siyuanmemo-review-header__summary-wrap').trigger('mouseenter');
    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(false);
  });

  it('renders breakdown from summary parts when no live badges are provided', async () => {
    const header = createHeaderState();
    header.counterSummary = {
      kind: 'ratio',
      text: '(1+0+0+11)/12',
      tooltip: 'Item 1/1 · Descriptor 0/0 · Topic 0/0 · Concept 11/11',
      ariaLabel: 'Item 1/1 · Descriptor 0/0 · Topic 0/0 · Concept 11/11',
      parts: [
        { id: 'item', label: 'Item', remaining: 1, total: 1, tone: 'item' },
        { id: 'descriptor', label: 'Descriptor', remaining: 0, total: 0, tone: 'descriptor' },
        { id: 'topic', label: 'Topic', remaining: 0, total: 0, tone: 'topic' },
        { id: 'concept', label: 'Concept', remaining: 11, total: 11, tone: 'concept' },
      ],
      total: 12,
      forceParentheses: true,
    };
    header.counterBadges = [];

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        meta: {
          transition: 'slide-left',
          queueProgress: {
            queueType: 'incremental-learning',
            queueLabel: 'incremental',
            completed: 1,
            remaining: 12,
            total: 13,
          },
        },
        isMobile: false,
        mode: 'dialog',
      },
    });

    await wrapper.get('.siyuanmemo-review-header__summary-wrap').trigger('mouseenter');

    const counters = wrapper.findAll('.siyuanmemo-review-header__popover-counter');
    expect(counters).toHaveLength(4);
    expect(counters[1]?.text()).toContain('Descriptor');
    expect(counters[1]?.text()).toContain('0/0');
    expect(counters[2]?.text()).toContain('Topic');
    expect(counters[2]?.text()).toContain('0/0');
  });

  it('toggles desktop counter visibility with a SiYuan notice while preserving hover details', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    const summary = wrapper.get('.siyuanmemo-review-header__summary');
    const summaryWrap = wrapper.get('.siyuanmemo-review-header__summary-wrap');

    await summary.trigger('click');

    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(false);
    expect(summary.find('.siyuanmemo-review-header__summary-count').exists()).toBe(false);
    expect(summary.attributes('aria-label')).toBe('\u5361\u7247\u8ba1\u6570\u5df2\u9690\u85cf\uff0c\u70b9\u51fb\u663e\u793a\u5361\u7247\u6570\u91cf');
    expect(reviewHeaderSiyuanMocks.showMessage).toHaveBeenCalledWith('\u961f\u5217\u5361\u7247\u8fdb\u5ea6\u5df2\u9690\u85cf', 2800, 'info');
    expect(wrapper.find('.siyuanmemo-review-header__notice').exists()).toBe(false);

    await summaryWrap.trigger('mouseenter');
    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(true);

    await summaryWrap.trigger('mouseleave');
    await summary.trigger('click');

    expect(summary.find('.siyuanmemo-review-header__summary-count').exists()).toBe(true);
    expect(summary.text()).toContain('3');
    expect(reviewHeaderSiyuanMocks.showMessage).toHaveBeenLastCalledWith('\u961f\u5217\u5361\u7247\u8fdb\u5ea6\u5df2\u663e\u793a', 2800, 'info');
  });

  it('keeps tap-to-toggle counter details on mobile without hiding the count', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        isMobile: true,
        mode: 'dialog',
      },
    });

    const summary = wrapper.get('.siyuanmemo-review-header__summary');

    expect(summary.text()).toContain('3');

    await summary.trigger('click');

    expect(wrapper.find('.siyuanmemo-review-header__popover').exists()).toBe(true);
    expect(summary.find('.siyuanmemo-review-header__summary-count').exists()).toBe(true);
    expect(reviewHeaderSiyuanMocks.showMessage).not.toHaveBeenCalled();
  });

  it('renders close-review action in dedicated top-right slot on mobile dialog mode', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        isMobile: true,
        mode: 'dialog',
      },
    });

    expect(wrapper.findAll('.siyuanmemo-review-header__toolbar button[data-type="close-review"]')).toHaveLength(0);
    expect(wrapper.get('.siyuanmemo-review-header__mobile-close').attributes('data-type')).toBe('close-review');
    expect(wrapper.findAll('.siyuanmemo-review-header__summary')).toHaveLength(1);

    await wrapper.get('button[data-type="close-review"]').trigger('click');
    expect(wrapper.emitted('toolbar-action')?.[0]).toEqual(['close-review', expect.any(Object)]);
  });

  it('does not render close-review action on mobile tab mode', () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        meta: createMetaState(),
        isMobile: true,
        mode: 'tab',
      },
    });

    expect(wrapper.find('button[data-type="close-review"]').exists()).toBe(false);
  });

  it('renders toolbar button label when provided', () => {
    const header = createHeaderState();
    header.toolbar?.push({
      type: 'plan-review-scope',
      icon: '#iconFilter',
      label: 'Plan Scope',
      ariaLabel: 'Plan Scope',
    });

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        meta: createMetaState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    const button = wrapper.get('button[data-type="plan-review-scope"]');
    expect(button.text()).toContain('Plan Scope');
  });

  it('uses i18n labels for orbit review toolbar buttons', () => {
    const header = createHeaderState();
    header.toolbar?.push(
      { type: 'lock-focus', icon: '#iconLock', ariaLabel: 'Legacy Lock Focus' },
      { type: 'neural-focuses', icon: '#iconList', ariaLabel: 'Legacy Focus Menu' },
    );

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        meta: createMetaState(),
        i18n: {
          engineOrbit: 'Orbit',
          engineOrbitFull: 'Orbit Mode',
          engineOrbitIntro: 'Roam locally around orbit centers, concept cards, and nearby stations.',
          switchEngineMode: 'Switch Engine: {mode}',
          navModeFollow: 'Follow Path',
          navStatusFollow: 'Current: {mode} ({current}/{total})',
          addAnchor: 'Build Station',
          viewOrbitCenterList: 'View Orbit Center List',
          returnToBookmark: 'Return to Station',
        },
        navigationState: {
          engineMode: 'orbit',
          engineSessionId: 'engine-session-1',
          currentPathIndex: 2,
          navigationMode: 'follow',
          hasBookmark: true,
          pathLength: 10,
          currentNodeId: 'node-1',
          currentEventId: 'event-1',
          sessionId: 'session-1',
        },
      },
    });

    const engineButton = wrapper.get('button[data-type="neural-engine-mode"]');
    const navModeButton = wrapper.get('button[data-type="neural-nav-mode"]');
    const returnButton = wrapper.get('button[data-type="neural-return-bookmark"]');
    const lockFocusButton = wrapper.get('button[data-type="lock-focus"]');
    const focusMenuButton = wrapper.get('button[data-type="neural-focuses"]');
    const introStrip = wrapper.get('.siyuanmemo-review-header__nav-strip');
    const lockFocusIconUse = lockFocusButton.get('use');
    const lockFocusIcon = lockFocusIconUse.attributes('xlink:href') || lockFocusIconUse.attributes('href');

    expect(engineButton.attributes('aria-label')).toBe('Switch Engine: Orbit Mode');
    expect(engineButton.attributes('title')).toBe('Switch Engine: Orbit Mode');
    expect(introStrip.text()).toBe('Roam locally around orbit centers, concept cards, and nearby stations.');
    expect(navModeButton.attributes('aria-label')).toBe('Current: Follow Path (3/10)');
    expect(lockFocusButton.attributes('aria-label')).toBe('Build Station');
    expect(lockFocusButton.attributes('title')).toBe('Build Station');
    expect(lockFocusIcon).toBe('#iconPin');
    expect(focusMenuButton.attributes('aria-label')).toBe('View Orbit Center List');
    expect(focusMenuButton.attributes('title')).toBe('View Orbit Center List');
    expect(returnButton.attributes('aria-label')).toBe('Return to Station');
  });

  it('uses hyperspace-specific source list label in review toolbar', () => {
    const header = createHeaderState();
    header.toolbar?.push(
      { type: 'lock-focus', icon: '#iconLock', ariaLabel: 'Legacy Lock Focus' },
      { type: 'neural-focuses', icon: '#iconList', ariaLabel: 'Legacy Focus Menu' },
    );

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        meta: createMetaState(),
        i18n: {
          engineHyperspace: 'Hyperspace Expedition',
          engineHyperspaceFull: 'Hyperspace Expedition Mode',
          engineHyperspaceIntro: 'Propagate outward layer by layer from activation sources through links and optional tree relations.',
          switchEngineMode: 'Switch Engine: {mode}',
          navStatusFollow: 'Current: {mode} ({current}/{total})',
          navModeFollow: 'Follow Path',
          addAnchor: 'Build Station',
          viewActivationSourceList: 'View Activation Source List',
          returnToBookmark: 'Return to Station',
        },
        navigationState: {
          engineMode: 'hyperspace',
          engineSessionId: 'engine-session-2',
          currentPathIndex: 1,
          navigationMode: 'follow',
          hasBookmark: true,
          pathLength: 4,
          currentNodeId: 'node-2',
          currentEventId: 'event-2',
          sessionId: 'session-2',
        },
      },
    });

    const lockFocusButton = wrapper.get('button[data-type="lock-focus"]');
    const focusMenuButton = wrapper.get('button[data-type="neural-focuses"]');

    expect(lockFocusButton.attributes('aria-label')).toBe('Build Station');
    expect(focusMenuButton.attributes('aria-label')).toBe('View Activation Source List');
    expect(focusMenuButton.attributes('title')).toBe('View Activation Source List');
  });
});
