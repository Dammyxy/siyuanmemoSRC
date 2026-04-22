// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BrowserHierarchy from '../BrowserHierarchy.vue';

vi.mock('../browserService', () => ({
  getDocTree: vi.fn(async () => []),
}));

describe('BrowserHierarchy global scopes', () => {
  it('renders only all and suspended global scopes after removing the missing-block entry', async () => {
    const wrapper = mount(BrowserHierarchy, {
      props: {
        cards: [],
        queues: { active: '', counts: {} },
        globalStats: { total: 12, dismissed: 2, lost: 3 },
        i18n: {
          all: 'All',
          allFlashcards: 'All flashcards',
          filterPresetSuspended: 'Suspended',
          queues: 'Queues',
          documents: 'Documents',
        },
      },
    });

    const items = wrapper.findAll('.b3-list-item').map((item) => item.text());
    expect(items).toContain('All flashcards12');
    expect(items).toContain('Suspended2');
    expect(wrapper.text()).not.toContain('Missing blocks');
    expect(wrapper.text()).not.toContain('3');
  });
});
