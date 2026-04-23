import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import SkipMenuButton from '../SkipMenuButton.vue';

describe('SkipMenuButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
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

  it('opens a local upward panel from the integrated trailing affordance', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    expect(wrapper.find('.skip-menu-button__panel').exists()).toBe(false);
    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    expect(wrapper.find('.skip-menu-button__panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('插入到队列指定位置');
    expect(wrapper.text()).toContain('安排复习日期');
  });

  it('emits insert from the panel and closes it afterwards', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    await wrapper.findAll('.skip-menu-button__menu-item')[0]!.trigger('click');

    expect(wrapper.emitted('insert')).toBeTruthy();
    expect(wrapper.find('.skip-menu-button__panel').exists()).toBe(false);
  });

  it('hides the schedule action when canScheduleDate is false', async () => {
    const wrapper = mount(SkipMenuButton, {
      props: {
        canScheduleDate: false,
      },
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    expect(wrapper.text()).toContain('插入到队列指定位置');
    expect(wrapper.text()).not.toContain('安排复习日期');
  });

  it('closes the panel when clicking outside', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    expect(wrapper.find('.skip-menu-button__panel').exists()).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.skip-menu-button__panel').exists()).toBe(false);
  });
});
