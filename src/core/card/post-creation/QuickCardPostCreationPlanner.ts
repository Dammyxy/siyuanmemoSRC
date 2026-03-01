export type PostCreationSource = 'native-riff-sync' | 'auto-card-listener';
export type PlannedCardType = 'topic' | 'item' | 'concept' | 'descriptor';
export type PostCreationMode = 'single' | 'multi-cloze';
export type PostCreationFacesPlan = 'single-face' | 'per-cloze-face';
export type PostCreationRenderMode = 'default' | 'inline-formula-cloze';
export type PostCreationQuickDetectReason = 'cloze-latex-numbered';

export interface QuickCardPostCreationContext {
  blockId: string;
  content: string;
  source: PostCreationSource;
  resolvedCardType?: PlannedCardType;
}

export interface PostCreationPlan {
  mode: PostCreationMode;
  templateId: string;
  cardType: PlannedCardType;
  facesPlan: PostCreationFacesPlan;
  renderMode: PostCreationRenderMode;
  hints: {
    ruleId: string;
    forceQuickRender?: boolean;
    quickDetectReason?: PostCreationQuickDetectReason;
  };
}

interface PostCreationRule {
  id: string;
  matches(context: QuickCardPostCreationContext): boolean;
  buildPlan(context: QuickCardPostCreationContext): PostCreationPlan;
}

class NumberedLatexClozeRule implements PostCreationRule {
  readonly id = 'NumberedLatexClozeRule';

  matches(context: QuickCardPostCreationContext): boolean {
    return /\\+cloze\{c\d+\}\{/i.test(String(context.content || ''));
  }

  buildPlan(_context: QuickCardPostCreationContext): PostCreationPlan {
    return {
      mode: 'multi-cloze',
      templateId: 'builtin-multi-cloze',
      cardType: 'item',
      facesPlan: 'per-cloze-face',
      renderMode: 'inline-formula-cloze',
      hints: {
        ruleId: this.id,
        forceQuickRender: true,
        quickDetectReason: 'cloze-latex-numbered',
      },
    };
  }
}

class DefaultRiffSyncRule implements PostCreationRule {
  readonly id = 'DefaultRiffSyncRule';

  matches(_context: QuickCardPostCreationContext): boolean {
    return true;
  }

  buildPlan(context: QuickCardPostCreationContext): PostCreationPlan {
    const fallbackCardType: PlannedCardType = context.source === 'auto-card-listener' ? 'item' : 'topic';

    return {
      mode: 'single',
      templateId: context.source === 'native-riff-sync' ? 'builtin-riff-sync' : 'builtin-quick-card',
      cardType: context.resolvedCardType || fallbackCardType,
      facesPlan: 'single-face',
      renderMode: 'default',
      hints: {
        ruleId: this.id,
      },
    };
  }
}

export class QuickCardPostCreationPlanner {
  private readonly rules: PostCreationRule[];

  constructor(rules?: PostCreationRule[]) {
    this.rules = rules || [
      new NumberedLatexClozeRule(),
      new DefaultRiffSyncRule(),
    ];
  }

  plan(context: QuickCardPostCreationContext): PostCreationPlan {
    for (const rule of this.rules) {
      if (!rule.matches(context)) {
        continue;
      }
      return rule.buildPlan(context);
    }

    // Should never happen because DefaultRiffSyncRule is terminal.
    return new DefaultRiffSyncRule().buildPlan(context);
  }
}

