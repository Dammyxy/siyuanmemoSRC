import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewHeader from '../ReviewHeader.vue';
import type { ReviewUIState } from '../types';

function createHeaderState(): ReviewUIState['header'] {
  return {
    stats: {
      current: 1,
      total: 10,
      label: '',
      queueName: 'retrieval',
      newCards: 3,
      reviewCards: 7,
      currentNewCards: 1,
      currentReviewCards: 0,
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
    (window as Window & { siyuan?: unknown }).siyuan = {
      languages: {
        flashcard: {},
      },
    };
  });

  it('renders close-review action in dedicated top-right slot on mobile dialog mode', async () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        isMobile: true,
        mode: 'dialog',
      },
    });

    expect(wrapper.find('.siyuanmemo-review-header__toolbar button[data-type="close-review"]').exists()).toBe(false);
    expect(wrapper.get('.siyuanmemo-review-header__mobile-close').attributes('data-type')).toBe('close-review');

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

  it('does not render close-review action on desktop', () => {
    const wrapper = mount(ReviewHeader, {
      props: {
        header: createHeaderState(),
        isMobile: false,
        mode: 'dialog',
      },
    });

    expect(wrapper.find('button[data-type="close-review"]').exists()).toBe(false);
  });

  it('renders toolbar button label when provided', () => {
    const header = createHeaderState();
    header.toolbar?.push({
      type: 'plan-review-scope',
      icon: '#iconFilter',
      label: '规划复习范围',
      ariaLabel: '规划复习范围',
    });

    const wrapper = mount(ReviewHeader, {
      props: {
        header,
        isMobile: false,
        mode: 'dialog',
      },
    });

    const button = wrapper.get('button[data-type="plan-review-scope"]');
    expect(button.text()).toContain('规划复习范围');
  });
});
