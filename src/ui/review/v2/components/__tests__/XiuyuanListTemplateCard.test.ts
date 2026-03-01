import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { XiuyuanCardMeta } from '@/core/xiuyuan/cardMeta';
import XiuyuanListTemplateCard from '../XiuyuanListTemplateCard.vue';

function createMeta(overrides?: Partial<XiuyuanCardMeta>): XiuyuanCardMeta {
  return {
    xiuyuanID: 'xy_1',
    faceIndex: 0,
    templateID: 'builtin-list-item',
    frontBlockIDs: ['q_1'],
    backBlockIDs: ['a_1'],
    cue: 'cue',
    answer: 'answer',
    allChildren: [{ id: 'child_1', cue: 'cue', answer: 'answer', index: 0 }],
    currentIndex: 0,
    ...overrides,
  };
}

function createPluginMock() {
  return {
    getContext: () => ({
      getReviewService: () => ({
        getSiyuanApi: () => ({
          getBlockDOM: vi.fn().mockResolvedValue({ dom: '<p>Question</p>' }),
          getBlockBreadcrumb: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  } as any;
}

describe('XiuyuanListTemplateCard', () => {
  it('does not render front cue area when cue is empty', () => {
    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({ cue: '' }),
        showAnswer: false,
        questionBlockId: 'q_1',
        plugin: createPluginMock(),
      },
    });

    expect(wrapper.find('.xiuyuan-current-cue').exists()).toBe(false);
  });

  it('renders front cue area when cue is non-empty', () => {
    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({ cue: '聚合提示' }),
        showAnswer: false,
        questionBlockId: 'q_1',
        plugin: createPluginMock(),
      },
    });

    const cueBlock = wrapper.find('.xiuyuan-current-cue');
    expect(cueBlock.exists()).toBe(true);
    expect(cueBlock.text()).toContain('聚合提示');
  });
});
