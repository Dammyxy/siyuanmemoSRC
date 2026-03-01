import { describe, expect, it, vi } from 'vitest';
import { DescriptorCardRenderService } from '../application/DescriptorCardRenderService';

function createService(content: string) {
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
    }),
    getCardTypeMarker: vi.fn().mockResolvedValue('descriptor'),
  };

  const service = new DescriptorCardRenderService(repository as any, {});
  vi.spyOn(service as any, 'loadBreadcrumbs').mockResolvedValue([]);
  vi.spyOn(service as any, 'loadConceptContext').mockResolvedValue([]);

  return { service, repository };
}

describe('DescriptorCardRenderService CDF fusion', () => {
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
    expect(vm!.frontHtml).toContain('是？');
    expect(vm!.backHtml).toContain('woz');
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
});
