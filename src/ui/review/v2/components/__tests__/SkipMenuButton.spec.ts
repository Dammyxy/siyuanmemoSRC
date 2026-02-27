import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
}));
import { Menu } from 'siyuan';
import SkipMenuButton from '../SkipMenuButton.vue';

type MockMenuInstance = {
  addItem: ReturnType<typeof vi.fn>;
  addSeparator: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
};

function mockRect(rect: Partial<DOMRect>): DOMRect {
  return {
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    left: rect.left ?? 0,
    right: rect.right ?? 0,
    top: rect.top ?? 0,
    bottom: rect.bottom ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function getLatestMenuInstance(): MockMenuInstance {
  const result = vi.mocked(Menu).mock.results.at(-1);
  return result?.value as MockMenuInstance;
}

describe('SkipMenuButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits skip on primary button click', async () => {
    const wrapper = mount(SkipMenuButton);

    await wrapper.get('.skip-menu-button__skip').trigger('click');
    expect(wrapper.emitted('skip')).toBeTruthy();
  });

  it('opens menu anchored to dropdown button rect on desktop', async () => {
    const wrapper = mount(SkipMenuButton, {
      props: {
        isMobile: false,
      },
    });
    const dropdown = wrapper.get('.skip-menu-button__dropdown');
    vi.spyOn(dropdown.element, 'getBoundingClientRect').mockReturnValue(
      mockRect({ right: 84, bottom: 52, width: 32, height: 36, left: 52, top: 16 }),
    );

    await dropdown.trigger('click');

    const menuInstance = getLatestMenuInstance();
    expect(menuInstance.open).toHaveBeenCalledWith({
      x: 84,
      y: 52,
      h: 36,
      w: 32,
      isLeft: true,
    });
  });

  it('uses the same anchored positioning strategy on mobile', async () => {
    const wrapper = mount(SkipMenuButton, {
      props: {
        isMobile: true,
      },
    });
    const dropdown = wrapper.get('.skip-menu-button__dropdown');
    vi.spyOn(dropdown.element, 'getBoundingClientRect').mockReturnValue(
      mockRect({ right: 120, bottom: 96, width: 44, height: 44, left: 76, top: 52 }),
    );

    await dropdown.trigger('click');

    const menuInstance = getLatestMenuInstance();
    expect(menuInstance.open).toHaveBeenCalledWith({
      x: 120,
      y: 96,
      h: 44,
      w: 44,
      isLeft: true,
    });
  });
});
