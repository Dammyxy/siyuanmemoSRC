import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import {
  hasAnyConceptDefinitionSymbol,
  hasConceptReference,
  resolveConceptDefinitionDirection,
} from './rule-utils';

export class ConceptDefinitionInlineRule implements PostCreationRule {
  readonly id = 'ConceptDefinitionInlineRule';

  match(context: PostCreationContext): CreationDecision | null {
    if (!context.capabilities?.allowInlineSemanticRules) {
      return null;
    }

    const content = String(context.content || '');
    if (!hasAnyConceptDefinitionSymbol(content)) {
      return null;
    }
    if (!hasConceptReference(content)) {
      return null;
    }

    const direction = resolveConceptDefinitionDirection(content);
    const templateId = direction === 'forward'
      ? 'builtin-concept-definition-forward'
      : direction === 'backward'
        ? 'builtin-concept-definition-reverse'
        : 'builtin-concept-definition';

    return {
      id: this.id,
      family: 'concept-definition',
      templateId,
      cardType: 'descriptor',
      mode: direction === 'both' ? 'multi-face' : 'single',
      executorKind: 'concept-definition-inline',
      renderProfile: 'concept-definition',
      direction,
      priority: 95,
      conflictGroup: 'single-block',
    };
  }
}

