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
  const blockMarkdownById: Record<string, string> = {
    child_1: 'cue -> answer',
  };
  let questionDom = '<p>Question</p>';
  return {
    getContext: () => ({
      getReviewService: () => ({
        getSiyuanApi: () => ({
          getBlockDOM: vi.fn().mockImplementation(async () => ({ dom: questionDom })),
          getBlockKramdown: vi.fn(async (blockId: string) => ({
            kramdown: blockMarkdownById[blockId] || '',
          })),
        }),
      }),
    }),
    __setBlockMarkdown(nextMap: Record<string, string>) {
      Object.assign(blockMarkdownById, nextMap);
    },
    __setQuestionDom(nextDom: string) {
      questionDom = nextDom;
    },
  } as any;
}

describe('XiuyuanListTemplateCard', () => {
  beforeEach(() => {
    getBlockBreadcrumbMock.mockReset();
    getBlockBreadcrumbMock.mockResolvedValue([]);
    (window as typeof window & {
      Lute?: {
        New: () => {
          Md2HTML: (markdown: string) => string;
        };
      };
    }).Lute = {
      New: () => ({
        Md2HTML: (markdown: string) => `<p>${markdown.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`,
      }),
    };
  });

  it('does not render front cue area when the current child block has no cue separator', async () => {
    const plugin = createPluginMock();
    plugin.__setBlockMarkdown({
      child_1: '纯答案内容',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({ cue: '' }),
        showAnswer: false,
        questionBlockId: 'q_1',
        plugin,
      },
    });
    await flushPromises();

    expect(wrapper.find('.xiuyuan-current-cue').exists()).toBe(false);
    expect(wrapper.find('.xiuyuan-current-answer').text()).toContain('纯答案内容');
  });

  it('renders current cue and previous answers from child block kramdown with markdown styles', async () => {
    const plugin = createPluginMock();
    plugin.__setBlockMarkdown({
      child_1: '提示一 -> **答案一**',
      child_2: '**聚合提示** -> 当前答案',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({
          currentIndex: 1,
          allChildren: [
            { id: 'child_1', cue: '提示一', answer: '答案一', index: 0 },
            { id: 'child_2', cue: '聚合提示', answer: '当前答案', index: 1 },
          ],
        }),
        showAnswer: false,
        questionBlockId: 'q_1',
        plugin,
      },
    });
    await flushPromises();

    const cueBlock = wrapper.find('.xiuyuan-current-cue');
    expect(cueBlock.exists()).toBe(true);
    expect(cueBlock.find('strong').text()).toBe('聚合提示');
    expect(wrapper.find('.xiuyuan-previous-answers strong').text()).toBe('答案一');
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

  it('renders the direct CDF layout without multiline markers or remaining-hint copy', async () => {
    const plugin = createPluginMock();
    plugin.__setQuestionDom('<p>[[中子星]]:::</p>');
    plugin.__setBlockMarkdown({
      child_1: '前身 -> **大质量恒星残骸**',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({
          cue: '前身',
          answer: '大质量恒星残骸',
        }),
        showAnswer: true,
        questionBlockId: 'q_1',
        plugin,
        displayMode: 'direct',
      },
    });
    await flushPromises();

    expect(wrapper.find('.cdf-direct-layout').exists()).toBe(true);
    expect(wrapper.text()).toContain('来源');
    expect(wrapper.text()).toContain('当前项');
    expect(wrapper.text()).toContain('答案');
    expect(wrapper.text()).toContain('大质量恒星残骸');
    expect(wrapper.text()).not.toContain(':::');
    expect(wrapper.text()).not.toContain('还有');
  });
});
