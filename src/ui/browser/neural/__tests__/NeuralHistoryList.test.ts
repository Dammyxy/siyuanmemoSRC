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
    entry({ nodeId: 'node-a', nodePreview: 'Alpha history', sessionId: 'session-a', visitedAt: 300 }),
    entry({ nodeId: 'node-b', nodePreview: 'Beta history', sessionId: 'session-b', visitedAt: 200, isVirtual: true }),
  ];

  it('emits scope switch event', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        currentSessionId: 'session-a',
        scope: 'all',
      },
    });

    const buttons = wrapper.findAll('.neural-history-list__scope .b3-button');
    await buttons[0].trigger('click');

    expect(wrapper.emitted('update:scope')).toBeTruthy();
    expect(wrapper.emitted('update:scope')?.[0]).toEqual(['current']);
  });

  it('emits preview on click and jump on double click/Enter', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        currentSessionId: 'session-a',
        scope: 'current',
      },
    });

    const row = wrapper.find('.neural-list__item-main');
    await row.trigger('click');
    await row.trigger('dblclick');
    await row.trigger('keydown.enter');

    expect(wrapper.emitted('preview')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('jump')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('jump')?.[1]).toEqual(['node-a']);
  });

  it('filters history list by search input', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        currentSessionId: 'session-a',
        scope: 'all',
      },
    });

    await wrapper.find('.neural-history-list__toolbar input').setValue('beta');

    const titles = wrapper.findAll('.neural-list__title').map((item) => item.text());
    expect(titles).toContain('Beta history');
    expect(titles).not.toContain('Alpha history');
  });

  it('supports collapsing session groups', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        currentSessionId: 'session-a',
        scope: 'all',
      },
    });

    const beforeCount = wrapper.findAll('.neural-list__items .neural-list__item').length;
    expect(beforeCount).toBe(2);

    await wrapper.find('.neural-history-list__collapse').trigger('click');

    const afterCount = wrapper.findAll('.neural-list__items .neural-list__item').length;
    expect(afterCount).toBe(1);
  });
});
