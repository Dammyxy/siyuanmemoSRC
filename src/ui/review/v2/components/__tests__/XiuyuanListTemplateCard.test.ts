import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { XiuyuanCardMeta } from '@/core/xiuyuan/cardMeta';
import XiuyuanListTemplateCard from '../XiuyuanListTemplateCard.vue';

const getBlockBreadcrumbMock = vi.fn();

vi.mock('@/infrastructure/siyuan/api', () => ({
  getBlockBreadcrumb: (...args: unknown[]) => getBlockBreadcrumbMock(...args),
}));

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
        }),
      }),
    }),
  } as any;
}

describe('XiuyuanListTemplateCard', () => {
  beforeEach(() => {
    getBlockBreadcrumbMock.mockReset();
    getBlockBreadcrumbMock.mockResolvedValue([]);
  });

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

  it('uses shared breadcrumb normalization and keeps same-name ancestors with different ids', async () => {
    getBlockBreadcrumbMock.mockResolvedValue([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: '1. Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: '1. Intro', type: 'NodeHeading' },
      { id: 'list-item-1', name: 'Question Container', type: 'NodeListItem' },
      { id: 'q_1', name: 'Question Paragraph', type: 'NodeParagraph' },
    ]);

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta(),
        showAnswer: false,
        questionBlockId: 'q_1',
        plugin: createPluginMock(),
      },
    });

    await flushPromises();

    const breadcrumbItems = wrapper.findAll('.card-breadcrumb__item');
    expect(breadcrumbItems).toHaveLength(3);
    expect(breadcrumbItems[0]?.text()).toContain('Doc');
    expect(breadcrumbItems[1]?.text()).toContain('Intro');
    expect(breadcrumbItems[2]?.text()).toContain('Intro');
  });
});
