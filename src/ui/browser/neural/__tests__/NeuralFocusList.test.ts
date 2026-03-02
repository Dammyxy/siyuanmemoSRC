import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NeuralFocusList from '../NeuralFocusList.vue';
import type { NeuralListEntry } from '../types';

function entry(partial: Partial<NeuralListEntry>): NeuralListEntry {
  return {
    nodeId: 'node-1',
    focusId: 'focus-1',
    sessionId: 'session-1',
    associationType: 'focus',
    reason: 'focus',
    visitedAt: 100,
    isVirtual: false,
    nodePreview: 'Node preview',
    inPool: false,
    ...partial,
  };
}

describe('NeuralFocusList', () => {
  const sessionEntries: NeuralListEntry[] = [
    entry({ nodeId: 'node-a', nodePreview: 'Alpha node', visitedAt: 300, inPool: true }),
    entry({ nodeId: 'virtual-b', nodePreview: 'Virtual beta', visitedAt: 200, isVirtual: true, inPool: false }),
  ];

  const focusPoolEntries: NeuralListEntry[] = [
    entry({ nodeId: 'node-a', nodePreview: 'Alpha node', visitedAt: 300, inPool: true }),
    entry({ nodeId: 'node-c', nodePreview: 'Gamma worldline', visitedAt: 250, inPool: true }),
  ];

  function mountComponent() {
    return mount(NeuralFocusList, {
      props: {
        sessionEntries,
        focusPoolEntries,
        currentNodeId: null,
      },
    });
  }

  it('emits preview on single click', async () => {
    const wrapper = mountComponent();

    await wrapper.find('.neural-list__item-main').trigger('click');

    expect(wrapper.emitted('preview')).toBeTruthy();
    expect(wrapper.emitted('preview')?.[0]).toEqual(['node-a']);
  });

  it('emits jump on double click and Enter', async () => {
    const wrapper = mountComponent();

    const firstItem = wrapper.find('.neural-list__item-main');
    await firstItem.trigger('dblclick');
    await firstItem.trigger('keydown.enter');

    expect(wrapper.emitted('jump')).toBeTruthy();
    expect(wrapper.emitted('jump')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('jump')?.[1]).toEqual(['node-a']);
  });

  it('filters entries by search input', async () => {
    const wrapper = mount(NeuralFocusList, {
      props: {
        sessionEntries,
        focusPoolEntries: [],
        currentNodeId: null,
      },
    });

    await wrapper.find('.neural-list__toolbar input').setValue('virtual');

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles).toContain('Virtual beta');
    expect(titles).not.toContain('Alpha node');
  });

  it('defaults to current mainline and can switch to worldline view', async () => {
    const wrapper = mountComponent();

    expect(wrapper.text()).toContain('Alpha node');
    expect(wrapper.text()).toContain('Virtual beta');
    expect(wrapper.text()).not.toContain('Gamma worldline');

    await wrapper.find('[data-view="worldline"]').trigger('click');

    expect(wrapper.text()).toContain('Gamma worldline');
    expect(wrapper.text()).not.toContain('Virtual beta');
  });

  it('emits set-current-focus and toggle-pool for mainline entry', async () => {
    const wrapper = mountComponent();

    const startButtons = wrapper.findAll('[data-action="start-worldline"]');
    const toggleButtons = wrapper.findAll('[data-action="toggle-worldline"]');
    await startButtons[0].trigger('click');
    await toggleButtons[0].trigger('click');

    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('toggle-pool')?.[0]).toEqual(['node-a', false]);
  });

  it('emits toggle-pool for virtual node entry', async () => {
    const wrapper = mountComponent();

    const virtualToggle = wrapper.findAll('[data-action="toggle-worldline"]')[1];
    await virtualToggle.trigger('click');

    expect(wrapper.emitted('toggle-pool')?.[0]).toEqual(['virtual-b', true]);
  });

  it('shows clear-pool only in worldline view and emits clear-pool', async () => {
    const wrapper = mountComponent();

    expect(wrapper.find('[data-action="clear-worldline"]').exists()).toBe(false);
    await wrapper.find('[data-view="worldline"]').trigger('click');
    await wrapper.find('[data-action="clear-worldline"]').trigger('click');

    expect(wrapper.emitted('clear-pool')).toBeTruthy();
  });
});
