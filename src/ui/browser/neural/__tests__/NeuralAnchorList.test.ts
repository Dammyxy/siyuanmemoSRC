import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NeuralAnchorList from '../NeuralAnchorList.vue';
import type { NeuralAnchorListEntry } from '../types';

function entry(partial: Partial<NeuralAnchorListEntry>): NeuralAnchorListEntry {
  return {
    nodeId: 'anchor-1',
    nodePreview: 'Anchor preview',
    isVirtual: false,
    nodeKind: 'concept',
    priority: 1,
    addedAt: 100,
    visitedAt: 100,
    inHistory: true,
    ...partial,
  };
}

describe('NeuralAnchorList', () => {
  const entries: NeuralAnchorListEntry[] = [
    entry({ nodeId: 'anchor-a', nodePreview: 'Anchor A', visitedAt: 200, inHistory: false }),
    entry({ nodeId: 'anchor-b', nodePreview: 'Anchor B', visitedAt: 300, inHistory: true }),
  ];

  it('renders anchors in descending time order', () => {
    const wrapper = mount(NeuralAnchorList, {
      props: {
        entries,
      },
    });

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles[0]).toContain('Anchor B');
    expect(titles[1]).toContain('Anchor A');
  });

  it('emits preview and set-current-focus actions', async () => {
    const wrapper = mount(NeuralAnchorList, {
      props: {
        entries,
      },
    });

    const rowMain = wrapper.find('.neural-list__item-main');
    await rowMain.trigger('click');
    await rowMain.trigger('dblclick');

    const actions = wrapper.findAll('.neural-list__action');
    await actions[0].trigger('click');

    expect(wrapper.emitted('preview')?.[0]).toEqual(['anchor-b']);
    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['anchor-b']);
    expect(wrapper.emitted('set-current-focus')?.[1]).toEqual(['anchor-b']);
  });

  it('shows jump and remove-station actions with the correct availability', async () => {
    const wrapper = mount(NeuralAnchorList, {
      props: {
        entries,
        engineMode: 'orbit',
        currentNodeId: 'anchor-b',
      },
    });

    const rows = wrapper.findAll('.neural-anchor-list__item');
    const setOrbitCenterButton = rows[0].findAll('.neural-list__action')[0];
    const inPathJumpButton = rows[0].findAll('.neural-list__action')[1];
    const inPathRemoveButton = rows[0].findAll('.neural-list__action')[2];
    const notInPathJumpButton = rows[1].findAll('.neural-list__action')[1];
    const notInPathRemoveButton = rows[1].findAll('.neural-list__action')[2];

    expect(setOrbitCenterButton.attributes('aria-label')).toBe('Current Orbit Center');
    expect(setOrbitCenterButton.attributes('disabled')).toBeDefined();
    expect(inPathJumpButton.attributes('aria-label')).toBe('Jump in current path');
    expect(inPathRemoveButton.attributes('aria-label')).toBe('Remove Station');
    expect(notInPathJumpButton.attributes('aria-label')).toBe('Station is not in the current path');
    expect(notInPathRemoveButton.attributes('aria-label')).toBe('Remove Station');
    expect(inPathJumpButton.attributes('disabled')).toBeUndefined();
    expect(notInPathJumpButton.attributes('disabled')).toBeDefined();
    expect(inPathRemoveButton.attributes('disabled')).toBeUndefined();
    expect(notInPathRemoveButton.attributes('disabled')).toBeUndefined();

    await inPathJumpButton.trigger('click');
    await inPathRemoveButton.trigger('click');
    await notInPathRemoveButton.trigger('click');

    expect(wrapper.emitted('jump-anchor')?.[0]).toEqual(['anchor-b']);
    expect(wrapper.emitted('toggle-anchor')?.[0]).toEqual(['anchor-b', false]);
    expect(wrapper.emitted('toggle-anchor')?.[1]).toEqual(['anchor-a', false]);
  });
});
