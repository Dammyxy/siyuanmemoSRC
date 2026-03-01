import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasGenericCloze, hasNumberedLatexCloze } from './rule-utils';

export class GenericClozeRule implements PostCreationRule {
  readonly id = 'GenericClozeRule';

  match(context: PostCreationContext): CreationDecision | null {
    const content = String(context.content || '');
    if (!hasGenericCloze(content)) {
      return null;
    }

    if (hasNumberedLatexCloze(content)) {
      // Let numbered-latex rule own this path.
      return null;
    }

    return {
      id: this.id,
      family: 'cloze',
      templateId: 'builtin-multi-cloze',
      cardType: 'item',
      mode: 'multi-face',
      executorKind: 'quick-cloze',
      renderProfile: 'quick-default',
      priority: 80,
      conflictGroup: 'single-block',
    };
  }
}

