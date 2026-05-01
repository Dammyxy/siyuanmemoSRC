import type {
  BackendAutoCardDecisionProjection,
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
} from '../../packages/contracts/src/backend-rpc';
import { UnifiedPostCreationPlanner } from '@/core/card/post-creation/UnifiedPostCreationPlanner';
import type {
  ConflictResolutionStrategy,
  CreationDecision,
  CreationPlan,
  CreationRuleFamily,
} from '@/core/card/post-creation/contracts';
import { ClozeDetector } from '@/utils/cloze-detector';

const TOPIC_DERIVATION_FAMILIES = new Set([
  'basic',
  'cloze',
  'concept-definition',
  'descriptor',
]);

const STRATEGY_ORDER: Record<ConflictResolutionStrategy, CreationRuleFamily[]> = {
  'semantic-first': [
    'concept-definition',
    'descriptor',
    'cloze',
    'basic',
    'list-template',
    'cdf-multiline',
    'default-riff',
  ],
  'cloze-first': [
    'cloze',
    'concept-definition',
    'descriptor',
    'basic',
    'list-template',
    'cdf-multiline',
    'default-riff',
  ],
  'basic-first': [
    'basic',
    'cloze',
    'concept-definition',
    'descriptor',
    'list-template',
    'cdf-multiline',
    'default-riff',
  ],
};

function normalizeQuickSettings(input: BackendAutoCardDecisionResolveRequest['settings']) {
  return {
    enabledSymbols: {
      basic: input?.enabledSymbols?.basic ?? true,
      concept: input?.enabledSymbols?.concept ?? true,
      descriptor: input?.enabledSymbols?.descriptor ?? true,
      cloze: input?.enabledSymbols?.cloze ?? true,
      multiLine: input?.enabledSymbols?.multiLine ?? true,
    },
    topicDerivation: {
      enabled: input?.topicDerivation?.enabled ?? true,
    },
  };
}

function isDecisionEnabledBySettings(decision: CreationDecision, settings: ReturnType<typeof normalizeQuickSettings>): boolean {
  switch (decision.family) {
    case 'basic':
      return settings.enabledSymbols.basic !== false;
    case 'cloze':
      return settings.enabledSymbols.cloze !== false;
    case 'concept-definition':
      return settings.enabledSymbols.concept !== false;
    case 'descriptor':
      return settings.enabledSymbols.descriptor !== false;
    case 'list-template':
    case 'cdf-multiline':
      return settings.enabledSymbols.multiLine !== false;
    default:
      return true;
  }
}

function isMarkOnlyClozeCandidate(content: string, decisions: CreationDecision[]): boolean {
  if (!decisions.some((decision) => decision.family === 'cloze')) {
    return false;
  }
  const clozes = ClozeDetector.extractClozes(content);
  return clozes.length > 0 && clozes.every((cloze) => cloze.type === 'mark');
}

function filterTopicDerivedDecisions(
  decisions: CreationDecision[],
  content: string,
  hasParentTopicCard: boolean,
): { filteredDecisions: CreationDecision[]; markOnlyClozeCandidate: boolean } {
  if (!hasParentTopicCard) {
    return { filteredDecisions: decisions, markOnlyClozeCandidate: false };
  }
  const markOnly = isMarkOnlyClozeCandidate(content, decisions);
  if (!markOnly) {
    return { filteredDecisions: decisions, markOnlyClozeCandidate: false };
  }
  return {
    filteredDecisions: decisions.filter((decision) => decision.family !== 'cloze'),
    markOnlyClozeCandidate: true,
  };
}

function chooseDecisionWithStrategy(
  plan: CreationPlan,
  strategy: ConflictResolutionStrategy = 'semantic-first',
): { selectedDecision: CreationDecision | null; strategyUsed: ConflictResolutionStrategy | 'skip' } {
  if (plan.decisions.length === 0) {
    return { selectedDecision: null, strategyUsed: strategy };
  }
  if (plan.conflicts.length === 0) {
    return { selectedDecision: plan.decisions[0] || null, strategyUsed: strategy };
  }
  const familyOrder = STRATEGY_ORDER[strategy];
  const rank = new Map<CreationRuleFamily, number>();
  familyOrder.forEach((family, index) => rank.set(family, index));
  const ordered = [...plan.decisions].sort((a, b) => {
    const rankA = rank.has(a.family) ? (rank.get(a.family) as number) : Number.MAX_SAFE_INTEGER;
    const rankB = rank.has(b.family) ? (rank.get(b.family) as number) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return b.priority - a.priority;
  });
  return {
    selectedDecision: ordered[0] || null,
    strategyUsed: strategy,
  };
}

function toProjection(decision: CreationDecision): BackendAutoCardDecisionProjection {
  return {
    id: decision.id,
    family: decision.family,
    templateId: decision.templateId,
    cardType: decision.cardType,
    mode: decision.mode,
    executorKind: decision.executorKind,
    renderProfile: decision.renderProfile,
    direction: decision.direction,
    priority: decision.priority,
    conflictGroup: decision.conflictGroup,
    hints: decision.hints,
  };
}

export class AutoCardDecisionService {
  private readonly planner = new UnifiedPostCreationPlanner();

  resolve(request: BackendAutoCardDecisionResolveRequest): BackendAutoCardDecisionResolveResult {
    const blockId = String(request.blockId || '').trim();
    const content = String(request.content || '');
    if (!blockId) {
      throw new Error('autocard.decision.resolve requires blockId');
    }
    if (!content) {
      return {
        matchedRuleIds: [],
        enabledDecisions: [],
        filteredDecisions: [],
        selectedDecision: null,
        strategyUsed: 'semantic-first',
        markOnlyClozeCandidate: false,
        shouldUseTopicDerivation: false,
      };
    }

    const settings = normalizeQuickSettings(request.settings);
    const source = request.source === 'doc-oneclick-scan' ? 'doc-oneclick-scan' : 'symbol-listener';
    const plan = this.planner.plan({
      blockId,
      content,
      source,
      blockType: String(request.blockType || '').trim(),
      resolvedCardType: request.resolvedCardType === 'topic' ? 'topic' : 'item',
    });
    const enabledDecisions = plan.decisions.filter((decision) => isDecisionEnabledBySettings(decision, settings));
    const { filteredDecisions, markOnlyClozeCandidate } = filterTopicDerivedDecisions(
      enabledDecisions,
      content,
      request.hasParentTopicCard === true,
    );
    const enabledDecisionIds = new Set(filteredDecisions.map((decision) => decision.id));
    const filteredPlan: CreationPlan = {
      ...plan,
      decisions: filteredDecisions,
      conflicts: plan.conflicts.filter((conflict) => (
        conflict.decisionIds.filter((decisionId) => enabledDecisionIds.has(decisionId)).length > 1
      )),
    };
    const resolved = chooseDecisionWithStrategy(filteredPlan, 'semantic-first');
    const shouldUseTopicDerivation = (
      request.hasParentTopicCard === true
      && settings.topicDerivation.enabled !== false
      && filteredDecisions.some((decision) => TOPIC_DERIVATION_FAMILIES.has(decision.family))
    );
    return {
      matchedRuleIds: plan.diagnostics.matchedRuleIds,
      enabledDecisions: enabledDecisions.map(toProjection),
      filteredDecisions: filteredDecisions.map(toProjection),
      selectedDecision: resolved.selectedDecision ? toProjection(resolved.selectedDecision) : null,
      strategyUsed: resolved.strategyUsed,
      markOnlyClozeCandidate,
      shouldUseTopicDerivation,
    };
  }
}
