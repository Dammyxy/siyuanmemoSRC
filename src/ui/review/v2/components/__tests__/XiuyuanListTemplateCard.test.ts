import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { XiuyuanCardMeta } from '@/core/xiuyuan/cardMeta';
import { ReviewRichContentRenderer } from '@/core/card/common/application/ReviewRichContentRenderer';
import XiuyuanListTemplateCard from '../XiuyuanListTemplateCard.vue';

const getBlockBreadcrumbMock = vi.fn();
const richContentRenderer = new ReviewRichContentRenderer();

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

function createSiyuanApiMock() {
  const blockMarkdownById: Record<string, string> = {
    child_1: 'cue -> answer',
  };
  let questionDom = '<p>Question</p>';
  return {
    getBlockDOM: vi.fn().mockImplementation(async () => ({ dom: questionDom })),
    getBlockKramdown: vi.fn(async (blockId: string) => ({
      kramdown: blockMarkdownById[blockId] || '',
    })),
    getBlockBreadcrumb: (...args: [string]) => getBlockBreadcrumbMock(...args),
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
    const siyuanApi = createSiyuanApiMock();
    siyuanApi.__setBlockMarkdown({
      child_1: '纯答案内容',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({ cue: '' }),
        showAnswer: false,
        questionBlockId: 'q_1',
        siyuanApi,
        richContentRenderer,
      },
    });
    await flushPromises();

    expect(wrapper.find('.xiuyuan-current-cue').exists()).toBe(false);
    expect(wrapper.find('.xiuyuan-current-answer').text()).toContain('纯答案内容');
  });

  it('renders current cue and previous answers from child block kramdown with markdown styles', async () => {
    const siyuanApi = createSiyuanApiMock();
    siyuanApi.__setBlockMarkdown({
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
        siyuanApi,
        richContentRenderer,
      },
    });
    await flushPromises();

    const cueBlock = wrapper.find('.xiuyuan-current-cue');
    expect(cueBlock.exists()).toBe(true);
    expect(cueBlock.find('strong').text()).toBe('聚合提示');
    expect(wrapper.find('.xiuyuan-previous-answers strong').text()).toBe('答案一');
  });

  it('removes line-leading Siyuan attrs from ordered-list child review text', async () => {
    const siyuanApi = createSiyuanApiMock();
    siyuanApi.__setBlockMarkdown({
      child_1: '{: updated="20260303165837" id="20260303165824-hzt3oc9"}3->测试 1',
      child_2: '{: id="20260303165825-e4x2b7p" updated="20260303165826"}4',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({
          currentIndex: 1,
          allChildren: [
            { id: 'child_1', cue: '3', answer: '测试 1', index: 0 },
            { id: 'child_2', cue: '', answer: '4', index: 1 },
          ],
        }),
        showAnswer: false,
        questionBlockId: 'q_1',
        siyuanApi,
        richContentRenderer,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('测试 1');
    expect(wrapper.text()).toContain('4');
    expect(wrapper.text()).not.toContain('{:');
    expect(wrapper.text()).not.toContain('updated=');
    expect(wrapper.find('.xiuyuan-current-cue').exists()).toBe(false);
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
        siyuanApi: createSiyuanApiMock(),
        richContentRenderer,
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
    const siyuanApi = createSiyuanApiMock();
    siyuanApi.__setQuestionDom('<p>[[中子星]]:::</p>');
    siyuanApi.__setBlockMarkdown({
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
        siyuanApi,
        richContentRenderer,
        displayMode: 'direct',
      },
    });
    await flushPromises();

    expect(wrapper.find('.cdf-direct-layout').exists()).toBe(true);
    expect(wrapper.text()).toContain('中子星');
    expect(wrapper.text()).toContain('前身');
    expect(wrapper.text()).toContain('→');
    expect(wrapper.text()).toContain('大质量恒星残骸');
    expect(wrapper.text()).not.toContain(':::');
    expect(wrapper.text()).not.toContain('还有');
  });

  it('renders directPath-based concept and group rows for cdf-multiline cards', async () => {
    const siyuanApi = createSiyuanApiMock();
    siyuanApi.__setQuestionDom('<p>特征;;;</p>');
    siyuanApi.__setBlockMarkdown({
      child_1: '类型 -> 描述性（非规范性）',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({
          cue: '类型',
          answer: '描述性（非规范性）',
          allChildren: [
            {
              id: 'child_1',
              cue: '类型',
              answer: '描述性（非规范性）',
              index: 0,
              source: '类型 -> 描述性（非规范性）',
              directPath: [
                { kind: 'concept', label: '[[基于识别的决策模型（RPD）]]', blockId: 'concept-1' },
                { kind: 'group', label: '特征', blockId: 'group-1' },
              ],
            },
          ],
        }),
        showAnswer: false,
        questionBlockId: 'q_1',
        siyuanApi,
        richContentRenderer,
        displayMode: 'direct',
      },
    });
    await flushPromises();

    expect(wrapper.find('.cdf-direct-layout').exists()).toBe(true);
    expect(wrapper.text()).toContain('基于识别的决策模型（RPD）');
    expect(wrapper.text()).toContain('特征');
    expect(wrapper.text()).toContain('↓');
    expect(wrapper.text()).toContain('类型');
    expect(wrapper.text()).toContain('...');
    expect(wrapper.text()).not.toContain('描述性（非规范性）');
  });

  it('keeps complex direct answers in stacked block-flow rows without leaking attribute artifacts', async () => {
    const siyuanApi = createSiyuanApiMock();
    siyuanApi.__setQuestionDom('<p>[[中子星]]:::</p>');
    siyuanApi.__setBlockMarkdown({
      child_1: '前身 -> 第一段\n\n> 引用说明\n{: id="2026042411" updated="2026042412"}',
    });

    const wrapper = mount(XiuyuanListTemplateCard, {
      props: {
        meta: createMeta({
          cue: '前身',
          answer: '第一段',
        }),
        showAnswer: true,
        questionBlockId: 'q_1',
        siyuanApi,
        richContentRenderer,
        displayMode: 'direct',
      },
    });
    await flushPromises();

    expect(wrapper.find('.cdf-direct-layout').exists()).toBe(true);
    expect(wrapper.html()).toContain('cdf-editor__row--stacked');
    expect(wrapper.text()).toContain('第一段');
    expect(wrapper.text()).toContain('引用说明');
    expect(wrapper.text()).not.toContain('{:');
  });
});
