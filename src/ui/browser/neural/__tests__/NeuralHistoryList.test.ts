import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NeuralHistoryList from '../NeuralHistoryList.vue';
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

describe('NeuralHistoryList', () => {
  const entries: NeuralListEntry[] = [
    entry({ nodeId: 'node-a', nodePreview: 'Alpha history', visitedAt: 200 }),
    entry({ nodeId: 'node-b', nodePreview: 'Beta history', visitedAt: 300, isAnchored: true, isVirtual: true }),
  ];

  it('renders timeline in descending time order (latest on top)', () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        currentNodeId: 'node-b',
      },
    });

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles[0]).toContain('Beta history');
    expect(titles[1]).toContain('Alpha history');
    expect(wrapper.find('.neural-history-list__direction').exists()).toBe(true);
  });

  it('emits preview on click and jump on double click/Enter', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        currentNodeId: 'node-b',
      },
    });

    const row = wrapper.find('.neural-list__item-main');
    await row.trigger('click');
    await row.trigger('dblclick');
    await row.trigger('keydown.enter');

    expect(wrapper.emitted('preview')?.[0]).toEqual(['node-b']);
    expect(wrapper.emitted('jump')?.[0]).toEqual(['node-b']);
    expect(wrapper.emitted('jump')?.[1]).toEqual(['node-b']);
  });

  it('emits set-current-focus and toggle-anchor row actions', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
      },
    });

    const actions = wrapper.findAll('.neural-list__action');
    await actions[0].trigger('click');
    await actions[1].trigger('click');

    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['node-b']);
    expect(wrapper.emitted('toggle-anchor')?.[0]).toEqual(['node-b', false]);
  });

  it('shows star icon and aria-label by anchor state', () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
      },
    });

    const rows = wrapper.findAll('.neural-history-list__timeline-item');
    const firstRowActions = rows[0].findAll('.neural-list__action');
    const secondRowActions = rows[1].findAll('.neural-list__action');

    expect(firstRowActions[1].text()).toBe('★');
    expect(secondRowActions[1].text()).toBe('☆');
    expect(firstRowActions[1].attributes('aria-label')).toBe('Unstar');
    expect(secondRowActions[1].attributes('aria-label')).toBe('Star');
  });

  it('filters entries by search input', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
      },
    });

    await wrapper.find('.neural-history-list__toolbar input').setValue('alpha');

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain('Alpha history');
  });

  it('emits clear-history without scope payload', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
      },
    });

    await wrapper.find('.neural-list__toolbar-action').trigger('click');
    expect(wrapper.emitted('clear-history')?.[0]).toEqual([]);
  });
});
