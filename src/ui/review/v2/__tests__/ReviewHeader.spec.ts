import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewHeader from '../ReviewHeader.vue';
import type { ReviewUIState } from '../types';

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

describe('ReviewHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { siyuan?: unknown }).siyuan = {
      languages: {
        flashcard: {},
      },
    };
  });

  it('renders compact summary chip, auxiliary badge, and priority badge', () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    expect(wrapper.findAll('.siyuanmemo-review-header__metric')).toHaveLength(0);

    const summary = wrapper.get('.siyuanmemo-review-header__summary');
    expect(summary.text()).toBe('(2+1)/3');
    expect(summary.attributes('aria-label')).toBe('Item 2/2 · Descriptor 1/1');
    expect(summary.attributes('title')).toBe('Item 2/2 · Descriptor 1/1');

    const badges = wrapper.findAll('.siyuanmemo-review-header__badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.text()).toContain('\u5df2\u7b54');
    expect(badges[0]?.text()).toContain('3');

    const priority = wrapper.get('.siyuanmemo-review-header__priority');
    expect(priority.text()).toContain('P');
    expect(priority.text()).toContain('12');
    expect(priority.attributes('style')).toContain('var(--b3-card-warning-color)');
  });

  it('renders fixed-slot incremental summary tooltip including zero values', () => {
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
        isMobile: false,
        mode: 'dialog',
      },
    });

    const summary = wrapper.get('.siyuanmemo-review-header__summary');
    expect(summary.text()).toBe('(1+0+0+11)/12');
    expect(summary.attributes('title')).toContain('Descriptor 0/0');
    expect(summary.attributes('title')).toContain('Topic 0/0');
  });

  it('renders value summary without neural path badge', () => {
    const header = createHeaderState();
    header.counterSummary = {
      kind: 'value',
      text: '40',
      tooltip: '\u5df2\u6f2b\u6e38 40 \u5f20\u5361',
      ariaLabel: '\u5df2\u6f2b\u6e38 40 \u5f20\u5361',
      value: 40,
    };
    header.counterBadges = [];

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        isMobile: false,
        mode: 'dialog',
      },
    });

    const summary = wrapper.get('.siyuanmemo-review-header__summary');
    expect(summary.text()).toBe('40');
    expect(summary.classes()).toContain('siyuanmemo-review-header__summary--value');
    expect(summary.attributes('title')).toBe('\u5df2\u6f2b\u6e38 40 \u5f20\u5361');
    expect(wrapper.findAll('.siyuanmemo-review-header__badge')).toHaveLength(0);
  });

  it('renders close-review action in dedicated top-right slot on mobile dialog mode', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
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
        isMobile: false,
        mode: 'dialog',
      },
    });

    const button = wrapper.get('button[data-type="plan-review-scope"]');
    expect(button.text()).toContain('Plan Scope');
  });

  it('uses i18n labels for neural navigation buttons', () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        i18n: {
          engineOrbit: 'Orbit',
          engineOrbitIntroLong: 'Roam locally around an orbit center through backlinks, direct references, indirect references, and descriptors near concept cards and anchors.',
          switchEngineMode: 'Switch Engine: {mode}',
          navModeFollow: 'Follow Path',
          navStatusFollow: 'Current: {mode} ({current}/{total})',
          returnToBookmark: 'Return to Anchor',
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

    expect(engineButton.attributes('aria-label')).toContain('Switch Engine: Orbit');
    expect(engineButton.attributes('aria-label')).toContain('Roam locally around an orbit center');
    expect(engineButton.attributes('title')).toContain('Roam locally around an orbit center');
    expect(navModeButton.attributes('aria-label')).toBe('Current: Follow Path (3/10)');
    expect(returnButton.attributes('aria-label')).toBe('Return to Anchor');
  });
});
