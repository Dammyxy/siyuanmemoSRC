import { describe, expect, it } from 'vitest';
import { UnifiedPostCreationPlanner } from '../UnifiedPostCreationPlanner';

describe('UnifiedPostCreationPlanner', () => {
  it('disables structural rules for symbol-listener source', () => {
    const planner = new UnifiedPostCreationPlanner();
    const plan = planner.plan({
      blockId: '20260101010101-abcdefg',
      content: 'Question >>>',
      source: 'symbol-listener',
      blockType: 'i',
    });

    expect(plan.decisions.some((decision) => decision.family === 'list-template')).toBe(false);
    expect(plan.decisions.some((decision) => decision.family === 'cdf-multiline')).toBe(false);
  });

  it('disables structural rules for doc-oneclick-scan source in V1', () => {
    const planner = new UnifiedPostCreationPlanner();
    const plan = planner.plan({
      blockId: '20260101010101-abcdefg',
      content: 'Question >>>',
      source: 'doc-oneclick-scan',
      blockType: 'i',
    });

    expect(plan.decisions.some((decision) => decision.family === 'list-template')).toBe(false);
    expect(plan.decisions.some((decision) => decision.family === 'cdf-multiline')).toBe(false);
  });

  it('keeps inline semantic routing for doc-oneclick-scan source', () => {
    const planner = new UnifiedPostCreationPlanner();
    const conceptPlan = planner.plan({
      blockId: '20260101010101-abcdefg',
      content: '((20260101010101-abc1234)) :: definition',
      source: 'doc-oneclick-scan',
      blockType: 'p',
    });
    const descriptorPlan = planner.plan({
      blockId: '20260101010101-abcd001',
      content: 'attribute ;; description',
      source: 'doc-oneclick-scan',
      blockType: 'p',
    });

    expect(conceptPlan.decisions.some((decision) => decision.family === 'concept-definition')).toBe(true);
    expect(descriptorPlan.decisions.some((decision) => decision.family === 'descriptor')).toBe(true);
  });

  it('routes native-riff semantic definition to concept-definition template', () => {
    const planner = new UnifiedPostCreationPlanner();
    const plan = planner.plan({
      blockId: '20260101010101-abcdefg',
      content: '((20260101010101-abc1234)) :: definition',
      source: 'native-riff-sync',
      blockType: 'p',
      resolvedCardType: 'topic',
    });

    expect(plan.decisions[0]?.templateId).toBe('builtin-concept-definition');
    expect(plan.decisions[0]?.family).toBe('concept-definition');
  });
});

