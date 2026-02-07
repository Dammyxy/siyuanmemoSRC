/**
 * NumericRangeFilter 组件单元测试
 * 
 * 测试数值范围过滤组件的基本功能：
 * - 启用/禁用复选框
 * - 最小值和最大值输入
 * - 数值范围验证
 * - 错误提示显示
 * - 小数输入支持
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md - 需求 3.1-3.8, 10.1-10.3
 * @see .kiro/specs/filter-group-queue-ui/design.md - 组件设计
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import NumericRangeFilter from '../NumericRangeFilter.vue';

describe('NumericRangeFilter', () => {
    describe('基本渲染', () => {
        it('应该渲染标签', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: false,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            expect(wrapper.text()).toContain('优先级');
        });

        it('当未启用时，不应该显示输入框', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: false,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            expect(wrapper.find('.filter-content').exists()).toBe(false);
        });

        it('当启用时，应该显示输入框', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            expect(wrapper.find('.filter-content').exists()).toBe(true);
            expect(wrapper.findAll('.range-input')).toHaveLength(2);
        });
    });

    describe('启用/禁用功能', () => {
        it('应该触发 update:enabled 事件', async () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: false,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            const checkbox = wrapper.find('input[type="checkbox"]');
            await checkbox.setValue(true);

            expect(wrapper.emitted('update:enabled')).toBeTruthy();
            expect(wrapper.emitted('update:enabled')?.[0]).toEqual([true]);
        });
    });

    describe('数值输入功能', () => {
        it('应该触发 update:min 事件', async () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            const minInput = wrapper.findAll('.range-input')[0];
            await minInput.setValue('25');

            expect(wrapper.emitted('update:min')).toBeTruthy();
            expect(wrapper.emitted('update:min')?.[0]).toEqual([25]);
        });

        it('应该触发 update:max 事件', async () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            const maxInput = wrapper.findAll('.range-input')[1];
            await maxInput.setValue('75');

            expect(wrapper.emitted('update:max')).toBeTruthy();
            expect(wrapper.emitted('update:max')?.[0]).toEqual([75]);
        });

        it('应该支持整数输入', async () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '复习次数',
                    enabled: true,
                    min: 0,
                    max: 999,
                    range: { min: 0, max: 999 },
                    allowDecimal: false,
                },
            });

            const minInput = wrapper.findAll('.range-input')[0];
            await minInput.setValue('10');

            expect(wrapper.emitted('update:min')?.[0]).toEqual([10]);
        });

        it('应该支持小数输入', async () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '可提取性',
                    enabled: true,
                    min: 0,
                    max: 1,
                    range: { min: 0, max: 1 },
                    allowDecimal: true,
                },
            });

            const minInput = wrapper.findAll('.range-input')[0];
            await minInput.setValue('0.5');

            expect(wrapper.emitted('update:min')?.[0]).toEqual([0.5]);
        });
    });

    describe('错误提示功能', () => {
        it('当有错误时，应该显示错误消息', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 100,
                    max: 0,
                    range: { min: 0, max: 100 },
                    error: '最小值不能大于最大值',
                },
            });

            expect(wrapper.find('.error-message').exists()).toBe(true);
            expect(wrapper.find('.error-message').text()).toBe('最小值不能大于最大值');
        });

        it('当有错误时，输入框应该有错误样式', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 100,
                    max: 0,
                    range: { min: 0, max: 100 },
                    error: '最小值不能大于最大值',
                },
            });

            const inputs = wrapper.findAll('.range-input');
            expect(inputs[0].classes()).toContain('input-error');
            expect(inputs[1].classes()).toContain('input-error');
        });

        it('当未启用时，不应该显示错误消息', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: false,
                    min: 100,
                    max: 0,
                    range: { min: 0, max: 100 },
                    error: '最小值不能大于最大值',
                },
            });

            expect(wrapper.find('.error-message').exists()).toBe(false);
        });

        it('当没有错误时，不应该显示错误消息', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            expect(wrapper.find('.error-message').exists()).toBe(false);
        });
    });

    describe('范围提示功能', () => {
        it('应该显示范围提示', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            expect(wrapper.find('.range-hint').text()).toContain('范围: 0 - 100');
        });
    });

    describe('可访问性', () => {
        it('复选框应该有 aria-label', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: false,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            const checkbox = wrapper.find('input[type="checkbox"]');
            expect(checkbox.attributes('aria-label')).toBe('启用优先级过滤');
        });

        it('输入框应该有 aria-label', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 0,
                    max: 100,
                    range: { min: 0, max: 100 },
                },
            });

            const inputs = wrapper.findAll('.range-input');
            expect(inputs[0].attributes('aria-label')).toBe('优先级最小值');
            expect(inputs[1].attributes('aria-label')).toBe('优先级最大值');
        });

        it('当有错误时，输入框应该有 aria-describedby', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 100,
                    max: 0,
                    range: { min: 0, max: 100 },
                    error: '最小值不能大于最大值',
                },
            });

            const inputs = wrapper.findAll('.range-input');
            const errorId = inputs[0].attributes('aria-describedby');
            expect(errorId).toBeTruthy();
            expect(wrapper.find(`#${errorId}`).exists()).toBe(true);
        });

        it('错误消息应该有 role="alert"', () => {
            const wrapper = mount(NumericRangeFilter, {
                props: {
                    label: '优先级',
                    enabled: true,
                    min: 100,
                    max: 0,
                    range: { min: 0, max: 100 },
                    error: '最小值不能大于最大值',
                },
            });

            const errorMessage = wrapper.find('.error-message');
            expect(errorMessage.attributes('role')).toBe('alert');
        });
    });
});
