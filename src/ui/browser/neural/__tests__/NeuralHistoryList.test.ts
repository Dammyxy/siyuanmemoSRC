import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NeuralHistoryList from '../NeuralHistoryList.vue';
import type { NeuralListEntry } from '../types';

function entry(partial: Partial<NeuralListEntry>): NeuralListEntry {
  return {
    eventId: 'event-1',
    nodeId: 'node-1',
    focusId: 'focus-1',
    sessionId: 'session-1',
    associationType: 'focus',
    reason: 'focus',
    visitedAt: 100,
    isVirtual: false,
    nodePreview: 'Node preview',
    traceQuality: 'exact',
    sourceNodeId: null,
    sourceEventId: null,
    branchRootNodeId: 'focus-1',
    activationKind: 'focus-root',
    ...partial,
  };
}

describe('NeuralHistoryList', () => {
  const entries: NeuralListEntry[] = [
    entry({ eventId: 'event-a', nodeId: 'node-a', nodePreview: 'Alpha history', visitedAt: 200 }),
    entry({ eventId: 'event-b', nodeId: 'node-b', nodePreview: 'Beta history', visitedAt: 300, isAnchored: true, isVirtual: true }),
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
    expect(wrapper.find('.neural-history-list__content').exists()).toBe(true);
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

    const rows = wrapper.findAll('.neural-history-list__timeline-item');
    const secondRowActions = rows[1].findAll('.neural-list__action');
    await secondRowActions[0].trigger('click');
    await secondRowActions[1].trigger('click');

    expect(wrapper.emitted('set-current-focus')?.[0]).toEqual(['node-a']);
    expect(wrapper.emitted('toggle-anchor')?.[0]).toEqual(['node-a', true]);
  });

  it('shows Orbit action labels by anchor state', () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        engineMode: 'orbit',
        currentNodeId: 'node-b',
      },
    });

    const rows = wrapper.findAll('.neural-history-list__timeline-item');
    const firstRowActions = rows[0].findAll('.neural-list__action');
    const secondRowActions = rows[1].findAll('.neural-list__action');

    expect(firstRowActions[0].attributes('aria-label')).toBe('Current Orbit Center');
    expect(firstRowActions[0].attributes('disabled')).toBeDefined();
    expect(firstRowActions[1].text()).toBe('\u2605');
    expect(secondRowActions[1].text()).toBe('\u2606');
    expect(secondRowActions[0].attributes('aria-label')).toBe('Set as Current Orbit Center');
    expect(firstRowActions[1].attributes('aria-label')).toBe('Remove Station');
    expect(secondRowActions[1].attributes('aria-label')).toBe('Build Station');
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

  it('shows repeat-hit count tags for nodes that were activated multiple times', () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries: [
          entry({
            eventId: 'event-repeat-a',
            nodeId: 'node-repeat',
            nodePreview: 'Repeated node',
            visitedAt: 200,
            repeatHitCount: 2,
          }),
          entry({
            eventId: 'event-repeat-b',
            nodeId: 'node-repeat',
            nodePreview: 'Repeated node',
            visitedAt: 100,
            repeatHitCount: 2,
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain('2 hits');
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

  it('emits load-more when the older-history button is clicked', async () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries,
        hasMore: true,
      },
    });

    await wrapper.find('.neural-history-list__load-more').trigger('click');
    expect(wrapper.emitted('load-more')?.[0]).toEqual([]);
  });

  it('window-renders large history lists instead of mounting every row', () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries: Array.from({ length: 5000 }, (_, index) => entry({
          eventId: `event-${index}`,
          nodeId: `node-${index}`,
          nodePreview: `History ${index}`,
          visitedAt: 10_000 - index,
        })),
      },
    });

    const renderedRows = wrapper.findAll('.neural-history-list__timeline-item');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(80);
  });

  it('hides internal graph-edge labels while keeping concrete relation labels', () => {
    const wrapper = mount(NeuralHistoryList, {
      props: {
        entries: [
          entry({
            eventId: 'event-graph',
            nodeId: 'node-graph',
            nodePreview: 'Graph node',
            associationType: 'element-link',
            activationKind: 'graph-edge',
            origin: 'backlink',
          }),
        ],
      },
    });

    const meta = wrapper.find('.neural-list__meta').text();
    expect(meta).toContain('Block Link');
    expect(meta).toContain('Backlink');
    expect(meta).not.toContain('Graph Edge Activation');
    expect(meta).not.toContain('Tree Edge Activation');
  });
});
