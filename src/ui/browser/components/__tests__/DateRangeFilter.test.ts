import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DateRangeFilter from '../DateRangeFilter.vue';

/**
 * DateRangeFilter 组件单元测试
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md - 需求 4.1-4.4
 * @see .kiro/specs/filter-group-queue-ui/design.md - 组件设计
 */

describe('DateRangeFilter', () => {
  const defaultProps = {
    label: '上次复习日期',
    enabled: false,
    minDate: new Date('2024-01-01'),
    maxDate: new Date('2024-12-31'),
  };

  describe('基础渲染', () => {
    it('应该渲染标签和复选框', () => {
      const wrapper = mount(DateRangeFilter, {
        props: defaultProps,
      });

      expect(wrapper.find('.filter-label').text()).toBe('上次复习日期');
      expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
    });

    it('当未启用时，不应该显示日期输入框', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: false,
        },
      });

      expect(wrapper.find('.filter-content').exists()).toBe(false);
      expect(wrapper.findAll('input[type="date"]').length).toBe(0);
    });

    it('当启用时，应该显示日期输入框', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      expect(wrapper.find('.filter-content').exists()).toBe(true);
      expect(wrapper.findAll('input[type="date"]').length).toBe(2);
    });
  });

  describe('启用/禁用交互', () => {
    it('点击复选框应该触发 update:enabled 事件', async () => {
      const wrapper = mount(DateRangeFilter, {
        props: defaultProps,
      });

      const checkbox = wrapper.find('input[type="checkbox"]');
      await checkbox.setValue(true);

      expect(wrapper.emitted('update:enabled')).toBeTruthy();
      expect(wrapper.emitted('update:enabled')?.[0]).toEqual([true]);
    });

    it('取消复选框应该触发 update:enabled 事件为 false', async () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const checkbox = wrapper.find('input[type="checkbox"]');
      await checkbox.setValue(false);

      expect(wrapper.emitted('update:enabled')).toBeTruthy();
      expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false]);
    });
  });

  describe('日期输入', () => {
    it('应该正确显示最小日期', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          minDate: new Date('2024-01-15'),
        },
      });

      const minInput = wrapper.findAll('input[type="date"]')[0];
      expect(minInput.element.value).toBe('2024-01-15');
    });

    it('应该正确显示最大日期', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          maxDate: new Date('2024-06-30'),
        },
      });

      const maxInput = wrapper.findAll('input[type="date"]')[1];
      expect(maxInput.element.value).toBe('2024-06-30');
    });

    it('修改最小日期应该触发 update:minDate 事件', async () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const minInput = wrapper.findAll('input[type="date"]')[0];
      await minInput.setValue('2024-03-15');

      expect(wrapper.emitted('update:minDate')).toBeTruthy();
      const emittedDate = wrapper.emitted('update:minDate')?.[0]?.[0] as Date;
      expect(emittedDate).toBeInstanceOf(Date);
      expect(emittedDate.toISOString().split('T')[0]).toBe('2024-03-15');
    });

    it('修改最大日期应该触发 update:maxDate 事件', async () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const maxInput = wrapper.findAll('input[type="date"]')[1];
      await maxInput.setValue('2024-09-20');

      expect(wrapper.emitted('update:maxDate')).toBeTruthy();
      const emittedDate = wrapper.emitted('update:maxDate')?.[0]?.[0] as Date;
      expect(emittedDate).toBeInstanceOf(Date);
      expect(emittedDate.toISOString().split('T')[0]).toBe('2024-09-20');
    });
  });

  describe('错误显示', () => {
    it('当有错误时，应该显示错误消息', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          error: '最小日期不能晚于最大日期',
        },
      });

      expect(wrapper.find('.error-message').exists()).toBe(true);
      expect(wrapper.find('.error-message').text()).toBe('最小日期不能晚于最大日期');
    });

    it('当有错误时，输入框应该有错误样式', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          error: '日期范围无效',
        },
      });

      const inputs = wrapper.findAll('.date-input');
      expect(inputs[0].classes()).toContain('input-error');
      expect(inputs[1].classes()).toContain('input-error');
    });

    it('当未启用时，即使有错误也不应该显示', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: false,
          error: '日期范围无效',
        },
      });

      expect(wrapper.find('.error-message').exists()).toBe(false);
    });

    it('当没有错误时，不应该显示错误消息', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      expect(wrapper.find('.error-message').exists()).toBe(false);
    });
  });

  describe('可访问性', () => {
    it('复选框应该有正确的 aria-label', () => {
      const wrapper = mount(DateRangeFilter, {
        props: defaultProps,
      });

      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.attributes('aria-label')).toBe('启用上次复习日期过滤');
    });

    it('日期输入框应该有正确的 aria-label', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const inputs = wrapper.findAll('input[type="date"]');
      expect(inputs[0].attributes('aria-label')).toBe('上次复习日期最小日期');
      expect(inputs[1].attributes('aria-label')).toBe('上次复习日期最大日期');
    });

    it('当有错误时，输入框应该有 aria-describedby', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          error: '日期范围无效',
        },
      });

      const inputs = wrapper.findAll('input[type="date"]');
      const errorId = wrapper.find('.error-message').attributes('id');
      
      expect(inputs[0].attributes('aria-describedby')).toBe(errorId);
      expect(inputs[1].attributes('aria-describedby')).toBe(errorId);
    });

    it('错误消息应该有 role="alert"', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          error: '日期范围无效',
        },
      });

      expect(wrapper.find('.error-message').attributes('role')).toBe('alert');
    });
  });

  describe('边界情况', () => {
    it('应该处理无效的日期对象', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          minDate: new Date('invalid'),
          maxDate: new Date('invalid'),
        },
      });

      const inputs = wrapper.findAll('input[type="date"]');
      expect(inputs[0].element.value).toBe('');
      expect(inputs[1].element.value).toBe('');
    });

    it('应该处理空字符串输入', async () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
        },
      });

      const minInput = wrapper.findAll('input[type="date"]')[0];
      await minInput.setValue('');

      // 空字符串不应该触发事件
      expect(wrapper.emitted('update:minDate')).toBeFalsy();
    });

    it('应该处理跨年的日期范围', () => {
      const wrapper = mount(DateRangeFilter, {
        props: {
          ...defaultProps,
          enabled: true,
          minDate: new Date('2023-12-15'),
          maxDate: new Date('2024-01-15'),
        },
      });

      const inputs = wrapper.findAll('input[type="date"]');
      expect(inputs[0].element.value).toBe('2023-12-15');
      expect(inputs[1].element.value).toBe('2024-01-15');
    });
  });
});
