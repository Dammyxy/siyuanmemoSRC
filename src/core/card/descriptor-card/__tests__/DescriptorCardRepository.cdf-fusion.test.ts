import { describe, expect, it, vi } from 'vitest';
import { DescriptorCardRepository } from '../infrastructure/DescriptorCardRepository';
import type { SiyuanBlock } from '../infrastructure/SiyuanBlockAdapter';

function createAdapter(options?: { groupParagraphContent?: string; groupParagraphKramdown?: string | null }) {
  const blocks: Record<string, SiyuanBlock> = {
    'descriptor-block': {
      id: 'descriptor-block',
      content: '卡片→被设计为独立单元',
      parentId: 'descriptor-item',
      type: 'p',
    },
    'concept-block': {
      id: 'concept-block',
      content: 'SRS卡片独立单元问题 :: explanation',
      parentId: 'doc-block',
      type: 'p',
    },
    'group-paragraph': {
      id: 'group-paragraph',
      content: options?.groupParagraphContent ?? '特征;;;',
      parentId: 'group-block',
      type: 'p',
    },
  };

  const kramdownById: Record<string, string | null> = {
    'descriptor-block': '卡片→被设计为独立单元',
    'concept-block': 'SRS卡片独立单元问题 :: explanation',
    'group-paragraph': options?.groupParagraphKramdown ?? '特征;;;',
  };

  const parentById: Record<string, string | null> = {
    'descriptor-block': 'descriptor-item',
    'descriptor-item': 'descriptor-list',
    'descriptor-list': 'group-block',
  };

  return {
    getBlockKramdown: vi.fn(async (blockId: string) => kramdownById[blockId] ?? null),
    kramdownToHtml: vi.fn((kramdown: string) => `<p>${kramdown}</p>`),
    getBlock: vi.fn(async (blockId: string) => blocks[blockId] ?? null),
    getParentBlockId: vi.fn(async (blockId: string) => parentById[blockId] ?? null),
    getFirstParagraphChildBlock: vi.fn(async (blockId: string) => (
      blockId === 'group-block' ? blocks['group-paragraph'] : null
    )),
    querySiblingDescriptors: vi.fn(async () => []),
  };
}

describe('DescriptorCardRepository live CDF fusion context', () => {
  it('loads current group hint and child cue-answer from live source blocks', async () => {
    const adapter = createAdapter();
    const repository = new DescriptorCardRepository(adapter as never);

    const result = await repository.loadDescriptorCard('descriptor-block', {
      meta: {
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '旧特征',
          cdf_child_cue: '旧提示',
          cdf_child_answer: '旧答案',
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.cdfFusionContext).toEqual({
      groupBlockId: 'group-block',
      groupParagraphId: 'group-paragraph',
      groupHint: '特征',
      childCue: '卡片',
      childAnswer: '被设计为独立单元',
    });
  });

  it('does not infer CDF fusion context when ancestor group paragraph has no ;;; marker', async () => {
    const adapter = createAdapter({
      groupParagraphContent: '普通标题',
      groupParagraphKramdown: '普通标题',
    });
    const repository = new DescriptorCardRepository(adapter as never);

    const result = await repository.loadDescriptorCard('descriptor-block', {
      meta: {
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
          cdf_group_hint: '旧特征',
          cdf_child_cue: '旧提示',
          cdf_child_answer: '旧答案',
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.cdfFusionContext).toBeUndefined();
  });

  it('uses live CDF concept metadata before parent-chain lookup', async () => {
    const adapter = createAdapter();
    const repository = new DescriptorCardRepository(adapter as never);

    const result = await repository.loadDescriptorCard('descriptor-block', {
      meta: {
        liveRelationKey: 'descriptor-block:concept-block:descriptor-forward',
        relationAuthority: 'live-backlink',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        sourceBlockId: 'descriptor-block',
        conceptBlockId: 'concept-block',
        relationKind: 'descriptor-forward',
      },
    });

    expect(result?.parentConcept).toEqual(expect.objectContaining({
      blockId: 'concept-block',
      isConceptCard: true,
    }));
    expect(adapter.getBlock).not.toHaveBeenCalledWith('descriptor-item');
  });
});
