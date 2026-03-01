import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasNumberedLatexCloze } from './rule-utils';

export class NumberedLatexClozeRule implements PostCreationRule {
  readonly id = 'NumberedLatexClozeRule';

  match(context: PostCreationContext): CreationDecision | null {
    if (!hasNumberedLatexCloze(String(context.content || ''))) {
      return null;
    }

    return {
      id: this.id,
      family: 'cloze',
      templateId: 'builtin-multi-cloze',
      cardType: 'item',
      mode: 'multi-face',
      executorKind: 'quick-cloze',
      renderProfile: 'quick-inline-formula',
      priority: 100,
      conflictGroup: 'single-block',
      hints: {
        forceQuickRender: true,
        quickDetectReason: 'cloze-latex-numbered',
      },
    };
  }
}

