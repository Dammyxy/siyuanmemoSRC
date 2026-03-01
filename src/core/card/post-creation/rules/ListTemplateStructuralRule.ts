import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasListTemplateTail } from './rule-utils';

export class ListTemplateStructuralRule implements PostCreationRule {
  readonly id = 'ListTemplateStructuralRule';

  match(context: PostCreationContext): CreationDecision | null {
    if (!context.capabilities?.allowStructuralRules) {
      return null;
    }

    if (context.blockType !== 'i') {
      return null;
    }

    const content = String(context.content || '');
    if (!hasListTemplateTail(content)) {
      return null;
    }

    return {
      id: this.id,
      family: 'list-template',
      templateId: 'builtin-list-item',
      cardType: 'item',
      mode: 'split-list',
      executorKind: 'list-template-structural',
      renderProfile: 'list-progressive',
      priority: 100,
      conflictGroup: 'structural',
    };
  }
}

