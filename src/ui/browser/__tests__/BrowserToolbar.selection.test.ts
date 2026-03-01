import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BrowserToolbar from '../BrowserToolbar.vue';

const baseProps = {
  i18n: {
    selectAllMatching: '全选匹配结果',
    cancelSelectAll: '取消全选',
    clearSelection: '清空选择',
    allCards: '全部',
    dueToday: '今日到期',
    overdue: '已过期',
    leech: '难点卡片',
    new: '新卡片',
    cards: '张卡片',
    startPractice: '开始练习',
    togglePreview: '切换预览',
  },
  searchQuery: '',
  currentPreset: 'all',
  currentCardType: 'all',
  cardCount: 100,
  showExitFocus: false,
  hasPlugin: true,
  canApplySortToQueue: false,
  viewMode: 'flat' as const,
  loading: false,
  showPreview: false,
  mode: 'dialog' as const,
  mobileMode: false,
  queueType: '',
  appliedFilter: null,
  activeQueueId: null,
  selectedCount: 0,
  selectionMode: 'explicit' as const,
  canSelectAllMatching: true,
};

describe('BrowserToolbar selection actions', () => {
  it('emits selectAllMatching when toggle clicked in explicit mode', async () => {
    const wrapper = mount(BrowserToolbar, {
      props: { ...baseProps },
    });

    const button = wrapper.findAll('button').find((item) => item.text().includes('全选匹配结果'));
    expect(button).toBeTruthy();
    await button!.trigger('click');
    expect(wrapper.emitted('selectAllMatching')).toBeTruthy();
  });

  it('shows cancel label and emits clearSelection in all-matching mode', async () => {
    const wrapper = mount(BrowserToolbar, {
      props: {
        ...baseProps,
        selectedCount: 12,
        selectionMode: 'all-matching',
      },
    });

    const button = wrapper.findAll('button').find((item) => item.text().includes('取消全选'));
    expect(button).toBeTruthy();
    await button!.trigger('click');
    expect(wrapper.emitted('clearSelection')).toBeTruthy();
  });
});
