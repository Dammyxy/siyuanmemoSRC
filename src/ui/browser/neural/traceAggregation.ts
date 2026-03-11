import type {
  NeuralActivationTrace,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';
import type {
  NeuralActivationTraceStepViewModel,
  NeuralActivationTraceViewModel,
  NeuralTraceConvergenceViewModel,
  NeuralTraceRouteVariantViewModel,
} from './types';

export interface NeuralHistoryIndex {
  entriesByNodeId: Map<string, NeuralRoamHistoryEntry[]>;
  repeatHitCountByNodeId: Map<string, number>;
}

interface ResolveNeuralTraceConvergenceOptions {
  step: Pick<NeuralActivationTraceStepViewModel, 'eventId' | 'nodeId'>;
  historyIndex: NeuralHistoryIndex;
  currentTrace?: NeuralActivationTraceViewModel | null;
  getActivationTrace: (eventId: string) => NeuralActivationTrace | null;
  buildTraceViewModel: (trace: NeuralActivationTrace) => NeuralActivationTraceViewModel;
  traceViewModelCache?: Map<string, NeuralActivationTraceViewModel | null>;
}

interface RouteVariantAccumulator {
  eventIds: string[];
  latestVisitedAt: number;
  representativeEventId: string;
  representativeTrace: NeuralActivationTraceViewModel;
  isPrimary: boolean;
}

export function buildNeuralHistoryIndex(historyEntries: NeuralRoamHistoryEntry[]): NeuralHistoryIndex {
  const entriesByNodeId = new Map<string, NeuralRoamHistoryEntry[]>();
  const repeatHitCountByNodeId = new Map<string, number>();

  for (const entry of historyEntries) {
    const entries = entriesByNodeId.get(entry.nodeId) ?? [];
    entries.push(entry);
    entriesByNodeId.set(entry.nodeId, entries);
    repeatHitCountByNodeId.set(entry.nodeId, (repeatHitCountByNodeId.get(entry.nodeId) ?? 0) + 1);
  }

  return {
    entriesByNodeId,
    repeatHitCountByNodeId,
  };
}

function buildRouteSignature(trace: NeuralActivationTraceViewModel): string {
  const directActivatorNodeId = trace.steps.find((step) => step.eventId === trace.directActivatorEventId)?.nodeId ?? '';
  const target = trace.steps[trace.steps.length - 1] ?? null;
  return [
    trace.branchRootNodeId || '',
    directActivatorNodeId,
    target?.associationType || '',
    target?.origin || '',
    target?.traceQuality || 'exact',
  ].join('::');
}

function resolveTraceQuality(trace: NeuralActivationTraceViewModel): 'exact' | 'legacy' {
  if (!trace.isExact) {
    return 'legacy';
  }
  const target = trace.steps[trace.steps.length - 1] ?? null;
  return target?.traceQuality === 'legacy' ? 'legacy' : 'exact';
}

function buildVariant(accumulator: RouteVariantAccumulator): NeuralTraceRouteVariantViewModel {
  return {
    representativeEventId: accumulator.representativeEventId,
    latestVisitedAt: accumulator.latestVisitedAt,
    hitCount: accumulator.eventIds.length,
    isPrimary: accumulator.isPrimary,
    traceQuality: resolveTraceQuality(accumulator.representativeTrace),
    branchRootTitle: accumulator.representativeTrace.branchRootTitle,
    directActivatorTitle: accumulator.representativeTrace.directActivatorTitle,
    directRelationLabel: accumulator.representativeTrace.directRelationLabel,
    directRelationBadges: accumulator.representativeTrace.directRelationBadges ?? [],
    inferred: !accumulator.representativeTrace.isExact
      || accumulator.representativeTrace.steps.some((traceStep) => traceStep.isSyntheticRoot),
  };
}

function sortVariants(
  left: NeuralTraceRouteVariantViewModel,
  right: NeuralTraceRouteVariantViewModel,
): number {
  if (left.isPrimary && !right.isPrimary) {
    return -1;
  }
  if (!left.isPrimary && right.isPrimary) {
    return 1;
  }
  return right.latestVisitedAt - left.latestVisitedAt;
}

function resolveTraceViewModelByEventId(
  eventId: string,
  options: ResolveNeuralTraceConvergenceOptions,
): NeuralActivationTraceViewModel | null {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) {
    return null;
  }

  if (options.currentTrace?.targetEventId === normalizedEventId) {
    return options.currentTrace;
  }

  const cache = options.traceViewModelCache;
  if (cache?.has(normalizedEventId)) {
    return cache.get(normalizedEventId) ?? null;
  }

  const trace = options.getActivationTrace(normalizedEventId);
  if (!trace) {
    cache?.set(normalizedEventId, null);
    return null;
  }

  const viewModel = options.buildTraceViewModel(trace);
  cache?.set(normalizedEventId, viewModel);
  return viewModel;
}

export function resolveNeuralTraceConvergenceForStep(
  options: ResolveNeuralTraceConvergenceOptions,
): NeuralTraceConvergenceViewModel | null {
  const matchingEntries = options.historyIndex.entriesByNodeId.get(options.step.nodeId) ?? [];
  if (matchingEntries.length <= 1) {
    return null;
  }

  const variantsBySignature = new Map<string, RouteVariantAccumulator>();

  for (const entry of matchingEntries) {
    const traceViewModel = resolveTraceViewModelByEventId(entry.eventId, options);
    if (!traceViewModel) {
      continue;
    }

    const signature = buildRouteSignature(traceViewModel);
    const existing = variantsBySignature.get(signature);
    if (!existing) {
      variantsBySignature.set(signature, {
        eventIds: [entry.eventId],
        latestVisitedAt: entry.visitedAt,
        representativeEventId: entry.eventId,
        representativeTrace: traceViewModel,
        isPrimary: entry.eventId === options.step.eventId,
      });
      continue;
    }

    existing.eventIds.push(entry.eventId);
    if (entry.visitedAt > existing.latestVisitedAt && !existing.isPrimary) {
      existing.latestVisitedAt = entry.visitedAt;
      existing.representativeEventId = entry.eventId;
      existing.representativeTrace = traceViewModel;
    }
    if (entry.eventId === options.step.eventId) {
      existing.isPrimary = true;
      existing.representativeEventId = entry.eventId;
      existing.representativeTrace = traceViewModel;
    }
  }

  const variants = Array.from(variantsBySignature.values())
    .map(buildVariant)
    .sort(sortVariants);

  if (variants.length === 0) {
    return null;
  }

  return {
    kind: variants.length > 1 ? 'multi-route' : 'repeat-hit',
    totalEventCount: matchingEntries.length,
    distinctRouteCount: variants.length,
    alternateRouteCount: variants.filter((variant) => !variant.isPrimary).length,
    variants,
  };
}
