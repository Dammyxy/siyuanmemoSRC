import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';
import { hasAnyDescriptorSymbol, resolveDescriptorDirection } from './rule-utils';

export class DescriptorInlineRule implements PostCreationRule {
  readonly id = 'DescriptorInlineRule';

  match(context: PostCreationContext): CreationDecision | null {
    if (!context.capabilities?.allowInlineSemanticRules) {
      return null;
    }

    const content = String(context.content || '');
    if (!hasAnyDescriptorSymbol(content)) {
      return null;
    }

    const direction = resolveDescriptorDirection(content);
    const templateId = direction === 'forward'
      ? 'builtin-concept-descriptor'
      : direction === 'backward'
        ? 'builtin-concept-descriptor-reverse'
        : 'builtin-concept-descriptor-both';

    return {
      id: this.id,
      family: 'descriptor',
      templateId,
      cardType: 'descriptor',
      mode: direction === 'both' ? 'multi-face' : 'single',
      executorKind: 'descriptor-inline',
      renderProfile: 'descriptor',
      direction,
      priority: 90,
      conflictGroup: 'single-block',
    };
  }
}

