import { describe, expect, it } from 'vitest';
import type { NeuralActivationTrace, NeuralRoamHistoryEntry } from '@/types/unified-data-source';
import type { NeuralActivationTraceStepViewModel, NeuralActivationTraceViewModel } from '../types';
import {
  buildNeuralHistoryIndex,
  resolveNeuralTraceConvergenceForStep,
} from '../traceAggregation';

interface TraceFixtureOptions {
  targetEventId: string;
  targetNodeId?: string;
  branchRootNodeId: string;
  branchRootTitle: string;
  directActivatorEventId: string;
  directActivatorNodeId: string;
  directActivatorTitle: string;
  associationType?: 'element-link' | 'concept-link';
  origin?: 'backlink' | 'direct-ref' | null;
  traceQuality?: 'exact' | 'legacy';
  isExact?: boolean;
  targetVisitedAt: number;
  syntheticRoot?: boolean;
}

interface TraceFixture {
  rawTrace: NeuralActivationTrace;
  viewModel: NeuralActivationTraceViewModel;
  historyEntry: NeuralRoamHistoryEntry;
}

function createTraceFixture(options: TraceFixtureOptions): TraceFixture {
  const targetNodeId = options.targetNodeId ?? 'node-shared';
  const associationType = options.associationType ?? 'element-link';
  const origin = options.origin ?? 'backlink';
  const traceQuality = options.traceQuality ?? 'exact';
  const isExact = options.isExact ?? traceQuality === 'exact';
  const rootEventId = `${options.targetEventId}:root`;
  const relationLabel = associationType === 'concept-link' ? 'Concept Link' : 'Block Link';

  const steps = [
    {
      eventId: rootEventId,
      nodeId: options.branchRootNodeId,
      nodePreview: options.branchRootTitle,
      isVirtual: false,
      associationType: 'source' as const,
      reason: 'Primary activation source',
      activationKind: 'source-root' as const,
      visitedAt: Math.max(1, options.targetVisitedAt - 40),
      focusId: options.branchRootNodeId,
      engineMode: 'hyperspace' as const,
      sourceRole: 'activation-source' as const,
      sourceNodeId: null,
      sourceEventId: null,
      branchRootNodeId: options.branchRootNodeId,
      traceQuality,
      depth: 0,
      conductionScore: 1,
      isSyntheticRoot: Boolean(options.syntheticRoot),
    },
    {
      eventId: options.directActivatorEventId,
      nodeId: options.directActivatorNodeId,
      nodePreview: options.directActivatorTitle,
      isVirtual: false,
      associationType,
      reason: 'Immediate conduction',
      activationKind: 'graph-edge' as const,
      visitedAt: Math.max(1, options.targetVisitedAt - 20),
      focusId: options.branchRootNodeId,
      engineMode: 'hyperspace' as const,
      sourceRole: null,
      origin,
      sourceNodeId: options.branchRootNodeId,
      sourceEventId: rootEventId,
      branchRootNodeId: options.branchRootNodeId,
      traceQuality,
      depth: 1,
      conductionScore: 0.82,
      isSyntheticRoot: false,
    },
    {
      eventId: options.targetEventId,
      nodeId: targetNodeId,
      nodePreview: 'Shared Target',
      isVirtual: false,
      associationType,
      reason: relationLabel,
      activationKind: 'graph-edge' as const,
      visitedAt: options.targetVisitedAt,
      focusId: options.branchRootNodeId,
      engineMode: 'hyperspace' as const,
      sourceRole: null,
      origin,
      sourceNodeId: options.directActivatorNodeId,
      sourceEventId: options.directActivatorEventId,
      branchRootNodeId: options.branchRootNodeId,
      traceQuality,
      depth: 2,
      conductionScore: 0.9,
      isSyntheticRoot: false,
    },
  ];

  const rawTrace: NeuralActivationTrace = {
    targetEventId: options.targetEventId,
    targetNodeId,
    branchRootNodeId: options.branchRootNodeId,
    isExact,
    degradedReason: isExact ? null : 'legacy',
    steps,
  };

  const viewModel: NeuralActivationTraceViewModel = {
    ...rawTrace,
    engineMode: 'hyperspace',
    targetTitle: 'Shared Target',
    directActivatorTitle: options.directActivatorTitle,
    directActivatorEventId: options.directActivatorEventId,
    directRelationLabel: relationLabel,
    directRelationBadges: [
      { key: `relation:${associationType}`, label: relationLabel, tone: 'soft' },
      ...(origin ? [{ key: `origin:${origin}`, label: origin === 'backlink' ? 'Backlink' : 'Direct Reference', tone: 'soft' as const }] : []),
    ],
    branchRootTitle: options.branchRootTitle,
    branchRootEventId: rootEventId,
    steps: steps.map((step, index) => ({
      ...step,
      relationLabel: step.associationType === 'source' ? 'Activation Source' : relationLabel,
      activationLabel: step.activationKind === 'source-root' ? 'Activation Source' : 'Graph Edge',
      displayBadges: index === 2
        ? [{ key: 'current', label: 'Current', tone: 'current' }]
        : index === 0
          ? [{ key: 'root-role', label: 'Primary Activation Source', tone: 'root' }]
          : [{ key: 'direct-role', label: 'Immediate Conductor', tone: 'soft' }],
      previewable: true,
      jumpable: true,
      isCurrent: index === 2,
      isTarget: index === 2,
      isRoot: index === 0,
      isSelected: index === 2,
    })),
  };

  const historyEntry: NeuralRoamHistoryEntry = {
    eventId: options.targetEventId,
    nodeId: targetNodeId,
    focusId: options.branchRootNodeId,
    sessionId: 'session-1',
    associationType,
    reason: relationLabel,
    visitedAt: options.targetVisitedAt,
    isVirtual: false,
    nodePreview: 'Shared Target',
    traceQuality,
    engineMode: 'hyperspace',
    sourceRole: null,
    origin,
    sourceNodeId: options.directActivatorNodeId,
    sourceEventId: options.directActivatorEventId,
    branchRootNodeId: options.branchRootNodeId,
    activationKind: 'graph-edge',
    depth: 2,
    conductionScore: 0.9,
  };

  return { rawTrace, viewModel, historyEntry };
}

function resolveStepConvergence(
  primary: TraceFixture,
  others: TraceFixture[],
  step: NeuralActivationTraceStepViewModel = primary.viewModel.steps[primary.viewModel.steps.length - 1],
) {
  const traceMap = new Map<string, TraceFixture>([
    [primary.rawTrace.targetEventId, primary],
    ...others.map((fixture) => [fixture.rawTrace.targetEventId, fixture] as const),
  ]);
  const historyIndex = buildNeuralHistoryIndex([
    primary.historyEntry,
    ...others.map((fixture) => fixture.historyEntry),
  ]);

  return resolveNeuralTraceConvergenceForStep({
    step,
    historyIndex,
    currentTrace: step.eventId === primary.viewModel.targetEventId ? primary.viewModel : null,
    getActivationTrace: (eventId) => traceMap.get(eventId)?.rawTrace ?? null,
    buildTraceViewModel: (trace) => traceMap.get(trace.targetEventId)?.viewModel ?? primary.viewModel,
    traceViewModelCache: new Map<string, NeuralActivationTraceViewModel | null>(),
  });
}

describe('traceAggregation', () => {
  it('builds a repeat-hit index per node once', () => {
    const first = createTraceFixture({
      targetEventId: 'event-a',
      branchRootNodeId: 'root-a',
      branchRootTitle: 'Source A',
      directActivatorEventId: 'event-a:direct',
      directActivatorNodeId: 'relay-a',
      directActivatorTitle: 'Relay A',
      targetVisitedAt: 100,
    });
    const second = createTraceFixture({
      targetEventId: 'event-b',
      branchRootNodeId: 'root-b',
      branchRootTitle: 'Source B',
      directActivatorEventId: 'event-b:direct',
      directActivatorNodeId: 'relay-b',
      directActivatorTitle: 'Relay B',
      targetVisitedAt: 200,
    });

    const historyIndex = buildNeuralHistoryIndex([first.historyEntry, second.historyEntry]);
    expect(historyIndex.repeatHitCountByNodeId.get('node-shared')).toBe(2);
    expect(historyIndex.entriesByNodeId.get('node-shared')).toHaveLength(2);
  });

  it('returns null when the node was hit only once', () => {
    const primary = createTraceFixture({
      targetEventId: 'event-primary',
      branchRootNodeId: 'root-a',
      branchRootTitle: 'Source A',
      directActivatorEventId: 'event-primary:direct',
      directActivatorNodeId: 'relay-a',
      directActivatorTitle: 'Relay A',
      targetVisitedAt: 100,
    });

    expect(resolveStepConvergence(primary, [])).toBeNull();
  });

  it('marks same-route repeated hits without creating alternate sources', () => {
    const primary = createTraceFixture({
      targetEventId: 'event-old',
      branchRootNodeId: 'root-a',
      branchRootTitle: 'Source A',
      directActivatorEventId: 'event-old:direct',
      directActivatorNodeId: 'relay-a',
      directActivatorTitle: 'Relay A',
      targetVisitedAt: 100,
    });
    const repeated = createTraceFixture({
      targetEventId: 'event-new',
      branchRootNodeId: 'root-a',
      branchRootTitle: 'Source A',
      directActivatorEventId: 'event-new:direct',
      directActivatorNodeId: 'relay-a',
      directActivatorTitle: 'Relay A',
      targetVisitedAt: 300,
    });

    const convergence = resolveStepConvergence(primary, [repeated]);
    expect(convergence?.kind).toBe('repeat-hit');
    expect(convergence?.totalEventCount).toBe(2);
    expect(convergence?.distinctRouteCount).toBe(1);
    expect(convergence?.alternateRouteCount).toBe(0);
    expect(convergence?.variants[0].hitCount).toBe(2);
    expect(convergence?.variants[0].isPrimary).toBe(true);
    expect(convergence?.variants[0].representativeEventId).toBe('event-old');
  });

  it('marks different routes into the same node as a convergent node', () => {
    const primary = createTraceFixture({
      targetEventId: 'event-primary',
      branchRootNodeId: 'root-a',
      branchRootTitle: 'Source A',
      directActivatorEventId: 'event-primary:direct',
      directActivatorNodeId: 'relay-a',
      directActivatorTitle: 'Relay A',
      targetVisitedAt: 100,
    });
    const alternate = createTraceFixture({
      targetEventId: 'event-alt',
      branchRootNodeId: 'root-b',
      branchRootTitle: 'Source B',
      directActivatorEventId: 'event-alt:direct',
      directActivatorNodeId: 'relay-b',
      directActivatorTitle: 'Relay B',
      targetVisitedAt: 260,
      associationType: 'concept-link',
      origin: 'direct-ref',
    });

    const convergence = resolveStepConvergence(primary, [alternate]);
    expect(convergence?.kind).toBe('multi-route');
    expect(convergence?.distinctRouteCount).toBe(2);
    expect(convergence?.alternateRouteCount).toBe(1);
    expect(convergence?.variants[1].branchRootTitle).toBe('Source B');
    expect(convergence?.variants[1].directActivatorTitle).toBe('Relay B');
  });

  it('keeps legacy alternate routes separate and inferred', () => {
    const primary = createTraceFixture({
      targetEventId: 'event-primary',
      branchRootNodeId: 'root-a',
      branchRootTitle: 'Source A',
      directActivatorEventId: 'event-primary:direct',
      directActivatorNodeId: 'relay-a',
      directActivatorTitle: 'Relay A',
      targetVisitedAt: 100,
    });
    const legacyAlternate = createTraceFixture({
      targetEventId: 'event-legacy',
      branchRootNodeId: 'root-c',
      branchRootTitle: 'Archive Source',
      directActivatorEventId: 'event-legacy:direct',
      directActivatorNodeId: 'relay-c',
      directActivatorTitle: 'Archive Relay',
      targetVisitedAt: 220,
      traceQuality: 'legacy',
      isExact: false,
      syntheticRoot: true,
    });

    const convergence = resolveStepConvergence(primary, [legacyAlternate]);
    const alternateVariant = convergence?.variants.find((variant) => !variant.isPrimary);
    expect(alternateVariant?.traceQuality).toBe('legacy');
    expect(alternateVariant?.inferred).toBe(true);
    expect(alternateVariant?.branchRootTitle).toBe('Archive Source');
  });
});
