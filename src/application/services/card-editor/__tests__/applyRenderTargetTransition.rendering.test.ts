import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import { buildReviewRenderableRenderPolicy } from '@/application/adapters/reviewRenderableRenderPolicy';
import {
  applyRenderTargetTransition,
} from '../applyRenderTargetTransition';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'descriptor-block',
    faceKey: overrides.faceKey ? { ...overrides.faceKey } : undefined,
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
  };
}

function createDescriptorService() {
  const repository = {
    loadDescriptorCard: vi.fn().mockResolvedValue({
      blockId: 'descriptor-block',
      content: '作者→woz',
      html: '<p>作者→woz</p>',
      parentConcept: {
        blockId: 'concept-block',
        content: 'memory system :: spaced repetition',
        html: '<p>memory system :: spaced repetition</p>',
        cardTypeMarker: 'concept',
        isConceptCard: true,
      },
      siblingDescriptors: [],
    }),
    getCardTypeMarker: vi.fn().mockResolvedValue('descriptor'),
    renderMarkdownFragment: vi.fn((markdown: string) => `<p data-rendered="true">${markdown}</p>`),
  };

  const service = new DescriptorCardRenderService(repository as never, {});
  vi.spyOn(service as never, 'loadBreadcrumbs').mockResolvedValue([]);
  vi.spyOn(service as never, 'loadConceptContext').mockResolvedValue([]);
  return service;
}

describe('applyRenderTargetTransition rendering integration', () => {
  it('updates real descriptor renderer direction and cache identity when faceKey disagrees with legacy metadata', async () => {
    const service = createDescriptorService();
    const before = buildCard({
      faceKey: { ruleId: 'descriptor-reverse', faceIndex: 1 },
      meta: {
        renderProfile: 'descriptor',
        typeMarker: 'concept-descriptor-forward',
        templateID: 'builtin-concept-descriptor',
      },
    });

    const forward = applyRenderTargetTransition(before, 'descriptor-forward').card;
    const reverse = applyRenderTargetTransition(forward, 'descriptor-reverse').card;
    const forwardVm = await service.prepareViewModel('descriptor-block', forward);
    const reverseVm = await service.prepareViewModel('descriptor-block', reverse);
    const forwardPolicy = buildReviewRenderableRenderPolicy(forward);
    const reversePolicy = buildReviewRenderableRenderPolicy(reverse);

    expect(forwardVm?.isReverse).toBe(false);
    expect(forwardVm?.frontHtml).toContain('memory system');
    expect(forwardVm?.backHtml).toContain('woz');
    expect(forwardPolicy.cacheTokens).toMatchObject({
      faceToken: 'rule:descriptor-forward::face:1',
      ruleId: 'descriptor-forward',
    });

    expect(reverseVm?.isReverse).toBe(true);
    expect(reverseVm?.frontHtml).toContain('woz');
    expect(reverseVm?.backHtml).toContain('memory system');
    expect(reversePolicy.cacheTokens).toMatchObject({
      faceToken: 'rule:descriptor-reverse::face:1',
      ruleId: 'descriptor-reverse',
    });
    expect(reversePolicy.cacheTokens.faceToken).not.toBe(forwardPolicy.cacheTokens.faceToken);
    expect(reversePolicy.cacheTokens.ruleId).not.toBe(forwardPolicy.cacheTokens.ruleId);
  });
});
