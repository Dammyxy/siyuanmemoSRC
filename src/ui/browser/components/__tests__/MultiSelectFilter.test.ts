import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MultiSelectFilter from '../MultiSelectFilter.vue';

/**
 * MultiSelectFilter 组件单元测试
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md - 需求 5.1-5.4
 * @see .kiro/specs/filter-group-queue-ui/design.md - 组件设计
 */

describe('MultiSelectFilter', () => {
  const defaultProps = {
    label: '卡片类型',
    enabled: false,
    options: [
      { value: 'item', label: 'Item' },
      { value: 'topic', label: 'Topic' },
    ],
    selected: new Set<string>(),
  };

  describe('基础渲染', () => {
    it('应该渲染标签', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: defaultProps,
      });

      expect(wrapper.find('.filter-label').text()).toBe('卡片类型');
    });

    it('应该渲染启用复选框', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: defaultProps,
      });

      const checkbox = wrapper.find('.filter-checkbox input[type="checkbox"]');
      expect(checkbox.exists()).toBe(true);
      expect((checkbox.element as HTMLInputElement).checked).toBe(false);
    });

    it('当启用时应该显示选项列表', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      expect(wrapper.find('.filter-content').exists()).toBe(true);
      expect(wrapper.find('.options-list').exists()).toBe(true);
    });

    it('当禁用时应该隐藏选项列表', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: false,
        },
      });

      expect(wrapper.find('.filter-content').exists()).toBe(false);
    });
  });

  describe('启用/禁用交互', () => {
    it('点击启用复选框应该触发 update:enabled 事件', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: defaultProps,
      });

      const checkbox = wrapper.find('.filter-checkbox input[type="checkbox"]');
      await checkbox.setValue(true);

      expect(wrapper.emitted('update:enabled')).toBeTruthy();
      expect(wrapper.emitted('update:enabled')?.[0]).toEqual([true]);
    });

    it('取消启用复选框应该触发 update:enabled 事件', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const checkbox = wrapper.find('.filter-checkbox input[type="checkbox"]');
      await checkbox.setValue(false);

      expect(wrapper.emitted('update:enabled')).toBeTruthy();
      expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false]);
    });
  });

  describe('选项渲染', () => {
    it('应该渲染所有选项', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const options = wrapper.findAll('.option-checkbox');
      expect(options).toHaveLength(2);
      expect(options[0].find('.option-label').text()).toBe('Item');
      expect(options[1].find('.option-label').text()).toBe('Topic');
    });

    it('应该正确显示已选择的选项', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(['item']),
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      expect((options[0].element as HTMLInputElement).checked).toBe(true);
      expect((options[1].element as HTMLInputElement).checked).toBe(false);
    });

    it('应该正确显示多个已选择的选项', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(['item', 'topic']),
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      expect((options[0].element as HTMLInputElement).checked).toBe(true);
      expect((options[1].element as HTMLInputElement).checked).toBe(true);
    });
  });

  describe('选项选择交互', () => {
    it('选择选项应该触发 update:selected 事件', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const firstOption = wrapper.findAll('.option-checkbox input[type="checkbox"]')[0];
      await firstOption.setValue(true);

      expect(wrapper.emitted('update:selected')).toBeTruthy();
      const emittedValue = wrapper.emitted('update:selected')?.[0]?.[0] as Set<string>;
      expect(emittedValue).toBeInstanceOf(Set);
      expect(emittedValue.has('item')).toBe(true);
    });

    it('取消选择选项应该触发 update:selected 事件', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(['item']),
        },
      });

      const firstOption = wrapper.findAll('.option-checkbox input[type="checkbox"]')[0];
      await firstOption.setValue(false);

      expect(wrapper.emitted('update:selected')).toBeTruthy();
      const emittedValue = wrapper.emitted('update:selected')?.[0]?.[0] as Set<string>;
      expect(emittedValue).toBeInstanceOf(Set);
      expect(emittedValue.has('item')).toBe(false);
    });

    it('选择多个选项应该正确更新选择集合', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      
      // 选择第一个选项
      await options[0].setValue(true);
      let emittedValue = wrapper.emitted('update:selected')?.[0]?.[0] as Set<string>;
      expect(emittedValue.has('item')).toBe(true);
      expect(emittedValue.size).toBe(1);

      // 更新 props 以模拟父组件更新
      await wrapper.setProps({
        selected: new Set(['item']),
      });

      // 选择第二个选项
      await options[1].setValue(true);
      emittedValue = wrapper.emitted('update:selected')?.[1]?.[0] as Set<string>;
      expect(emittedValue.has('item')).toBe(true);
      expect(emittedValue.has('topic')).toBe(true);
      expect(emittedValue.size).toBe(2);
    });
  });

  describe('可访问性', () => {
    it('启用复选框应该有 aria-label', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: defaultProps,
      });

      const checkbox = wrapper.find('.filter-checkbox input[type="checkbox"]');
      expect(checkbox.attributes('aria-label')).toBe('启用卡片类型过滤');
    });

    it('选项复选框应该有 aria-label', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      expect(options[0].attributes('aria-label')).toBe('选择Item');
      expect(options[1].attributes('aria-label')).toBe('选择Topic');
    });
  });

  describe('边界情况', () => {
    it('应该处理空选项列表', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          options: [],
        },
      });

      expect(wrapper.find('.options-list').exists()).toBe(true);
      expect(wrapper.findAll('.option-checkbox')).toHaveLength(0);
    });

    it('应该处理空选择集合', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(),
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      options.forEach(option => {
        expect((option.element as HTMLInputElement).checked).toBe(false);
      });
    });

    it('应该处理包含所有选项的选择集合', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(['item', 'topic']),
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      options.forEach(option => {
        expect((option.element as HTMLInputElement).checked).toBe(true);
      });
    });

    it('应该处理包含无效值的选择集合', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(['item', 'invalid']),
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      expect((options[0].element as HTMLInputElement).checked).toBe(true);
      expect((options[1].element as HTMLInputElement).checked).toBe(false);
    });
  });

  describe('需求验证', () => {
    it('需求 5.1: 启用卡片类型过滤时应该提供复选框', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          label: '卡片类型',
          enabled: true,
          options: [
            { value: 'item', label: 'Item' },
            { value: 'topic', label: 'Topic' },
          ],
          selected: new Set(),
        },
      });

      const options = wrapper.findAll('.option-checkbox');
      expect(options).toHaveLength(2);
      expect(options[0].find('.option-label').text()).toBe('Item');
      expect(options[1].find('.option-label').text()).toBe('Topic');
    });

    it('需求 5.2: 启用卡片状态过滤时应该提供复选框', () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          label: '卡片状态',
          enabled: true,
          options: [
            { value: 'memorized', label: 'Memorized' },
            { value: 'pending', label: 'Pending' },
            { value: 'dismissed', label: 'Dismissed' },
          ],
          selected: new Set(),
        },
      });

      const options = wrapper.findAll('.option-checkbox');
      expect(options).toHaveLength(3);
      expect(options[0].find('.option-label').text()).toBe('Memorized');
      expect(options[1].find('.option-label').text()).toBe('Pending');
      expect(options[2].find('.option-label').text()).toBe('Dismissed');
    });

    it('需求 5.3: 未选择任何选项时应该返回空集合', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          selected: new Set(['item']),
        },
      });

      // 取消选择唯一的选项
      const firstOption = wrapper.findAll('.option-checkbox input[type="checkbox"]')[0];
      await firstOption.setValue(false);

      const emittedValue = wrapper.emitted('update:selected')?.[0]?.[0] as Set<string>;
      expect(emittedValue.size).toBe(0);
    });

    it('需求 5.4: 选择多个选项时应该使用 OR 逻辑（返回包含所有选项的集合）', async () => {
      const wrapper = mount(MultiSelectFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const options = wrapper.findAll('.option-checkbox input[type="checkbox"]');
      
      // 选择第一个选项
      await options[0].setValue(true);
      await wrapper.setProps({ selected: new Set(['item']) });
      
      // 选择第二个选项
      await options[1].setValue(true);
      
      const emittedValue = wrapper.emitted('update:selected')?.[1]?.[0] as Set<string>;
      expect(emittedValue.has('item')).toBe(true);
      expect(emittedValue.has('topic')).toBe(true);
      expect(emittedValue.size).toBe(2);
    });
  });
});
