import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuralNavigationBar from '../NeuralNavigationBar.vue';

function createNavigationState(overrides: Partial<{
  currentPathIndex: number;
  currentNodeId: string | null;
  currentEventId: string | null;
  navigationMode: 'explore' | 'follow';
  engineMode: 'orbit' | 'hyperspace';
  engineSessionId: string | null;
  hasBookmark: boolean;
  pathLength: number;
  sessionId: string | null;
}> = {}) {
  return {
    currentPathIndex: 2,
    currentNodeId: 'node-3',
    currentEventId: 'event-3',
    navigationMode: 'follow' as const,
    engineMode: 'orbit' as const,
    engineSessionId: 'engine-session-1',
    hasBookmark: true,
    pathLength: 5,
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('NeuralNavigationBar', () => {
  it('renders follow status with progress and engine badge', () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        i18n: {
          engineOrbit: 'Orbit',
          engineOrbitFull: 'Orbit Mode',
          engineOrbitIntro: 'Roam locally around orbit centers, concept cards, and nearby stations.',
          engineOrbitIntroLong: 'Roam locally around an orbit center through backlinks, direct references, indirect references, and descriptors near concept cards and stations.',
          switchEngineMode: 'Switch Engine: {mode}',
          navModeFollow: 'Follow Path',
          navStatusFollow: 'Current: {mode} ({current}/{total})',
        },
        navigationState: createNavigationState({
          navigationMode: 'follow',
          currentPathIndex: 3,
          pathLength: 10,
        }),
      },
    });

    expect(wrapper.get('.neural-nav-bar__engine').text()).toBe('Orbit');
    expect(wrapper.get('.neural-nav-bar__status').text()).toContain('Current: Follow Path (4/10)');
    expect(wrapper.get('.neural-nav-bar__intro').text()).toBe('Roam locally around orbit centers, concept cards, and nearby stations.');
    expect(wrapper.findAll('.neural-nav-bar__mode').map((button) => button.text())).toEqual([
      'Orbit',
      'Hyperspace Expedition',
    ]);
    expect(wrapper.findAll('.neural-nav-bar__mode')[0]?.attributes('aria-selected')).toBe('true');
  });

  it('renders hyperspace explore status text', () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        i18n: {
          engineHyperspace: 'Hyperspace Expedition',
          engineHyperspaceFull: 'Hyperspace Expedition Mode',
          engineHyperspaceIntro: 'Propagate outward layer by layer from activation sources through links and optional tree relations.',
          engineHyperspaceIntroLong: 'Propagate outward from one or more activation sources through concept links, block links, and optional tree relations instead of orbiting a single center.',
          switchEngineMode: 'Switch Engine: {mode}',
          navModeExplore: 'Free Roam',
          navStatusExplore: 'Current: {mode}',
        },
        navigationState: createNavigationState({
          navigationMode: 'explore',
          engineMode: 'hyperspace',
        }),
      },
    });

    expect(wrapper.get('.neural-nav-bar__engine').text()).toBe('Hyperspace Expedition');
    expect(wrapper.get('.neural-nav-bar__status').text()).toContain('Current: Free Roam');
    expect(wrapper.get('.neural-nav-bar__intro').text()).toBe('Propagate outward layer by layer from activation sources through links and optional tree relations.');
    expect(wrapper.findAll('.neural-nav-bar__mode')[1]?.attributes('aria-selected')).toBe('true');
  });

  it('disables return button when bookmark is unavailable', () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        navigationState: createNavigationState({
          hasBookmark: false,
        }),
      },
    });

    const buttons = wrapper.findAll('.neural-nav-bar__button');
    expect(buttons[1].attributes('disabled')).toBeDefined();
  });

  it('emits engine/nav/bookmark events', async () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        navigationState: createNavigationState({
          hasBookmark: true,
        }),
      },
    });

    const modes = wrapper.findAll('.neural-nav-bar__mode');
    const buttons = wrapper.findAll('.neural-nav-bar__button');
    await modes[1].trigger('click');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('select-workspace-mode')?.[0]).toEqual(['hyperspace']);
    expect(wrapper.emitted('toggle-nav-mode')).toBeTruthy();
    expect(wrapper.emitted('return-bookmark')).toBeTruthy();
  });
});
