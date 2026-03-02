import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import PostponeDialog from '../PostponeDialog.vue';
import type { PostponeConfig } from '@/types/reschedule';
import { ConfigManager } from '@/core/scheduler/ConfigManager';

function createMockConfigManager(defaults?: Partial<PostponeConfig>): ConfigManager {
  const defaultConfig: PostponeConfig = {
    delayFactor: 1.1,
    minInterval: 1,
    maxInterval: 365,
    includeNonOutstanding: false,
    skipConditions: {
      skipByPriority: { enabled: false, threshold: 10 },
      skipByInterval: { enabled: false, threshold: 365 },
      skipByRetrievability: { enabled: false, threshold: 0.9 },
      skipByAFactor: { enabled: false, threshold: 1.5 },
      skipByPostponeCount: { enabled: false, threshold: 10 },
    },
    modifyDelayByRetrievability: false,
    modifyDelayByPriority: false,
    skipTopNElements: 0,
    ...defaults,
  };

  const manager = {
    getDefaultPostponeConfig: vi.fn(() => ({ ...defaultConfig })),
    listConfigNames: vi.fn().mockResolvedValue([]),
    loadConfig: vi.fn().mockResolvedValue(null),
    saveConfig: vi.fn().mockResolvedValue(undefined),
  };

  return manager as unknown as ConfigManager;
}

function mountPostponeDialog(overrides?: {
  count?: number;
  configManager?: ConfigManager;
  i18n?: Record<string, string>;
}) {
  return mount(PostponeDialog, {
    props: {
      count: overrides?.count ?? 3,
      configManager: overrides?.configManager ?? createMockConfigManager(),
      i18n: overrides?.i18n ?? {},
    },
  });
}

describe('PostponeDialog', () => {
  const i18n = {
    postponeDialogInfo: 'Will postpone {n} cards',
    postponeDialogDefaultOutstandingOnlyHint: 'DEFAULT-OUTSTANDING-HINT',
    postponeIncludeNonOutstanding: 'Include Non-Outstanding Cards (Dilute Mode)',
  };

  it('shows default outstanding-only hint when includeNonOutstanding is false', async () => {
    const wrapper = mountPostponeDialog({ i18n });
    await nextTick();

    const hint = wrapper.find('.dialog__info-hint');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain('DEFAULT-OUTSTANDING-HINT');
  });

  it('hides default outstanding-only hint after enabling includeNonOutstanding', async () => {
    const wrapper = mountPostponeDialog({ i18n });
    await nextTick();

    const diluteLabel = wrapper
      .findAll('.checkbox-label')
      .find((label) => label.text().includes(i18n.postponeIncludeNonOutstanding));
    expect(diluteLabel).toBeTruthy();

    await diluteLabel!.get('input[type="checkbox"]').setValue(true);
    await nextTick();

    expect(wrapper.find('.dialog__info-hint').exists()).toBe(false);
  });
});

