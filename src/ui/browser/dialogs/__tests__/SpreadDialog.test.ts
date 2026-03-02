import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import SpreadDialog from '../SpreadDialog.vue';
import { SortingCriterion, type SpreadConfig } from '@/types/reschedule';
import { ConfigManager } from '@/core/scheduler/ConfigManager';

function createMockConfigManager(defaults?: Partial<SpreadConfig>): ConfigManager {
  const defaultConfig: SpreadConfig = {
    collectingPeriod: 30,
    reschedulingPeriod: 30,
    considerFutureRepetitions: false,
    sortingCriterion: SortingCriterion.Random,
    maxCardsPerDay: undefined,
    ...defaults,
  };

  const manager = {
    getDefaultSpreadConfig: vi.fn(() => ({ ...defaultConfig })),
    listConfigNames: vi.fn().mockResolvedValue([]),
    loadConfig: vi.fn().mockResolvedValue(null),
    saveConfig: vi.fn().mockResolvedValue(undefined),
  };

  return manager as unknown as ConfigManager;
}

function mountSpreadDialog(overrides?: {
  queueMode?: boolean;
  count?: number;
  configManager?: ConfigManager;
  i18n?: Record<string, string>;
}) {
  return mount(SpreadDialog, {
    props: {
      count: overrides?.count ?? 8,
      queueMode: overrides?.queueMode ?? false,
      configManager: overrides?.configManager ?? createMockConfigManager(),
      i18n: overrides?.i18n ?? {},
    },
  });
}

describe('SpreadDialog', () => {
  it('renders "consider future reviews" above collecting period', () => {
    const wrapper = mountSpreadDialog();
    const basicSectionText = wrapper.findAll('.form-section')[0]?.text() || '';

    expect(basicSectionText.indexOf('考虑未来复习')).toBeGreaterThanOrEqual(0);
    expect(basicSectionText.indexOf('收集期（天）')).toBeGreaterThanOrEqual(0);
    expect(basicSectionText.indexOf('考虑未来复习')).toBeLessThan(basicSectionText.indexOf('收集期（天）'));
  });

  it('disables collecting period controls when future reviews are not considered', () => {
    const wrapper = mountSpreadDialog();
    const collectingField = wrapper.get('.collecting-period-field');
    const quickButtons = collectingField.findAll('.btn-quick');
    const collectingInput = collectingField.get('input[type="number"]');

    expect(collectingField.classes()).toContain('is-disabled');
    expect(quickButtons.every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(collectingInput.attributes('disabled')).toBeDefined();
    expect(collectingField.text()).toContain('仅到期卡片');
  });

  it('enables collecting period controls after checking considerFutureRepetitions', async () => {
    const wrapper = mountSpreadDialog();
    const checkbox = wrapper.get('.checkbox-label input[type="checkbox"]');

    await checkbox.setValue(true);
    await nextTick();

    const collectingField = wrapper.get('.collecting-period-field');
    const quickButtons = collectingField.findAll('.btn-quick');
    const collectingInput = collectingField.get('input[type="number"]');

    expect(collectingField.classes()).not.toContain('is-disabled');
    expect(quickButtons.every((button) => button.attributes('disabled') === undefined)).toBe(true);
    expect(collectingInput.attributes('disabled')).toBeUndefined();

    await quickButtons[1]?.trigger('click');
    expect(quickButtons[1]?.classes()).toContain('btn-quick--active');
  });

  it('shows due-only collecting range in preview when future reviews are not considered', () => {
    const wrapper = mountSpreadDialog();
    const collectingRangeValue = wrapper.findAll('.preview-item')[1]?.find('.preview-value').text() || '';

    expect(collectingRangeValue).toContain('仅到期卡片');
  });

  it('shows due-only operation type when future reviews are not considered', () => {
    const wrapper = mountSpreadDialog();
    const operationTypeValue = wrapper.findAll('.preview-item')[0]?.find('.preview-value').text() || '';

    expect(operationTypeValue).toContain('均匀分散（仅到期）');
  });

  it('hides consider future and collecting period in queue mode', () => {
    const wrapper = mountSpreadDialog({ queueMode: true, count: 12 });

    expect(wrapper.find('.checkbox-label').exists()).toBe(false);
    expect(wrapper.find('.collecting-period-field').exists()).toBe(false);
    expect(wrapper.text()).toContain('队列模式：将分散当前队列中的所有卡片（12 张）');
  });

  it('emits normalized config on confirm even when collectingPeriod is invalid but considerFutureRepetitions is false', async () => {
    const wrapper = mountSpreadDialog();
    const vm = wrapper.vm as unknown as { config: SpreadConfig };

    vm.config.collectingPeriod = 0;
    vm.config.reschedulingPeriod = 20;
    vm.config.considerFutureRepetitions = false;
    await nextTick();

    const confirmButton = wrapper.get('.dialog__actions .b3-button--text');
    await confirmButton.trigger('click');

    const confirmEvents = wrapper.emitted('confirm');
    expect(confirmEvents).toBeTruthy();

    const payload = confirmEvents?.[0]?.[0] as SpreadConfig;
    expect(payload.collectingPeriod).toBe(30);
    expect(payload.reschedulingPeriod).toBe(20);
    expect(payload.considerFutureRepetitions).toBe(false);
  });
});
