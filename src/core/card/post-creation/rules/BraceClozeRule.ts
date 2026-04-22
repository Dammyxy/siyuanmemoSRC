import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasBraceCloze, hasNumberedLatexCloze } from './rule-utils';

export class BraceClozeRule implements PostCreationRule {
  readonly id = 'BraceClozeRule';

  match(context: PostCreationContext): CreationDecision | null {
    const content = String(context.content || '');
    if (!hasBraceCloze(content) || hasNumberedLatexCloze(content)) {
      return null;
    }

    return {
      id: this.id,
      family: 'cloze',
      templateId: 'builtin-multi-cloze',
      cardType: 'item',
      mode: 'multi-face',
      executorKind: 'quick-cloze',
      priority: 85,
      conflictGroup: 'single-block',
    };
  }
}
