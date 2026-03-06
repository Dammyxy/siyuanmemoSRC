import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasMarkCloze, hasNumberedLatexCloze } from './rule-utils';

export class MarkClozeRule implements PostCreationRule {
  readonly id = 'MarkClozeRule';

  match(context: PostCreationContext): CreationDecision | null {
    const content = String(context.content || '');
    if (!hasMarkCloze(content) || hasNumberedLatexCloze(content)) {
      return null;
    }

    return {
      id: this.id,
      family: 'cloze',
      templateId: 'builtin-multi-cloze',
      cardType: context.resolvedCardType === 'topic' ? 'topic' : 'item',
      mode: 'multi-face',
      executorKind: 'quick-cloze',
      renderProfile: 'quick-default',
      priority: 80,
      conflictGroup: 'single-block',
    };
  }
}
