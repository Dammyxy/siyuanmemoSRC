import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuralNavigationBar from '../NeuralNavigationBar.vue';

function createNavigationState(overrides: Partial<{
  currentPathIndex: number;
  currentNodeId: string | null;
  navigationMode: 'explore' | 'follow';
  hasBookmark: boolean;
  pathLength: number;
  sessionId: string | null;
}> = {}) {
  return {
    currentPathIndex: 2,
    currentNodeId: 'node-3',
    navigationMode: 'follow' as const,
    hasBookmark: true,
    pathLength: 5,
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('NeuralNavigationBar', () => {
  it('renders follow status with progress', () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        i18n: {
          navModeFollow: 'Follow Mainline',
          navStatusFollow: 'Current: {mode} ({current}/{total})',
        },
        navigationState: createNavigationState({
          navigationMode: 'follow',
          currentPathIndex: 3,
          pathLength: 10,
        }),
      },
    });

    expect(wrapper.get('.neural-nav-bar__status').text()).toBe('Current: Follow Mainline (4/10)');
  });

  it('renders explore status text', () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        i18n: {
          navModeExplore: 'Explore Worldline Branches',
          navStatusExplore: 'Current: {mode}',
        },
        navigationState: createNavigationState({
          navigationMode: 'explore',
        }),
      },
    });

    expect(wrapper.get('.neural-nav-bar__status').text()).toBe('Current: Explore Worldline Branches');
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

  it('emits toggle-nav-mode and return-bookmark events', async () => {
    const wrapper = mount(NeuralNavigationBar, {
      props: {
        navigationState: createNavigationState({
          hasBookmark: true,
        }),
      },
    });

    const buttons = wrapper.findAll('.neural-nav-bar__button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('toggle-nav-mode')).toBeTruthy();
    expect(wrapper.emitted('return-bookmark')).toBeTruthy();
  });
});
