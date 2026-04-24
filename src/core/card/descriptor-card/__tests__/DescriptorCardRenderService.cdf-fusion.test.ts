import { describe, expect, it, vi } from 'vitest';
import { DescriptorCardRenderService } from '../application/DescriptorCardRenderService';
import type { LiveCdfDescriptorFusionContext } from '../infrastructure/DescriptorCardRepository';

function createService(content: string, options?: { cdfFusionContext?: LiveCdfDescriptorFusionContext }) {
  const repository = {
    loadDescriptorCard: vi.fn().mockResolvedValue({
      blockId: 'descriptor-block',
      content,
      html: `<p>${content}</p>`,
      parentConcept: {
        blockId: 'concept-block',
        content: 'supermemo :: spaced repetition',
        html: '<p>supermemo :: spaced repetition</p>',
        cardTypeMarker: 'concept',
        isConceptCard: true,
      },
      siblingDescriptors: [],
      cdfFusionContext: options?.cdfFusionContext,
    }),
    getCardTypeMarker: vi.fn().mockResolvedValue('descriptor'),
    renderMarkdownFragment: vi.fn((markdown: string) => `<p data-rendered="true">${markdown}</p>`),
  };

  const service = new DescriptorCardRenderService(repository as any, {});
  vi.spyOn(service as any, 'loadBreadcrumbs').mockResolvedValue([]);
  vi.spyOn(service as any, 'loadConceptContext').mockResolvedValue([]);

  return { service, repository };
}

describe('DescriptorCardRenderService CDF fusion', () => {
  it('prefers live CDF fusion context over stale stored snapshot metadata', async () => {
    const { service } = createService('旧数据', {
      cdfFusionContext: {
        groupBlockId: 'group-block',
        groupParagraphId: 'group-paragraph',
        groupHint: '特征',
        childCue: '卡片',
        childAnswer: '被设计为独立单元',
      },
    });

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '起源',
          cdf_child_cue: '作者',
          cdf_child_answer: 'woz',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('特征，卡片');
    expect(vm!.frontHtml).not.toContain('起源，作者');
    expect(vm!.backHtml).toContain('被设计为独立单元');
    expect(vm!.directScene?.rows).toEqual([
      expect.objectContaining({ kind: 'concept', key: 'concept' }),
      expect.objectContaining({ kind: 'group', key: 'group' }),
      expect.objectContaining({ kind: 'relation', key: 'descriptor' }),
    ]);
    expect(vm!.dependencyBlockIds).toEqual(expect.arrayContaining([
      'descriptor-block',
      'concept-block',
      'group-block',
      'group-paragraph',
    ]));
  });

  it('uses live group-only question when current child sentence no longer has cue separator', async () => {
    const { service } = createService('卡片被设计为独立单元', {
      cdfFusionContext: {
        groupBlockId: 'group-block',
        groupParagraphId: 'group-paragraph',
        groupHint: '特征',
        childCue: '',
        childAnswer: '卡片被设计为独立单元',
      },
    });

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '起源',
          cdf_child_cue: '作者',
          cdf_child_answer: 'woz',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('特征');
    expect(vm!.frontHtml).not.toContain('特征，');
    expect(vm!.frontHtml).not.toContain('起源');
    expect(vm!.backHtml).toContain('卡片被设计为独立单元');
  });

  it('renders forward fused question for cdf metadata', async () => {
    const { service } = createService('作者→woz');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '起源',
          cdf_child_cue: '作者',
          cdf_child_answer: 'woz',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('supermemo');
    expect(vm!.frontHtml).toContain('起源，作者');
    expect(vm!.frontHtml).toContain('？');
    expect(vm!.frontHtml).not.toContain('是？');
    expect(vm!.backHtml).toContain('woz');
    expect(vm!.directScene?.frontMask).toEqual({
      rowKey: 'descriptor',
      segment: 'right',
    });
    expect(vm!.dependencyBlockIds).toEqual(expect.arrayContaining([
      'descriptor-block',
      'concept-block',
    ]));
  });

  it('falls back to group-only question when child cue is empty', async () => {
    const { service } = createService('学校学习');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '起源',
          cdf_child_cue: '',
          cdf_child_answer: '学校学习',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('起源');
    expect(vm!.frontHtml).not.toContain('起源，');
    expect(vm!.backHtml).toContain('学校学习');
  });

  it('applies fusion attribute in reverse cards without changing reverse sentence pattern', async () => {
    const { service } = createService('作者→woz');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-reverse',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '起源',
          cdf_child_cue: '作者',
          cdf_child_answer: 'woz',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('woz');
    expect(vm!.frontHtml).toContain('是谁的');
    expect(vm!.frontHtml).toContain('起源，作者');
    expect(vm!.backHtml).toContain('supermemo');
    expect(vm!.directScene?.frontMask).toEqual({
      rowKey: 'concept',
      segment: 'whole',
    });
  });

  it('keeps non-cdf descriptor rendering unchanged', async () => {
    const { service } = createService('功能 ;; 生成 ATP');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('功能');
    expect(vm!.backHtml).toContain('生成 ATP');
    expect(vm!.frontHtml).not.toContain('起源');
  });

  it('projects raw descriptor relations when no live fusion context or cdf field mapping is available', async () => {
    const { service } = createService('前身→恒星');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.attribute).toBe('前身');
    expect(vm!.description).toBe('恒星');
    expect(vm!.frontHtml).toContain('前身');
    expect(vm!.backHtml).toContain('恒星');
    expect(vm!.frontHtml).not.toContain('defaultAttribute');
  });

  it('falls back to the raw line instead of surfacing the defaultAttribute sentinel', async () => {
    const { service } = createService('保持快速演化');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.attribute).toBe('');
    expect(vm!.description).toBe('保持快速演化');
    expect(vm!.frontHtml).toContain('保持快速演化');
    expect(vm!.backHtml).toContain('保持快速演化');
    expect(vm!.frontHtml).not.toContain('属性');
    expect(vm!.frontHtml).not.toContain('defaultAttribute');
    expect(vm!.directScene?.rows).toEqual([
      expect.objectContaining({ kind: 'concept', key: 'concept' }),
      expect.objectContaining({ kind: 'standalone', key: 'descriptor-answer' }),
    ]);
  });

  it('emits class-based descriptor markup without legacy inline font sizes', async () => {
    const { service } = createService('**前身** ;; `恒星`');

    const vm = await service.prepareViewModel('descriptor-block', {
      meta: {
        typeMarker: 'descriptor-forward',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
        },
      },
    });

    expect(vm).not.toBeNull();
    expect(vm!.frontHtml).toContain('descriptor-card-question');
    expect(vm!.frontHtml).toContain('data-rendered="true"');
    expect(vm!.backHtml).toContain('descriptor-card-answer-content');
    expect(vm!.frontHtml).not.toContain('font-size: 22px');
    expect(vm!.backHtml).not.toContain('font-size: 14px');
  });
});
