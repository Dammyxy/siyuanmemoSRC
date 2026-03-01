import { UnifiedPostCreationPlanner } from './UnifiedPostCreationPlanner';
import type { CreationSource } from './contracts';

export type PostCreationSource =
  | 'native-riff-sync'
  | 'auto-card-listener'
  | 'symbol-listener'
  | 'doc-oneclick-scan'
  | 'block-menu-manual';

export type PlannedCardType = 'topic' | 'item' | 'concept' | 'descriptor';
export type PostCreationMode = 'single' | 'multi-cloze';
export type PostCreationFacesPlan = 'single-face' | 'per-cloze-face';
export type PostCreationRenderMode = 'default' | 'inline-formula-cloze';
export type PostCreationQuickDetectReason = 'cloze-latex-numbered';

export interface QuickCardPostCreationContext {
  blockId: string;
  content: string;
  source: PostCreationSource;
  blockType?: string;
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

function normalizeSource(source: PostCreationSource): CreationSource {
  if (source === 'auto-card-listener') {
    return 'symbol-listener';
  }
  return source;
}

export class QuickCardPostCreationPlanner {
  private readonly planner: UnifiedPostCreationPlanner;

  constructor(planner?: UnifiedPostCreationPlanner) {
    this.planner = planner || new UnifiedPostCreationPlanner();
  }

  plan(context: QuickCardPostCreationContext): PostCreationPlan {
    const normalizedSource = normalizeSource(context.source);
    const creationPlan = this.planner.plan({
      blockId: context.blockId,
      content: context.content,
      source: normalizedSource,
      blockType: context.blockType,
      resolvedCardType: context.resolvedCardType,
    });

    const decision = creationPlan.decisions[0];
    if (!decision) {
      const fallbackCardType: PlannedCardType = normalizedSource === 'symbol-listener' ? 'item' : 'topic';
      return {
        mode: 'single',
        templateId: normalizedSource === 'native-riff-sync' ? 'builtin-riff-sync' : 'builtin-quick-card',
        cardType: context.resolvedCardType || fallbackCardType,
        facesPlan: 'single-face',
        renderMode: 'default',
        hints: {
          ruleId: 'QuickCardPostCreationPlannerFallback',
        },
      };
    }

    const isMultiClozeDecision = decision.family === 'cloze' && decision.mode === 'multi-face';

    return {
      mode: isMultiClozeDecision ? 'multi-cloze' : 'single',
      templateId: decision.templateId,
      cardType: decision.cardType,
      facesPlan: isMultiClozeDecision ? 'per-cloze-face' : 'single-face',
      renderMode: decision.renderProfile === 'quick-inline-formula' ? 'inline-formula-cloze' : 'default',
      hints: {
        ruleId: decision.id,
        forceQuickRender: decision.hints?.forceQuickRender === true ? true : undefined,
        quickDetectReason: decision.hints?.quickDetectReason === 'cloze-latex-numbered'
          ? 'cloze-latex-numbered'
          : undefined,
      },
    };
  }
}
