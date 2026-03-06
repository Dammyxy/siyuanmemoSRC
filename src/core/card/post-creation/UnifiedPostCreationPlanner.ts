import type {
  CreationConflict,
  CreationDecision,
  CreationPlan,
  PostCreationContext,
  PostCreationRule,
} from './contracts';
import { resolveDefaultCapabilities } from './contracts';
import {
  BasicDirectionRule,
  BraceClozeRule,
  CdfMultilineStructuralRule,
  ConceptDefinitionInlineRule,
  DefaultRiffSyncRule,
  DescriptorInlineRule,
  ListTemplateStructuralRule,
  MarkClozeRule,
  NumberedLatexClozeRule,
} from './rules';

function buildConflicts(blockId: string, decisions: CreationDecision[]): CreationConflict[] {
  if (decisions.length <= 1) {
    return [];
  }

  const groups = new Map<string, CreationDecision[]>();
  for (const decision of decisions) {
    const key = decision.conflictGroup || 'single-block';
    const group = groups.get(key);
    if (group) {
      group.push(decision);
    } else {
      groups.set(key, [decision]);
    }
  }

  const conflicts: CreationConflict[] = [];
  for (const [group, groupDecisions] of groups.entries()) {
    if (groupDecisions.length <= 1) {
      continue;
    }
    conflicts.push({
      blockId,
      group,
      decisionIds: groupDecisions.map((d) => d.id),
      families: groupDecisions.map((d) => d.family),
    });
  }
  return conflicts;
}

function normalizeContext(context: PostCreationContext): PostCreationContext {
  const defaults = resolveDefaultCapabilities(context.source);
  return {
    ...context,
    capabilities: {
      ...defaults,
      ...(context.capabilities || {}),
    },
  };
}

export class UnifiedPostCreationPlanner {
  private readonly rules: PostCreationRule[];

  constructor(rules?: PostCreationRule[]) {
    this.rules = rules || [
      new CdfMultilineStructuralRule(),
      new ListTemplateStructuralRule(),
      new NumberedLatexClozeRule(),
      new BraceClozeRule(),
      new MarkClozeRule(),
      new ConceptDefinitionInlineRule(),
      new DescriptorInlineRule(),
      new BasicDirectionRule(),
    ];
  }

  plan(context: PostCreationContext): CreationPlan {
    const normalizedContext = normalizeContext(context);
    const decisions: CreationDecision[] = [];
    const matchedRuleIds: string[] = [];

    for (const rule of this.rules) {
      const decision = rule.match(normalizedContext);
      if (!decision) {
        continue;
      }
      matchedRuleIds.push(rule.id);
      decisions.push(decision);
    }

    if (decisions.length === 0 && normalizedContext.source === 'native-riff-sync') {
      const fallbackDecision = new DefaultRiffSyncRule().match(normalizedContext);
      if (fallbackDecision) {
        decisions.push(fallbackDecision);
        matchedRuleIds.push('DefaultRiffSyncRule');
      }
    }

    decisions.sort((a, b) => b.priority - a.priority);
    const conflicts = buildConflicts(normalizedContext.blockId, decisions);

    return {
      source: normalizedContext.source,
      blockId: normalizedContext.blockId,
      decisions,
      conflicts,
      diagnostics: {
        matchedRuleIds,
        decisionCount: decisions.length,
      },
    };
  }
}
