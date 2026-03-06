import { describe, expect, it } from 'vitest';
import { QuickCardPostCreationPlanner } from '../QuickCardPostCreationPlanner';

describe('QuickCardPostCreationPlanner', () => {
  const planner = new QuickCardPostCreationPlanner();

  it('returns the same multi-cloze inline formula plan for native riff sync and auto listener', () => {
    const content = '$$P(A|B)=\\\\cloze{c1}{P(B|A)}$$';

    const nativePlan = planner.plan({
      blockId: '20260301120000-native',
      content,
      source: 'native-riff-sync',
      resolvedCardType: 'item',
    });
    const listenerPlan = planner.plan({
      blockId: '20260301120000-listener',
      content,
      source: 'auto-card-listener',
      resolvedCardType: 'item',
    });

    expect(nativePlan.mode).toBe('multi-cloze');
    expect(nativePlan.templateId).toBe('builtin-multi-cloze');
    expect(nativePlan.renderMode).toBe('inline-formula-cloze');
    expect(listenerPlan).toEqual(nativePlan);
  });

  it('routes native mark cloze through multi-cloze while preserving resolved cardType', () => {
    const nativePlan = planner.plan({
      blockId: '20260301120000-default1',
      content: 'alpha ==beta== gamma',
      source: 'native-riff-sync',
      resolvedCardType: 'topic',
    });
    const listenerPlan = planner.plan({
      blockId: '20260301120000-default2',
      content: 'alpha ==beta== gamma',
      source: 'auto-card-listener',
      resolvedCardType: 'item',
    });

    expect(nativePlan.mode).toBe('multi-cloze');
    expect(nativePlan.templateId).toBe('builtin-multi-cloze');
    expect(nativePlan.cardType).toBe('topic');
    expect(listenerPlan.mode).toBe('multi-cloze');
    expect(listenerPlan.templateId).toBe('builtin-multi-cloze');
    expect(listenerPlan.cardType).toBe('item');
  });

  it('keeps list-template structural plan while switching cardType to topic when resolved as topic', () => {
    const plan = planner.plan({
      blockId: '20260301120000-list1',
      blockType: 'i',
      content: 'Question >>>',
      source: 'block-menu-manual',
      resolvedCardType: 'topic',
    });

    expect(plan.templateId).toBe('builtin-list-item');
    expect(plan.cardType).toBe('topic');
    expect(plan.hints.ruleId).toBe('ListTemplateStructuralRule');
  });

  it('does not route superblock triple braces to quick cloze for native riff sync', () => {
    const nativePlan = planner.plan({
      blockId: '20260301120000-default3',
      content: '{{{row 超级块测试1\n3333}}}',
      source: 'native-riff-sync',
      resolvedCardType: 'item',
    });

    expect(nativePlan.mode).toBe('single');
    expect(nativePlan.templateId).toBe('builtin-riff-sync');
  });
});
