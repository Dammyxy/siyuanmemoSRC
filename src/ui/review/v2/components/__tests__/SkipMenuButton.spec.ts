import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkipMenuButton from '../SkipMenuButton.vue';

const skipMenuButtonMocks = vi.hoisted(() => {
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }> = [];

  class MockMenu {
    addItem = vi.fn();
    open = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return {
    instances,
    MockMenu,
  };
});

vi.mock('siyuan', () => ({
  Menu: skipMenuButtonMocks.MockMenu,
}));

describe('SkipMenuButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    skipMenuButtonMocks.instances.length = 0;
  });

  it('emits skip on primary button click', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__main').trigger('click');
    expect(wrapper.emitted('skip')).toBeTruthy();
  });

  it('renders the skip hotkey hint and tooltip label', () => {
    const wrapper = mount(SkipMenuButton);

    const primary = wrapper.get('.skip-menu-button__main');
    expect(primary.text()).toContain('跳过');
    expect(primary.text()).toContain('0 / x');
    expect(primary.attributes('aria-label')).toBe('0 / x');
    expect(primary.classes()).toContain('b3-tooltips');
  });

  it('keeps the default desktop skin unless the mobile variant is requested', () => {
    const wrapper = mount(SkipMenuButton);

    expect(wrapper.classes()).not.toContain('skip-menu-button--mobile');
  });

  it('opens a native SiYuan menu from the trailing affordance instead of rendering a local panel', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    expect(wrapper.find('.skip-menu-button__panel').exists()).toBe(false);
    await wrapper.get('.skip-menu-button__trigger').trigger('click', {
      clientX: 64,
      clientY: 32,
    });

    expect(skipMenuButtonMocks.instances).toHaveLength(1);
    const menu = skipMenuButtonMocks.instances[0]!;
    expect(menu.addItem).toHaveBeenCalledTimes(2);
    expect(menu.addItem.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      label: '插入到队列指定位置',
      icon: 'iconPin',
    }));
    expect(menu.addItem.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      label: '安排复习日期',
      icon: 'iconCalendar',
    }));
    expect(menu.open).toHaveBeenCalled();
  });

  it('emits insert from the native menu item', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    const menu = skipMenuButtonMocks.instances[0]!;
    const insertItem = menu.addItem.mock.calls[0]?.[0];
    await insertItem.click();

    expect(wrapper.emitted('insert')).toBeTruthy();
  });

  it('hides the schedule action when canScheduleDate is false', async () => {
    const wrapper = mount(SkipMenuButton, {
      props: {
        canScheduleDate: false,
      },
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    const menu = skipMenuButtonMocks.instances[0]!;
    expect(menu.addItem).toHaveBeenCalledTimes(1);
    expect(menu.addItem.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      label: '插入到队列指定位置',
    }));
  });
});
