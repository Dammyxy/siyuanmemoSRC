import { describe, expect, it } from 'vitest';
import { UnifiedPostCreationPlanner } from '@/core/card/post-creation/UnifiedPostCreationPlanner';

function planFamilies(content: string): string[] {
  const planner = new UnifiedPostCreationPlanner();
  return planner.plan({
    blockId: '20260301120000-abcd123',
    content,
    source: 'symbol-listener',
    blockType: 'p',
    resolvedCardType: 'item',
  }).decisions.map((decision) => decision.family);
}

describe('AutoCardHandler triple symbol exclusions', () => {
  it('does not route concept multiline tails to inline concept-definition', () => {
    expect(planFamilies('((20260301120000-abcd123)) :::')).not.toContain('concept-definition');
    expect(planFamilies('((20260301120000-abcd123)) ：：：')).not.toContain('concept-definition');
  });

  it('does not route descriptor multiline tails to inline descriptor', () => {
    expect(planFamilies('A ;;;')).not.toContain('descriptor');
    expect(planFamilies('A ；；；')).not.toContain('descriptor');
  });
});
