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
        content: 'memory system :: spaced repetition',
        html: '<p>memory system :: spaced repetition</p>',
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
    expect(vm!.frontContent.html).toContain('特征，卡片');
    expect(vm!.frontContent.html).not.toContain('起源，作者');
    expect(vm!.backContent.html).toContain('被设计为独立单元');
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
    expect(vm!.frontContent.html).toContain('特征');
    expect(vm!.frontContent.html).not.toContain('特征，');
    expect(vm!.frontContent.html).not.toContain('起源');
    expect(vm!.backContent.html).toContain('卡片被设计为独立单元');
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
    expect(vm!.frontContent.html).toContain('memory system');
    expect(vm!.frontContent.html).toContain('起源，作者');
    expect(vm!.frontContent.html).toContain('？');
    expect(vm!.frontContent.html).not.toContain('是？');
    expect(vm!.backContent.html).toContain('woz');
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
    expect(vm!.frontContent.html).toContain('起源');
    expect(vm!.frontContent.html).not.toContain('起源，');
    expect(vm!.backContent.html).toContain('学校学习');
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
    expect(vm!.frontContent.html).toContain('woz');
    expect(vm!.frontContent.html).toContain('是谁的');
    expect(vm!.frontContent.html).toContain('起源，作者');
    expect(vm!.backContent.html).toContain('memory system');
    expect(vm!.directScene?.frontMask).toEqual({
      rowKey: 'concept',
      segment: 'whole',
    });
  });

  it('uses faceKey rule direction before stale legacy typeMarker', async () => {
    const { service } = createService('作者→woz');

    const vm = await service.prepareViewModel('descriptor-block', {
      faceKey: { ruleId: 'descriptor-reverse' },
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
    expect(vm!.isReverse).toBe(true);
    expect(vm!.frontContent.html).toContain('woz');
    expect(vm!.frontContent.html).toContain('是谁的');
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
    expect(vm!.frontContent.html).toContain('功能');
    expect(vm!.backContent.html).toContain('生成 ATP');
    expect(vm!.frontContent.html).not.toContain('起源');
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
    expect(vm!.frontContent.html).toContain('前身');
    expect(vm!.backContent.html).toContain('恒星');
    expect(vm!.frontContent.html).not.toContain('defaultAttribute');
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
    expect(vm!.frontContent.html).toContain('保持快速演化');
    expect(vm!.backContent.html).toContain('保持快速演化');
    expect(vm!.frontContent.html).not.toContain('属性');
    expect(vm!.frontContent.html).not.toContain('defaultAttribute');
    expect(vm!.directScene?.rows).toEqual([
      expect.objectContaining({ kind: 'concept', key: 'concept' }),
      expect.objectContaining({ kind: 'standalone', key: 'descriptor-answer' }),
    ]);
  });

  it('marks complex descriptor answers as block-flow and strips trailing attribute artifacts', async () => {
    const { service } = createService('形成过程 ;; 第一段\n\n> 引用说明\n{: id="2026042407" updated="2026042408"}');

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
    const relationRow = vm!.directScene?.rows.find((row) => row.key === 'descriptor');
    expect(relationRow).toEqual(expect.objectContaining({
      kind: 'relation',
    }));
    if (!relationRow || relationRow.kind !== 'relation') {
      throw new Error('Expected relation row');
    }
    expect(relationRow.right.renderKind).toBe('block-flow');
    expect(relationRow.right.html).not.toContain('{:');
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
    expect(vm!.frontContent.html).toContain('descriptor-card-question');
    expect(vm!.frontContent.html).toContain('data-rendered="true"');
    expect(vm!.backContent.html).toContain('descriptor-card-answer-content');
    expect(vm!.frontContent.html).not.toContain('font-size: 22px');
    expect(vm!.backContent.html).not.toContain('font-size: 14px');
  });
});
