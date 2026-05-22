import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NeuralRouteBar from '../NeuralRouteBar.vue';
import type { NeuralRoamRouteListItem } from '@/core/queue/neural/routes';

function route(partial: Partial<NeuralRoamRouteListItem>): NeuralRoamRouteListItem {
  return {
    id: 'default',
    name: '默认航线',
    temporary: false,
    previousRouteId: null,
    initialSeedNodeIds: [],
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: 1,
    isActive: false,
    stats: {
      routeId: partial.id || 'default',
      seedCount: 0,
      anchorCount: 0,
      historyCount: 0,
      totalPoolEntries: 0,
    },
    ...partial,
  };
}

describe('NeuralRouteBar', () => {
  it('renders route selector with per-route counts and emits switch', async () => {
    const wrapper = mount(NeuralRouteBar, {
      props: {
        routes: [
          route({
            id: 'default',
            isActive: true,
            stats: { routeId: 'default', seedCount: 2, anchorCount: 1, historyCount: 5, totalPoolEntries: 3 },
          }),
          route({
            id: 'route-b',
            name: 'Route B',
            stats: { routeId: 'route-b', seedCount: 1, anchorCount: 0, historyCount: 3, totalPoolEntries: 1 },
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain('Route B · 概念 1 · 空间站 0 · 日志 3');

    await wrapper.find('select').setValue('route-b');

    expect(wrapper.emitted('switch-route')?.[0]).toEqual(['route-b']);
  });

  it('exposes management actions for the active ordinary route', async () => {
    const wrapper = mount(NeuralRouteBar, {
      props: {
        routes: [
          route({ id: 'route-b', name: 'Route B', isActive: true }),
        ],
      },
    });

    const buttons = wrapper.findAll('button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');

    expect(wrapper.emitted('create-route')?.[0]).toEqual([]);
    expect(wrapper.emitted('rename-route')?.[0]).toEqual(['route-b']);
    expect(wrapper.emitted('delete-route')?.[0]).toEqual(['route-b']);
  });

  it('shows save action for temporary active routes', async () => {
    const wrapper = mount(NeuralRouteBar, {
      props: {
        routes: [
          route({
            id: 'route-temp',
            name: '临时：概念',
            temporary: true,
            isActive: true,
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain('临时');
    const buttons = wrapper.findAll('button');
    await buttons[2].trigger('click');

    expect(wrapper.emitted('save-temporary-route')?.[0]).toEqual(['route-temp']);
  });
});
