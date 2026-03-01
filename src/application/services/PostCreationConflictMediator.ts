import type {
  ConflictResolutionStrategy,
  CreationDecision,
  CreationPlan,
  CreationRuleFamily,
} from '@/core/card/post-creation/contracts';

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

export interface ConflictPromptContext {
  source: string;
  blockId: string;
  families: CreationRuleFamily[];
}

export interface ConflictPromptPort {
  chooseStrategy(context: ConflictPromptContext): Promise<ConflictResolutionStrategy | 'skip' | null>;
}

export interface ConflictMediatorRunContext {
  chosenStrategy: ConflictResolutionStrategy | 'skip' | null;
  hasPrompted: boolean;
}

export interface ConflictResolutionResult {
  decision: CreationDecision | null;
  conflicted: boolean;
  strategyUsed: ConflictResolutionStrategy | 'skip';
}

function sortByFamilyOrder(
  decisions: CreationDecision[],
  familyOrder: CreationRuleFamily[]
): CreationDecision[] {
  const rank = new Map<CreationRuleFamily, number>();
  familyOrder.forEach((family, index) => rank.set(family, index));

  return [...decisions].sort((a, b) => {
    const rankA = rank.has(a.family) ? (rank.get(a.family) as number) : Number.MAX_SAFE_INTEGER;
    const rankB = rank.has(b.family) ? (rank.get(b.family) as number) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return b.priority - a.priority;
  });
}

export class PostCreationConflictMediator {
  createRunContext(): ConflictMediatorRunContext {
    return {
      chosenStrategy: null,
      hasPrompted: false,
    };
  }

  async resolveSingleDecision(
    plan: CreationPlan,
    runContext: ConflictMediatorRunContext,
    options?: {
      sourceLabel?: string;
      promptPort?: ConflictPromptPort;
      defaultStrategy?: ConflictResolutionStrategy;
    }
  ): Promise<ConflictResolutionResult> {
    const sourceLabel = options?.sourceLabel || plan.source;
    const defaultStrategy = options?.defaultStrategy || 'semantic-first';

    if (plan.decisions.length === 0) {
      return {
        decision: null,
        conflicted: false,
        strategyUsed: defaultStrategy,
      };
    }

    if (plan.conflicts.length === 0) {
      return {
        decision: plan.decisions[0],
        conflicted: false,
        strategyUsed: runContext.chosenStrategy === 'skip' ? 'skip' : (runContext.chosenStrategy || defaultStrategy),
      };
    }

    if (!runContext.hasPrompted) {
      runContext.hasPrompted = true;
      if (options?.promptPort) {
        const families = Array.from(new Set(plan.decisions.map((decision) => decision.family)));
        const chosen = await options.promptPort.chooseStrategy({
          source: sourceLabel,
          blockId: plan.blockId,
          families,
        });
        runContext.chosenStrategy = chosen || defaultStrategy;
      } else {
        runContext.chosenStrategy = defaultStrategy;
      }
    }

    const strategy = runContext.chosenStrategy || defaultStrategy;
    if (strategy === 'skip') {
      return {
        decision: null,
        conflicted: true,
        strategyUsed: 'skip',
      };
    }

    const ordered = sortByFamilyOrder(plan.decisions, STRATEGY_ORDER[strategy]);
    return {
      decision: ordered[0] || null,
      conflicted: true,
      strategyUsed: strategy,
    };
  }
}

