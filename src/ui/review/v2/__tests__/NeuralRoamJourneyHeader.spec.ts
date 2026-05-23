import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuralRoamJourneyHeader from '../NeuralRoamJourneyHeader.vue';
import type { NeuralNavigationState, NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import type { ReviewHeaderRouteControl, ReviewUIState } from '../types';

function createNavigationState(engineMode: 'orbit' | 'hyperspace'): NeuralNavigationState {
  return {
    currentPathIndex: 2,
    currentNodeId: engineMode === 'orbit' ? 'neutron-star' : 'stellar-evolution',
    currentEventId: 'event-1',
    navigationMode: engineMode === 'orbit' ? 'follow' : 'explore',
    engineMode,
    engineSessionId: 'engine-session',
    hasBookmark: true,
    pathLength: 8,
    sessionId: 'session-1',
  };
}

function createBatch(engineMode: 'orbit' | 'hyperspace'): NeuralRoamBatchSnapshot {
  const navigationState = createNavigationState(engineMode);
  return {
    kind: engineMode === 'orbit' ? 'orbit-round' : 'hyperspace-current-node',
    engineMode,
    navigationState,
    focusNodeId: navigationState.currentNodeId,
    focusNodePreview: engineMode === 'orbit' ? '[[中子星]]' : '[[恒星演化]]',
    currentNodeId: navigationState.currentNodeId,
    roundSize: engineMode === 'orbit' ? 5 : 5,
    viewedCount: engineMode === 'orbit' ? 3 : 2,
    remainingCount: engineMode === 'orbit' ? 2 : 3,
    roundNodes: engineMode === 'orbit'
      ? [
          {
            eventId: 'orbit-event-1',
            nodeId: 'neutron-star',
            nodePreview: '[[中子星]]',
            isVirtual: false,
            associationType: 'orbit-center',
            reason: '当前中心',
            visitedAt: 1,
            sourceNodeId: 'source-star',
            sourceEventId: 'source-event-1',
          },
          {
            eventId: 'orbit-event-2',
            nodeId: 'white-dwarf',
            nodePreview: '[[白矮星]]',
            isVirtual: false,
            associationType: 'orbit-center',
            reason: '邻接轮次',
            visitedAt: 2,
            sourceNodeId: 'source-star',
            sourceEventId: 'source-event-2',
          },
        ]
      : [],
    recentPath: engineMode === 'hyperspace'
      ? [
          {
            eventId: 'path-event-1',
            nodeId: 'stellar-evolution',
            cardId: null,
            nodePreview: '[[恒星演化]]',
            isVirtual: false,
            associationType: 'activation-source',
            reason: '激活源',
            visitedAt: 1,
            sourceNodeId: null,
            sourceEventId: null,
            sourceRole: 'activation-source',
            origin: 'seed',
            traceQuality: 'exact',
            depth: 0,
            conductionScore: 1,
          },
          {
            eventId: 'path-event-2',
            nodeId: 'red-giant',
            cardId: null,
            nodePreview: '[[红巨星]]',
            isVirtual: false,
            associationType: 'activation-source',
            reason: '传播中继',
            visitedAt: 2,
            sourceNodeId: 'stellar-evolution',
            sourceEventId: 'path-event-1',
            sourceRole: 'activation-source',
            origin: 'propagation',
            traceQuality: 'exact',
            depth: 1,
            conductionScore: 0.6,
          },
        ]
      : [],
    sourceSnapshot: engineMode === 'hyperspace'
      ? [
          { nodeId: 'stellar-evolution', nodePreview: '[[恒星演化]]', nodeKind: 'concept', role: 'activation-source', priority: 0.9, addedAt: 1, visitedAt: 1 },
          { nodeId: 'red-giant', nodePreview: '[[红巨星]]', nodeKind: 'concept', role: 'activation-source', priority: 0.6, addedAt: 1, visitedAt: 1 },
          { nodeId: 'supernova', nodePreview: '[[超新星]]', nodeKind: 'concept', role: 'activation-source', priority: 0.6, addedAt: 1, visitedAt: 1 },
        ]
      : [{ nodeId: 'neutron-star', nodePreview: '[[中子星]]', nodeKind: 'concept', role: 'orbit-center', priority: 0.9, addedAt: 1, visitedAt: 1 }],
    seedSnapshot: [],
    anchorSnapshot: [],
  };
}

function createRouteControl(): ReviewHeaderRouteControl {
  return {
    label: '航线',
    name: '默认航线',
    detail: '概念 12 · 空间站 3 · 日志 48',
    temporary: false,
  };
}

function createHeader(): ReviewUIState['header'] {
  return {
    title: '神经漫游',
    stats: {
      current: 3,
      total: 5,
      label: '已看 3 / 本轮总数 5',
      queueName: '神经漫游',
    },
    counterSummary: null,
    counterBadges: [],
    priorityBadge: {
      label: 'P',
      value: '-',
      priority: null,
      ariaLabel: 'Priority -',
    },
    breadcrumbs: [],
    toolbar: [
      { type: 'ai-sidebar', icon: '#iconSparkles', ariaLabel: 'AI' },
      { type: 'lock-focus', icon: '#iconPin', ariaLabel: '设为空间站' },
      { type: 'neural-focuses', icon: '#iconList', ariaLabel: '来源列表' },
      { type: 'neural-history', icon: '#iconHistory', ariaLabel: '航线日志' },
      { type: 'more', icon: '#iconMore', ariaLabel: '更多' },
    ],
  };
}

describe('NeuralRoamJourneyHeader', () => {
  it('renders orbit route identity and round progress as a dedicated instrument', async () => {
    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header: createHeader(),
        routeControl: createRouteControl(),
        navigationState: createNavigationState('orbit'),
        batch: createBatch('orbit'),
        i18n: {
          engineOrbit: 'Orbit / 轨道',
          engineHyperspace: 'Hyperspace / 超空间',
          navModeFollow: 'Follow Path',
        },
      },
    });

    expect(wrapper.text()).toContain('航线');
    expect(wrapper.text()).toContain('默认航线');
    expect(wrapper.text()).toContain('概念 12 · 空间站 3 · 日志 48');
    expect(wrapper.text()).toContain('Orbit');
    expect(wrapper.text()).toContain('当前中心');
    expect(wrapper.text()).toContain('[[中子星]]');
    expect(wrapper.text()).toContain('3 / 5');
    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(false);

    await wrapper.get('.siyuanmemo-neural-journey__compact').trigger('click');

    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(true);
    expect(wrapper.text()).toContain('当前中心');
    expect(wrapper.text()).toContain('本轮');
    expect(wrapper.text()).toContain('已看');
    expect(wrapper.text()).toContain('剩余');
    expect(wrapper.text()).toContain('轨道轮次');
    expect(wrapper.text()).toContain('[[中子星]]');
    expect(wrapper.text()).toContain('来源节点 source-star');
    expect(wrapper.findAll('.siyuanmemo-neural-journey__dot--filled')).toHaveLength(3);
    expect(wrapper.findAll('.siyuanmemo-neural-journey__dot')).toHaveLength(5);
  });

  it('uses the live review header counter instead of stale batch counts', () => {
    const header = createHeader();
    header.stats = {
      current: 1,
      total: 5,
      label: '已看 4 / 本轮总数 5',
      queueName: '神经漫游',
    };
    header.counterSummary = {
      kind: 'value',
      label: '已看',
      text: '4',
      value: 4,
      tooltip: '已看 4 / 本轮总数 5',
      ariaLabel: '已看 4 / 本轮总数 5',
    };
    const staleBatch = {
      ...createBatch('orbit'),
      viewedCount: 0,
      roundSize: 9,
      remainingCount: 9,
    };

    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header,
        routeControl: createRouteControl(),
        navigationState: createNavigationState('orbit'),
        batch: staleBatch,
      },
    });

    expect(wrapper.text()).toContain('4 / 5');
    expect(wrapper.findAll('.siyuanmemo-neural-journey__dot--filled')).toHaveLength(4);
    expect(wrapper.findAll('.siyuanmemo-neural-journey__dot')).toHaveLength(5);
  });

  it('reacts to refreshed review header counters without replacing the batch snapshot', async () => {
    const header = createHeader();
    header.stats = {
      current: 2,
      total: 5,
      label: '已看 3 / 本轮总数 5',
      queueName: '神经漫游',
    };
    header.counterSummary = {
      kind: 'value',
      label: '已看',
      text: '3',
      value: 3,
      tooltip: '已看 3 / 本轮总数 5',
      ariaLabel: '已看 3 / 本轮总数 5',
    };
    const staleBatch = {
      ...createBatch('orbit'),
      viewedCount: 0,
      roundSize: 9,
      remainingCount: 9,
    };

    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header,
        routeControl: createRouteControl(),
        navigationState: createNavigationState('orbit'),
        batch: staleBatch,
      },
    });

    expect(wrapper.text()).toContain('3 / 5');

    await wrapper.setProps({
      header: {
        ...header,
        stats: {
          current: 1,
          total: 5,
          label: '已看 4 / 本轮总数 5',
          queueName: '神经漫游',
        },
        counterSummary: {
          ...header.counterSummary,
          text: '4',
          value: 4,
          tooltip: '已看 4 / 本轮总数 5',
          ariaLabel: '已看 4 / 本轮总数 5',
        },
      },
    });

    expect(wrapper.text()).toContain('4 / 5');
    expect(wrapper.findAll('.siyuanmemo-neural-journey__dot--filled')).toHaveLength(4);
  });

  it('uses resolved batch progress when orbit focus changes before the header counter refreshes', () => {
    const header = createHeader();
    header.stats = {
      current: 1,
      total: 5,
      label: '已看 4 / 本轮总数 5',
      queueName: '神经漫游',
    };
    header.counterSummary = {
      kind: 'value',
      label: '已看',
      text: '4',
      value: 4,
      tooltip: '已看 4 / 本轮总数 5',
      ariaLabel: '已看 4 / 本轮总数 5',
    };
    const newFocusBatch = {
      ...createBatch('orbit'),
      focusNodeId: 'new-center',
      focusNodePreview: '[[新中心]]',
      viewedCount: 0,
      roundSize: 5,
      remainingCount: 5,
    };

    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header,
        routeControl: createRouteControl(),
        navigationState: createNavigationState('orbit'),
        batch: newFocusBatch,
        progress: {
          viewedCount: 0,
          totalCount: 5,
          remainingCount: 5,
        },
      },
    });

    expect(wrapper.text()).toContain('[[新中心]]');
    expect(wrapper.text()).toContain('0 / 5');
    expect(wrapper.findAll('.siyuanmemo-neural-journey__dot--filled')).toHaveLength(0);
  });

  it('renders hyperspace activation sources and depth progress as a dedicated instrument', async () => {
    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header: createHeader(),
        routeControl: createRouteControl(),
        navigationState: createNavigationState('hyperspace'),
        batch: createBatch('hyperspace'),
        i18n: {
          engineOrbit: 'Orbit / 轨道',
          engineHyperspace: 'Hyperspace / 超空间',
          navModeExplore: 'Free Roam',
        },
      },
    });

    expect(wrapper.text()).toContain('Hyperspace');
    expect(wrapper.text()).toContain('激活源');
    expect(wrapper.text()).toContain('[[恒星演化]] +2');
    expect(wrapper.text()).toContain('2 / 5');
    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(false);

    await wrapper.get('.siyuanmemo-neural-journey__compact').trigger('click');

    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(true);
    expect(wrapper.text()).toContain('概念卡：激活源');
    expect(wrapper.text()).toContain('当前深度');
    expect(wrapper.text()).toContain('最大深度');
    expect(wrapper.text()).toContain('传播链路');
    expect(wrapper.text()).toContain('来源角色');
    expect(wrapper.text()).toContain('深度 1');
    expect(wrapper.findAll('.siyuanmemo-neural-journey__depth-node--done')).toHaveLength(3);
    expect(wrapper.find('.siyuanmemo-neural-journey__depth-node--current').text()).toBe('2');
  });

  it('expands and collapses when the header body is clicked', async () => {
    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header: createHeader(),
        routeControl: createRouteControl(),
        navigationState: createNavigationState('orbit'),
        batch: createBatch('orbit'),
      },
    });

    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(false);

    await wrapper.get('.siyuanmemo-neural-journey__compact').trigger('click');
    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(true);

    await wrapper.get('.siyuanmemo-neural-journey__toggle').trigger('click');
    expect(wrapper.find('.siyuanmemo-neural-journey__popover').exists()).toBe(false);
  });

  it('emits direct engine mode selection from the dedicated header controls', async () => {
    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header: createHeader(),
        routeControl: createRouteControl(),
        navigationState: createNavigationState('hyperspace'),
        batch: createBatch('hyperspace'),
      },
    });

    await wrapper.get('[data-type="neural-engine-mode"]').trigger('click');

    expect(wrapper.emitted('engine-mode-select')?.flat()).toEqual(['orbit']);
    expect(wrapper.emitted('toolbar-action')).toBeUndefined();
  });

  it('emits existing toolbar action names from the dedicated header controls', async () => {
    const wrapper = mount(NeuralRoamJourneyHeader, {
      props: {
        header: createHeader(),
        routeControl: createRouteControl(),
        navigationState: createNavigationState('orbit'),
        batch: createBatch('orbit'),
      },
    });

    await wrapper.get('[data-type="neural-nav-mode"]').trigger('click');
    await wrapper.get('[data-type="lock-focus"]').trigger('click');
    await wrapper.get('[data-type="neural-history"]').trigger('click');

    expect(wrapper.emitted('toolbar-action')?.map(([type]) => type)).toEqual([
      'neural-nav-mode',
      'lock-focus',
      'neural-history',
    ]);
  });
});
