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
    entry({ nodeId: 'node-a', nodePreview: 'Alpha node', visitedAt: 300 }),
    entry({ nodeId: 'node-b', nodePreview: 'Beta node', visitedAt: 200, isCurrent: true }),
  ];

  function mountComponent(
    engineMode: 'orbit' | 'hyperspace' = 'orbit',
    selectedNodeId: string | null = null,
  ) {
    return mount(NeuralFocusList, {
      props: {
        entries,
        engineMode,
        selectedNodeId,
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

  it('renders a compact search label without placeholder copy', () => {
    const wrapper = mountComponent();

    expect(wrapper.find('.neural-focus-list__search-label').text()).toBe('搜索：');
    expect(wrapper.find('.neural-list__toolbar input').attributes('placeholder')).toBe('');
  });

  it('renders orbit-specific title and emits row actions', async () => {
    const wrapper = mountComponent();

    expect(wrapper.text()).toContain('Orbit Centers');
    expect(wrapper.text()).toContain('Orbit centers work as the current observation center in this mode.');
    expect(wrapper.text()).not.toContain('Station');

    const firstRowActions = wrapper.findAll('.neural-list__item')[0]?.findAll('.neural-list__action') || [];
    await firstRowActions[0]?.trigger('click');
    await firstRowActions[1]?.trigger('click');

    expect(firstRowActions).toHaveLength(2);
    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('toggle-source')?.[0]).toEqual(['node-a', false]);
  });

  it('switches wording in hyperspace mode', () => {
    const wrapper = mountComponent('hyperspace');

    expect(wrapper.text()).toContain('Activation Sources');
    expect(wrapper.text()).toContain('Activation sources work as propagation roots in this mode.');
    expect(wrapper.findAll('.neural-list__action')[0].text()).toBe('Set as Primary Activation Source');
  });

  it('renders current row as disabled current center action', () => {
    const wrapper = mountComponent();

    const secondRowActions = wrapper.findAll('.neural-list__item')[1]?.findAll('.neural-list__action') || [];
    expect(secondRowActions[0]?.text()).toBe('Current Orbit Center');
    expect(secondRowActions[0]?.attributes('disabled')).toBeDefined();
  });

  it('renders current row as disabled current primary activation source action', () => {
    const wrapper = mountComponent('hyperspace');

    const secondRowActions = wrapper.findAll('.neural-list__item')[1]?.findAll('.neural-list__action') || [];
    expect(secondRowActions[0]?.text()).toBe('Current Primary Activation Source');
    expect(secondRowActions[0]?.attributes('disabled')).toBeDefined();
  });

  it('marks the externally selected node row', () => {
    const wrapper = mountComponent('orbit', 'node-a');

    expect(wrapper.findAll('.neural-list__item')[0]?.classes()).toContain('neural-list__item--selected');
    expect(wrapper.findAll('.neural-list__item')[1]?.classes()).not.toContain('neural-list__item--selected');
  });
});
