import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { parseBasicDirectionContent } from './rule-utils';

export class BasicDirectionRule implements PostCreationRule {
  readonly id = 'BasicDirectionRule';

  match(context: PostCreationContext): CreationDecision | null {
    const parsed = parseBasicDirectionContent(String(context.content || ''));
    if (!parsed) {
      return null;
    }

    const bidirectional = parsed.direction === 'both';

    return {
      id: this.id,
      family: 'basic',
      templateId: bidirectional ? 'builtin-bidirectional-single' : 'builtin-quick-card',
      cardType: 'item',
      mode: bidirectional ? 'multi-face' : 'single',
      executorKind: 'quick-basic',
      renderProfile: 'quick-default',
      direction: parsed.direction,
      priority: 50,
      conflictGroup: 'single-block',
      hints: {
        isBidirectional: bidirectional,
      },
    };
  }
}
