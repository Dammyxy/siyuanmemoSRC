import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NeuralFocusList from '../NeuralFocusList.vue';
import type { NeuralSourceListEntry } from '../types';

function entry(partial: Partial<NeuralSourceListEntry>): NeuralSourceListEntry {
  return {
    nodeId: 'node-1',
    nodePreview: 'Node preview',
    nodeKind: 'concept',
    role: 'orbit-center',
    priority: 1,
    addedAt: 100,
    visitedAt: 100,
    isVirtual: false,
    ...partial,
  };
}

describe('NeuralFocusList', () => {
  const entries: NeuralSourceListEntry[] = [
    entry({ nodeId: 'node-a', nodePreview: 'Alpha node', visitedAt: 300, isAnchored: true }),
    entry({ nodeId: 'node-b', nodePreview: 'Beta node', visitedAt: 200, isCurrent: true }),
  ];

  function mountComponent(engineMode: 'orbit' | 'hyperspace' = 'orbit') {
    return mount(NeuralFocusList, {
      props: {
        entries,
        engineMode,
      },
    });
  }

  it('emits preview on single click', async () => {
    const wrapper = mountComponent();

    await wrapper.find('.neural-list__item-main').trigger('click');

    expect(wrapper.emitted('preview')?.[0]).toEqual(['node-a']);
  });

  it('emits set-current-focus on double click and Enter', async () => {
    const wrapper = mountComponent();

    const firstItem = wrapper.find('.neural-list__item-main');
    await firstItem.trigger('dblclick');
    await firstItem.trigger('keydown.enter');

    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('set-current-focus')?.[1]).toEqual(['node-a']);
  });

  it('filters entries by search input', async () => {
    const wrapper = mountComponent();

    await wrapper.find('.neural-list__toolbar input').setValue('beta');

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain('Beta node');
  });

  it('renders orbit-specific title and emits row actions', async () => {
    const wrapper = mountComponent();

    expect(wrapper.text()).toContain('Orbit Centers');
    expect(wrapper.text()).toContain('Start points work as orbit centers in this mode.');

    const actions = wrapper.findAll('.neural-list__action');
    await actions[0].trigger('click');
    await actions[1].trigger('click');
    await actions[2].trigger('click');

    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('toggle-anchor')?.[0]).toEqual(['node-a', false]);
    expect(wrapper.emitted('toggle-source')?.[0]).toEqual(['node-a', false]);
  });

  it('switches wording in hyperspace mode', () => {
    const wrapper = mountComponent('hyperspace');

    expect(wrapper.text()).toContain('Activation Sources');
    expect(wrapper.text()).toContain('Start points work as activation sources in this mode.');
    expect(wrapper.findAll('.neural-list__action')[0].text()).toBe('Set as Primary Activation Source');
  });
});
