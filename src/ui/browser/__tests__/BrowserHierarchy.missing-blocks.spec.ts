// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BrowserHierarchy from '../BrowserHierarchy.vue';

vi.mock('../browserService', () => ({
  getDocTree: vi.fn(async () => []),
}));

describe('BrowserHierarchy missing-block scope', () => {
  it('renders the missing-block pseudo node with count and active state', async () => {
    const wrapper = mount(BrowserHierarchy, {
      props: {
        cards: [],
        queues: { active: '', counts: {} },
        globalStats: { total: 12, dismissed: 2, lost: 3 },
        activeDocId: '__lost__',
        i18n: {
          all: 'All',
          allFlashcards: 'All flashcards',
          filterPresetSuspended: 'Suspended',
          missingBlocks: 'Missing blocks',
          queues: 'Queues',
          documents: 'Documents',
        },
      },
    });

    const focused = wrapper.find('.b3-list-item--focus');
    expect(focused.text()).toContain('Missing blocks');
    expect(focused.text()).toContain('3');

    await focused.trigger('click');
    expect(wrapper.emitted('selectDoc')?.[0]).toEqual(['__lost__']);
  });
});
