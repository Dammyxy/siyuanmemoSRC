import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasConceptMultilineTail, hasDescriptorMultilineTail } from './rule-utils';

export class CdfMultilineStructuralRule implements PostCreationRule {
  readonly id = 'CdfMultilineStructuralRule';

  match(context: PostCreationContext): CreationDecision | null {
    if (!context.capabilities?.allowStructuralRules) {
      return null;
    }

    if (context.blockType !== 'i') {
      return null;
    }

    const content = String(context.content || '');
    if (hasConceptMultilineTail(content)) {
      return {
        id: this.id,
        family: 'cdf-multiline',
        templateId: 'builtin-list-concept-multiline',
        cardType: 'descriptor',
        mode: 'cdf-batch',
        executorKind: 'cdf-multiline-structural',
        renderProfile: 'cdf-multiline',
        priority: 110,
        conflictGroup: 'structural',
      };
    }

    if (hasDescriptorMultilineTail(content)) {
      return {
        id: this.id,
        family: 'cdf-multiline',
        templateId: 'builtin-list-descriptor-multiline',
        cardType: 'descriptor',
        mode: 'cdf-batch',
        executorKind: 'cdf-multiline-structural',
        renderProfile: 'cdf-multiline',
        priority: 110,
        conflictGroup: 'structural',
      };
    }

    return null;
  }
}

