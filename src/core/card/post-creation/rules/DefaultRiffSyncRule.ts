import type { CreationDecision, PostCreationContext, PostCreationRule } from '../contracts';

export class DefaultRiffSyncRule implements PostCreationRule {
  readonly id = 'DefaultRiffSyncRule';

  match(context: PostCreationContext): CreationDecision | null {
    if (context.source !== 'native-riff-sync') {
      return null;
    }

    const fallbackCardType = context.resolvedCardType || 'topic';
    return {
      id: this.id,
      family: 'default-riff',
      templateId: 'builtin-riff-sync',
      cardType: fallbackCardType,
      mode: 'single',
      executorKind: 'default-riff-sync',
      priority: -1,
      conflictGroup: 'single-block',
    };
  }
}

