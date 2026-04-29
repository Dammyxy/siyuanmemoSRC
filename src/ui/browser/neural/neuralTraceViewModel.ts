import type {
  NeuralActivationTrace,
  NeuralActivationTraceStep,
  NeuralEngineMode,
  NeuralPropagationOrigin,
} from '@/types/unified-data-source';
import type {
  NeuralActivationTraceStepViewModel,
  NeuralActivationTraceViewModel,
} from './types';

export type NeuralTraceTranslator = (key: string, fallback: string) => string;

export function resolveNeuralRelationLabel(type: string, t: NeuralTraceTranslator): string {
  const map: Record<string, string> = {
    backlink: t('relationBacklink', '反链'),
    'outgoing-direct': t('relationOutgoingDirect', '直接正链'),
    'outgoing-indirect': t('relationOutgoingIndirect', '间接正链'),
    descriptor: t('relationDescriptor', '描述符'),
    focus: t('activationKindFocusRoot', '概念卡：轨道中心节点'),
    source: t('activationKindSourceRoot', '概念卡：激活源'),
    'concept-link': t('relationConceptLink', '概念链接'),
    'element-link': t('relationElementLink', '块链接'),
    'tree-child': t('relationTreeChild', '子块'),
    'tree-sibling': t('relationTreeSibling', '同级块'),
    'tree-parent': t('relationTreeParent', '父块'),
    path: t('activationKindManualJump', '手动跳转'),
  };
  return map[type] || type || t('routeMetaWorldline', '空间站');
}

export function resolveNeuralOriginLabel(
  origin: NeuralPropagationOrigin | string | null | undefined,
  t: NeuralTraceTranslator,
): string | null {
  const map: Record<string, string> = {
    backlink: t('relationOriginBacklink', '反向链接'),
    'direct-ref': t('relationOriginDirectRef', '直接引用'),
    'indirect-ref': t('relationOriginIndirectRef', '间接引用'),
    descriptor: t('relationDescriptor', '描述符'),
    'block-tree': t('relationOriginBlockTree', '块树'),
    'document-tree': t('relationOriginDocumentTree', '文档树'),
  };
  const normalizedOrigin = String(origin || '').trim();
  return map[normalizedOrigin] || null;
}

export function resolveNeuralActivationLabel(type: string, t: NeuralTraceTranslator): string {
  const map: Record<string, string> = {
    'focus-root': t('activationKindFocusRoot', '概念卡：轨道中心节点'),
    'source-root': t('activationKindSourceRoot', '概念卡：激活源'),
    'graph-edge': t('activationKindGraphEdge', '图关系激活'),
    'tree-edge': t('activationKindTreeEdge', '树关系激活'),
    'follow-path': t('activationKindFollowPath', '沿当前路径'),
    'manual-jump': t('activationKindManualJump', '手动跳转'),
  };
  return map[type] || type || t('activationTrace', '激活轨迹树');
}

export function pushTraceBadge(
  badges: NeuralActivationTraceStepViewModel['displayBadges'],
  key: string,
  label: string | null | undefined,
  tone: 'default' | 'soft' | 'root' | 'current' = 'soft',
): void {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel) {
    return;
  }
  if (badges.some((badge) => badge.label === normalizedLabel || badge.key === key)) {
    return;
  }
  badges.push({ key, label: normalizedLabel, tone });
}

export function buildNeuralTraceRelationBadges(
  step: NeuralActivationTraceStep,
  t: NeuralTraceTranslator,
): NeuralActivationTraceStepViewModel['displayBadges'] {
  const badges: NeuralActivationTraceStepViewModel['displayBadges'] = [];
  const relationLabel = resolveNeuralRelationLabel(step.associationType, t);
  const originLabel = resolveNeuralOriginLabel(step.origin, t);
  const supportsOriginDetail =
    step.associationType === 'concept-link'
    || step.associationType === 'element-link'
    || step.associationType === 'tree-child'
    || step.associationType === 'tree-sibling'
    || step.associationType === 'tree-parent';

  pushTraceBadge(badges, `relation:${step.associationType}`, relationLabel, 'soft');
  if (supportsOriginDetail && originLabel && originLabel !== relationLabel) {
    pushTraceBadge(badges, `origin:${step.origin}`, originLabel, 'soft');
  }
  return badges;
}

type NeuralTraceSummaryStep = Pick<
  NeuralActivationTraceStep,
  'eventId' | 'nodeId' | 'activationKind' | 'sourceRole' | 'isSyntheticRoot'
>;

export function isNeuralTraceRootSemanticStep(
  step: NeuralTraceSummaryStep | null | undefined,
  engineMode: NeuralEngineMode,
): boolean {
  if (!step) {
    return false;
  }
  if (engineMode === 'hyperspace') {
    return step.sourceRole === 'activation-source' || step.activationKind === 'source-root';
  }
  return step.sourceRole === 'orbit-center' || step.activationKind === 'focus-root';
}

export function pickPreferredNeuralTraceStep<T extends Pick<NeuralTraceSummaryStep, 'isSyntheticRoot'>>(
  steps: T[],
): T | null {
  return steps.find((step) => !step.isSyntheticRoot) ?? steps[0] ?? null;
}

export function resolveNeuralDirectActivatorStep<T extends Pick<NeuralTraceSummaryStep, 'eventId'>>(
  steps: T[],
): T | null {
  return steps.length > 1 ? steps[steps.length - 2] ?? null : null;
}

export function resolveNeuralBranchRootStep<T extends NeuralTraceSummaryStep>(
  steps: T[],
  branchRootNodeId: string | null,
  engineMode: NeuralEngineMode,
): T | null {
  const rootedBranchCandidates = branchRootNodeId
    ? steps.filter((step) => step.nodeId === branchRootNodeId && isNeuralTraceRootSemanticStep(step, engineMode))
    : [];
  const matchedBranchRoot = pickPreferredNeuralTraceStep(rootedBranchCandidates);
  if (matchedBranchRoot) {
    return matchedBranchRoot;
  }

  const rootedSteps = steps.filter((step) => isNeuralTraceRootSemanticStep(step, engineMode));
  return pickPreferredNeuralTraceStep(rootedSteps) ?? steps[0] ?? null;
}

export function resolveNeuralTraceStepByEventId<T extends Pick<NeuralTraceSummaryStep, 'eventId'>>(
  steps: T[],
  eventId: string | null | undefined,
): T | null {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) {
    return null;
  }
  return steps.find((step) => step.eventId === normalizedEventId) ?? null;
}

export function buildNeuralTraceBadges(
  step: NeuralActivationTraceStep,
  options: {
    t: NeuralTraceTranslator;
    engineMode: NeuralEngineMode;
    isRoot: boolean;
    isDirectActivator: boolean;
    isTarget: boolean;
    isCurrent: boolean;
  },
): NeuralActivationTraceStepViewModel['displayBadges'] {
  const badges = buildNeuralTraceRelationBadges(step, options.t);
  const inferredLabel = options.t('traceStepSyntheticRoot', '推定');
  const isSemanticRoot = isNeuralTraceRootSemanticStep(step, options.engineMode);
  const shouldShowInferred = step.isSyntheticRoot || (options.isRoot && !isSemanticRoot);

  if (options.isRoot) {
    const rootLabel = options.engineMode === 'hyperspace'
      ? options.t('traceBadgePrimarySource', '主概念卡：激活源')
      : options.t('traceBadgeCurrentOrbitCenter', '当前概念卡：轨道中心');
    badges.length = 0;
    pushTraceBadge(badges, 'root-role', rootLabel, 'root');
  } else if (options.engineMode === 'hyperspace' && options.isDirectActivator) {
    pushTraceBadge(badges, 'direct-role', options.t('directConductor', '直接传导节点'));
  }

  if (shouldShowInferred) {
    pushTraceBadge(badges, 'synthetic-root', inferredLabel);
  }

  if (step.isVirtual) {
    pushTraceBadge(badges, 'virtual', options.t('virtualNode', '虚拟节点'), 'soft');
  }

  if (options.isTarget || options.isCurrent) {
    pushTraceBadge(badges, 'current', options.t('currentNodeTag', '当前'), 'current');
  }

  return badges;
}

export function resolveNeuralTraceStepIsSelected(
  step: Pick<NeuralActivationTraceStepViewModel, 'eventId' | 'nodeId'>,
  index: number,
  steps: readonly Pick<NeuralActivationTraceStepViewModel, 'eventId' | 'nodeId'>[],
  options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): boolean {
  const selectedTraceEventId = options.selectedTraceEventId ?? null;
  const selectedTraceNodeId = options.selectedTraceNodeId ?? null;
  if (selectedTraceEventId) {
    return step.eventId === selectedTraceEventId;
  }
  if (selectedTraceNodeId) {
    return step.nodeId === selectedTraceNodeId;
  }
  return index === steps.length - 1;
}

export function buildNeuralActivationTraceViewModel(
  trace: NeuralActivationTrace,
  options: {
    t: NeuralTraceTranslator;
    currentNodeId?: string | null;
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  },
): NeuralActivationTraceViewModel {
  const currentNodeId = options.currentNodeId ?? null;
  const selectedTraceEventId = options.selectedTraceEventId ?? null;
  const selectedTraceNodeId = options.selectedTraceNodeId ?? null;
  const engineMode = trace.steps[trace.steps.length - 1]?.engineMode ?? trace.steps[0]?.engineMode ?? 'orbit';
  const directActivator = resolveNeuralDirectActivatorStep(trace.steps);
  const branchRoot = resolveNeuralBranchRootStep(trace.steps, trace.branchRootNodeId, engineMode);
  const directActivatorEventId = directActivator?.eventId ?? null;
  const branchRootEventId = branchRoot?.eventId ?? null;
  const steps = trace.steps.map((step, index) => ({
    ...step,
    relationLabel: resolveNeuralRelationLabel(step.associationType, options.t),
    activationLabel: resolveNeuralActivationLabel(step.activationKind, options.t),
    isCurrent: currentNodeId ? step.nodeId === currentNodeId : false,
    isTarget: index === trace.steps.length - 1,
    isRoot: branchRootEventId ? step.eventId === branchRootEventId : false,
    isSelected: resolveNeuralTraceStepIsSelected(step, index, trace.steps, {
      selectedTraceEventId,
      selectedTraceNodeId,
    }),
    previewable: Boolean(step.nodeId),
    jumpable: Boolean(step.nodeId),
    displayBadges: buildNeuralTraceBadges(step, {
      t: options.t,
      engineMode,
      isRoot: branchRootEventId ? step.eventId === branchRootEventId : false,
      isDirectActivator: directActivatorEventId ? step.eventId === directActivatorEventId : false,
      isTarget: index === trace.steps.length - 1,
      isCurrent: currentNodeId ? step.nodeId === currentNodeId : false,
    }),
  }));
  const resolvedDirectActivator = resolveNeuralTraceStepByEventId(steps, directActivatorEventId);
  const resolvedBranchRoot = resolveNeuralTraceStepByEventId(steps, branchRootEventId);
  const target = steps[steps.length - 1] ?? null;

  return {
    ...trace,
    engineMode,
    steps,
    targetTitle: target?.nodePreview || target?.nodeId || trace.targetNodeId,
    directActivatorTitle: resolvedDirectActivator?.nodePreview || resolvedDirectActivator?.nodeId || null,
    directActivatorEventId,
    directRelationLabel: resolveNeuralRelationLabel(target?.associationType || '', options.t),
    directRelationBadges: target ? buildNeuralTraceRelationBadges(target, options.t) : [],
    branchRootTitle: resolvedBranchRoot?.nodePreview || resolvedBranchRoot?.nodeId || trace.branchRootNodeId,
    branchRootEventId,
  };
}

export function isBlockIdFallbackLabel(label: string | null | undefined, nodeId: string): boolean {
  const normalizedLabel = String(label || '').trim();
  const normalizedNodeId = String(nodeId || '').trim();
  if (!normalizedNodeId) {
    return false;
  }
  return !normalizedLabel || normalizedLabel === normalizedNodeId;
}

export function applyNeuralTraceSelectionState(
  trace: NeuralActivationTraceViewModel | null,
  options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): NeuralActivationTraceViewModel | null {
  if (!trace) {
    return trace;
  }
  return {
    ...trace,
    steps: trace.steps.map((step, index, steps) => ({
      ...step,
      isSelected: resolveNeuralTraceStepIsSelected(step, index, steps, options),
    })),
  };
}

export function withNeuralTraceRepeatHitState(
  trace: NeuralActivationTraceViewModel,
  getHistoryHitCount: (nodeId: string) => number,
): NeuralActivationTraceViewModel {
  const repeatHitCountByNodeId = new Map<string, number>();
  const steps = trace.steps.map((step) => {
    let repeatHitCount = repeatHitCountByNodeId.get(step.nodeId);
    if (repeatHitCount === undefined) {
      repeatHitCount = Math.max(1, getHistoryHitCount(step.nodeId));
      repeatHitCountByNodeId.set(step.nodeId, repeatHitCount);
    }

    return {
      ...step,
      repeatHitCount,
      convergenceStatus: 'idle' as const,
      convergence: null,
    };
  });

  return {
    ...trace,
    steps,
  };
}

export function updateNeuralTraceStepConvergenceState(
  trace: NeuralActivationTraceViewModel,
  stepEventId: string,
  updates: Pick<NeuralActivationTraceStepViewModel, 'convergenceStatus' | 'convergence'>,
): NeuralActivationTraceViewModel {
  return {
    ...trace,
    steps: trace.steps.map((step) => (
      step.eventId === stepEventId
        ? {
          ...step,
          convergenceStatus: updates.convergenceStatus,
          convergence: updates.convergence,
        }
        : step
    )),
  };
}

export function buildNeuralTraceConvergenceCacheKey(traceTargetEventId: string, stepEventId: string): string {
  return `${traceTargetEventId}::${stepEventId}`;
}
