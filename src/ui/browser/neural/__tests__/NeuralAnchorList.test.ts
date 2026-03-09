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

  it('disables jump-anchor action when anchor is not in current path', async () => {
    const wrapper = mount(NeuralAnchorList, {
      props: {
        entries,
        engineMode: 'orbit',
      },
    });

    const rows = wrapper.findAll('.neural-anchor-list__item');
    const setOrbitCenterButton = rows[0].findAll('.neural-list__action')[0];
    const inPathJumpButton = rows[0].findAll('.neural-list__action')[1];
    const notInPathJumpButton = rows[1].findAll('.neural-list__action')[1];

    expect(setOrbitCenterButton.attributes('aria-label')).toBe('Set as Orbit Center');
    expect(inPathJumpButton.attributes('aria-label')).toBe('Jump in current path');
    expect(notInPathJumpButton.attributes('aria-label')).toBe('Anchor is not in current path');
    expect(inPathJumpButton.attributes('disabled')).toBeUndefined();
    expect(notInPathJumpButton.attributes('disabled')).toBeDefined();

    await inPathJumpButton.trigger('click');
    expect(wrapper.emitted('jump-anchor')?.[0]).toEqual(['anchor-b']);
  });
});
