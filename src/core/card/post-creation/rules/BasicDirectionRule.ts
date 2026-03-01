import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasBasicDirectionSymbol, resolveBasicDirection } from './rule-utils';

export class BasicDirectionRule implements PostCreationRule {
  readonly id = 'BasicDirectionRule';

  match(context: PostCreationContext): CreationDecision | null {
    const content = String(context.content || '');
    if (!hasBasicDirectionSymbol(content)) {
      return null;
    }

    const direction = resolveBasicDirection(content);
    const bidirectional = direction === 'both';

    return {
      id: this.id,
      family: 'basic',
      templateId: bidirectional ? 'builtin-bidirectional-single' : 'builtin-quick-card',
      cardType: 'item',
      mode: bidirectional ? 'multi-face' : 'single',
      executorKind: 'quick-basic',
      renderProfile: 'quick-default',
      direction,
      priority: 50,
      conflictGroup: 'single-block',
      hints: {
        isBidirectional: bidirectional,
      },
    };
  }
}

