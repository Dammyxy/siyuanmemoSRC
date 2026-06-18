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

  it('keeps the default desktop skin unless the mobile variant is requested', () => {
    const wrapper = mount(SkipMenuButton);

    expect(wrapper.classes()).not.toContain('skip-menu-button--mobile');
  });

  it('emits a panel toggle from the trailing affordance', async () => {
    const wrapper = mount(SkipMenuButton, {
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    expect(wrapper.emitted('togglePanel')).toEqual([[]]);
  });

  it('reflects expanded state for the inline panel trigger', () => {
    const wrapper = mount(SkipMenuButton, {
      props: {
        expanded: true,
      },
    });

    expect(wrapper.get('.skip-menu-button__trigger').attributes('aria-expanded')).toBe('true');
  });

  it('uses a downward chevron as the collapsed trailing affordance', () => {
    const wrapper = mount(SkipMenuButton);

    expect(wrapper.get('.skip-menu-button__chevron').html()).toContain('#iconDown');
  });

  it('does not emit panel toggle when disabled', async () => {
    const wrapper = mount(SkipMenuButton, {
      props: {
        disabled: true,
      },
      attachTo: document.body,
    });

    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    expect(wrapper.emitted('togglePanel')).toBeFalsy();
  });
});
