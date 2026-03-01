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

  it('keeps source-specific defaults for non-formula content', () => {
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

    expect(nativePlan.mode).toBe('single');
    expect(nativePlan.templateId).toBe('builtin-riff-sync');
    expect(listenerPlan.mode).toBe('single');
    expect(listenerPlan.templateId).toBe('builtin-quick-card');
  });
});

