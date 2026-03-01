import { describe, expect, it, vi } from 'vitest';
import { PostCreationConflictMediator } from '../PostCreationConflictMediator';
import type { CreationPlan } from '@/core/card/post-creation/contracts';

function buildPlan(): CreationPlan {
  return {
    source: 'doc-oneclick-scan',
    blockId: '20260101010101-abcdefg',
    decisions: [
      {
        id: 'cloze-rule',
        family: 'cloze',
        templateId: 'builtin-multi-cloze',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-cloze',
        priority: 100,
        conflictGroup: 'single-block',
      },
      {
        id: 'basic-rule',
        family: 'basic',
        templateId: 'builtin-quick-card',
        cardType: 'item',
        mode: 'single',
        executorKind: 'quick-basic',
        priority: 80,
        conflictGroup: 'single-block',
      },
    ],
    conflicts: [
      {
        blockId: '20260101010101-abcdefg',
        group: 'single-block',
        decisionIds: ['cloze-rule', 'basic-rule'],
        families: ['cloze', 'basic'],
      },
    ],
    diagnostics: {
      matchedRuleIds: ['cloze-rule', 'basic-rule'],
      decisionCount: 2,
    },
  };
}

describe('PostCreationConflictMediator', () => {
  it('applies default semantic-first strategy when no prompt provided', async () => {
    const mediator = new PostCreationConflictMediator();
    const runContext = mediator.createRunContext();
    const result = await mediator.resolveSingleDecision(buildPlan(), runContext);

    expect(result.conflicted).toBe(true);
    expect(result.decision?.id).toBe('cloze-rule');
    expect(result.strategyUsed).toBe('semantic-first');
  });

  it('prompts only once per run context', async () => {
    const mediator = new PostCreationConflictMediator();
    const runContext = mediator.createRunContext();
    const chooseStrategy = vi.fn().mockResolvedValue('basic-first');
    const promptPort = { chooseStrategy };

    const first = await mediator.resolveSingleDecision(buildPlan(), runContext, { promptPort });
    const second = await mediator.resolveSingleDecision(buildPlan(), runContext, { promptPort });

    expect(first.decision?.id).toBe('basic-rule');
    expect(second.decision?.id).toBe('basic-rule');
    expect(chooseStrategy).toHaveBeenCalledTimes(1);
  });

  it('skips conflicted decisions when user selects skip', async () => {
    const mediator = new PostCreationConflictMediator();
    const runContext = mediator.createRunContext();
    runContext.hasPrompted = true;
    runContext.chosenStrategy = 'skip';

    const result = await mediator.resolveSingleDecision(buildPlan(), runContext);
    expect(result.conflicted).toBe(true);
    expect(result.decision).toBeNull();
    expect(result.strategyUsed).toBe('skip');
  });
});

