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
    ...partial,
  };
}

describe('NeuralFocusList', () => {
  const sessionEntries: NeuralListEntry[] = [
    entry({ nodeId: 'node-a', nodePreview: 'Alpha node', visitedAt: 300, pinned: true }),
    entry({ nodeId: 'node-b', nodePreview: 'Beta node', visitedAt: 200 }),
  ];

  const pinnedEntries: NeuralListEntry[] = [
    entry({ nodeId: 'node-a', nodePreview: 'Alpha node', visitedAt: 300, pinned: true }),
  ];

  it('emits preview on single click', async () => {
    const wrapper = mount(NeuralFocusList, {
      props: {
        sessionEntries,
        pinnedEntries,
        currentNodeId: null,
      },
    });

    await wrapper.find('.neural-list__item-main').trigger('click');

    expect(wrapper.emitted('preview')).toBeTruthy();
    expect(wrapper.emitted('preview')?.[0]).toEqual(['node-a']);
  });

  it('emits jump on double click and Enter', async () => {
    const wrapper = mount(NeuralFocusList, {
      props: {
        sessionEntries,
        pinnedEntries,
        currentNodeId: null,
      },
    });

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
        pinnedEntries: [],
        currentNodeId: null,
      },
    });

    await wrapper.find('.neural-list__toolbar input').setValue('beta');

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles).toContain('Beta node');
    expect(titles).not.toContain('Alpha node');
  });

  it('emits toggle-pin when pin button is clicked', async () => {
    const wrapper = mount(NeuralFocusList, {
      props: {
        sessionEntries,
        pinnedEntries,
        currentNodeId: null,
      },
    });

    const pinButton = wrapper.find('.neural-list__pin');
    await pinButton.trigger('click');

    expect(wrapper.emitted('toggle-pin')).toBeTruthy();
    expect(wrapper.emitted('toggle-pin')?.[0]).toEqual(['node-a', false]);
  });
});
