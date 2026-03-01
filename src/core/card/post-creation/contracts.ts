export type CreationSource =
  | 'symbol-listener'
  | 'native-riff-sync'
  | 'doc-oneclick-scan'
  | 'block-menu-manual';

export type CreationRuleFamily =
  | 'basic'
  | 'cloze'
  | 'concept-definition'
  | 'descriptor'
  | 'list-template'
  | 'cdf-multiline'
  | 'default-riff';

export type PlannedCardType = 'topic' | 'item' | 'concept' | 'descriptor';

export type CreationMode = 'single' | 'multi-face' | 'split-list' | 'summary-list' | 'cdf-batch';

export type RenderProfile =
  | 'quick-default'
  | 'quick-inline-formula'
  | 'concept-definition'
  | 'descriptor'
  | 'concept'
  | 'list-progressive'
  | 'list-summary'
  | 'cdf-multiline';

export type ConflictResolutionStrategy = 'semantic-first' | 'cloze-first' | 'basic-first';

export type ExecutorKind =
  | 'quick-basic'
  | 'quick-cloze'
  | 'concept-definition-inline'
  | 'descriptor-inline'
  | 'list-template-structural'
  | 'cdf-multiline-structural'
  | 'default-riff-sync'
  | 'manual-template';

export interface PostCreationCapabilities {
  allowStructuralRules: boolean;
  allowInlineSemanticRules: boolean;
}

export interface PostCreationContext {
  blockId: string;
  content: string;
  source: CreationSource;
  blockType?: string;
  resolvedCardType?: PlannedCardType;
  capabilities?: Partial<PostCreationCapabilities>;
}

export interface CreationDecision {
  id: string;
  family: CreationRuleFamily;
  templateId: string;
  cardType: PlannedCardType;
  mode: CreationMode;
  executorKind: ExecutorKind;
  renderProfile?: RenderProfile;
  direction?: 'forward' | 'backward' | 'both';
  priority: number;
  conflictGroup?: string;
  hints?: Record<string, unknown>;
}

export interface CreationConflict {
  blockId: string;
  group: string;
  decisionIds: string[];
  families: CreationRuleFamily[];
}

export interface CreationPlan {
  source: CreationSource;
  blockId: string;
  decisions: CreationDecision[];
  conflicts: CreationConflict[];
  diagnostics: {
    matchedRuleIds: string[];
    decisionCount: number;
  };
}

export interface PostCreationRule {
  id: string;
  match(context: PostCreationContext): CreationDecision | null;
}

export function resolveDefaultCapabilities(source: CreationSource): PostCreationCapabilities {
  switch (source) {
    case 'block-menu-manual':
      return {
        allowStructuralRules: true,
        allowInlineSemanticRules: true,
      };
    case 'doc-oneclick-scan':
      return {
        allowStructuralRules: false,
        allowInlineSemanticRules: true,
      };
    case 'native-riff-sync':
    case 'symbol-listener':
    default:
      return {
        allowStructuralRules: false,
        allowInlineSemanticRules: true,
      };
  }
}
