// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MobileReviewLauncher from '../MobileReviewLauncher.vue';

describe('MobileReviewLauncher', () => {
  it('renders queues with counts and emits queue selection', async () => {
    const wrapper = mount(MobileReviewLauncher, {
      props: {
        i18n: {
          mobileReviewLauncherTitle: 'Choose Review Queue',
        },
        counts: {
          retrieval: 5,
          'incremental-learning': 4,
          'final-drill': 3,
          'neural-roam': 2,
          'filter-group': 1,
        },
      },
    });

    expect(wrapper.text()).toContain('Choose Review Queue');
    expect(wrapper.findAll('.mobile-review-launcher__queue-card')).toHaveLength(5);

    await wrapper.findAll('.mobile-review-launcher__queue-card')[0].trigger('click');
    expect(wrapper.emitted('openQueue')?.[0]).toEqual(['retrieval']);
  });

  it('emits openBrowser and close events', async () => {
    const wrapper = mount(MobileReviewLauncher);
    const actions = wrapper.findAll('.mobile-review-launcher__action');

    await actions[0].trigger('click');
    await actions[1].trigger('click');

    expect(wrapper.emitted('openBrowser')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
