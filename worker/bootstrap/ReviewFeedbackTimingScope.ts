import type {
  BackendWorkerHostEffect,
  BackendWorkerInnerStepTiming,
  BackendWorkerResponseTiming,
} from './BackendWorkerProtocol';

const MAX_BACKEND_WORKER_INNER_STEPS = 24;

export type ActiveBackendWorkerTiming = {
  method: string;
  cardId: string | null;
  queueType: string | null;
  hostEffectCount: number;
  hostEffectTotalMs: number;
  hostEffectAttribution: BackendWorkerResponseTiming['hostEffectAttribution'];
  slowestHostEffect: {
    kind: BackendWorkerHostEffect['kind'];
    durationMs: number;
    path?: string | null;
    byteLength?: number | null;
    storageClass?: string | null;
  } | null;
  innerSteps: BackendWorkerInnerStepTiming[];
  innerStepAttribution: BackendWorkerResponseTiming['innerStepAttribution'];
  innerStepsTruncated: boolean;
};

export type ActiveReviewFeedbackTiming = ActiveBackendWorkerTiming;

let activeRequestCount = 0;
const activeBackendWorkerTimings = new Set<ActiveBackendWorkerTiming>();

export type BackendWorkerHostEffectStorageClass =
  | 'sql-projection-db'
  | 'sqlite-delta-log'
  | 'messagepack-truth-segment'
  | 'messagepack-truth-manifest'
  | 'sqlite-storage-other'
  | 'messagepack-truth-other'
  | 'non-storage-host-effect';

export function classifyBackendWorkerHostEffectStorage(
  kind: BackendWorkerHostEffect['kind'],
  path?: string | null,
): BackendWorkerHostEffectStorageClass {
  const normalizedPath = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (normalizedPath === 'siyuanmemo.db') {
    return 'sql-projection-db';
  }
  if (
    normalizedPath === 'sqlite-delta-log.v2.manifest.json'
    || normalizedPath === 'sqlite-delta-log.v2.open.msgpack'
    || /^sqlite-delta-log\.v2\.sealed-\d+\.msgpack$/.test(normalizedPath)
    || normalizedPath === 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json'
    || normalizedPath === 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack'
    || /^sqlite-delta\/v2\/sqlite-delta-log\.v2\.sealed-\d+\.msgpack$/.test(normalizedPath)
  ) {
    return 'sqlite-delta-log';
  }
  if (/^truth\/[^/]+\/[^/]+\/device-[^/]+\/seg-[^/]+\.msgpack$/.test(normalizedPath)) {
    return 'messagepack-truth-segment';
  }
  if (/^truth\/[^/]+\/[^/]+\/device-[^/]+\/manifest\.v1\.json$/.test(normalizedPath)) {
    return 'messagepack-truth-manifest';
  }
  if (kind.startsWith('sqlite.')) {
    return 'sqlite-storage-other';
  }
  if (kind.startsWith('truth.')) {
    return 'messagepack-truth-other';
  }
  return 'non-storage-host-effect';
}

export function beginBackendWorkerTiming(
  method: string,
  cardId: string | null = null,
  options: { queueType?: string | null } = {},
): ActiveBackendWorkerTiming {
  activeRequestCount += 1;
  const timing: ActiveBackendWorkerTiming = {
    method,
    cardId,
    queueType: options.queueType ?? null,
    hostEffectCount: 0,
    hostEffectTotalMs: 0,
    hostEffectAttribution: 'complete',
    slowestHostEffect: null,
    innerSteps: [],
    innerStepAttribution: 'complete',
    innerStepsTruncated: false,
  };
  activeBackendWorkerTimings.add(timing);
  return timing;
}

export function beginBackendWorkerRequest(
  isReviewFeedback: boolean,
  cardId: string | null = null,
): ActiveBackendWorkerTiming | null {
  if (!isReviewFeedback) {
    activeRequestCount += 1;
    return null;
  }
  return beginBackendWorkerTiming('review.feedback', cardId);
}

export function endBackendWorkerRequest(timing: ActiveBackendWorkerTiming | null): void {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  if (timing) {
    activeBackendWorkerTimings.delete(timing);
  }
}

export function resolveExclusiveActiveBackendWorkerTiming(): ActiveBackendWorkerTiming | null {
  if (activeBackendWorkerTimings.size === 0) {
    return null;
  }
  if (activeRequestCount !== 1 || activeBackendWorkerTimings.size !== 1) {
    for (const timing of activeBackendWorkerTimings) {
      timing.hostEffectAttribution = 'ambiguous-concurrency';
      timing.innerStepAttribution = 'ambiguous-concurrency';
    }
    return null;
  }
  return activeBackendWorkerTimings.values().next().value ?? null;
}

export function hasActiveBackendWorkerTiming(method: string): boolean {
  for (const timing of activeBackendWorkerTimings) {
    if (timing.method === method) {
      return true;
    }
  }
  return false;
}

export function shouldSuppressReviewFeedbackPersistenceHostEffect(
  kind: BackendWorkerHostEffect['kind'],
  activeTiming: ActiveBackendWorkerTiming | null,
): boolean {
  return activeTiming?.method === 'review.feedback'
    && (
      kind === 'truth.writeJSON'
      || kind === 'truth.writeBinary'
    );
}

export function resolveExclusiveActiveReviewFeedbackTiming(): ActiveBackendWorkerTiming | null {
  return resolveExclusiveActiveBackendWorkerTiming();
}

export function markActiveBackendWorkerTimingAmbiguous(): void {
  for (const timing of activeBackendWorkerTimings) {
    timing.hostEffectAttribution = 'ambiguous-concurrency';
    timing.innerStepAttribution = 'ambiguous-concurrency';
  }
}

export function markActiveReviewFeedbackTimingAmbiguous(): void {
  markActiveBackendWorkerTimingAmbiguous();
}

function resolveActiveBackendWorkerTimingForInnerStep(
  stepTiming: BackendWorkerInnerStepTiming,
): ActiveBackendWorkerTiming | null {
  if (activeBackendWorkerTimings.size === 0) {
    return null;
  }
  const activeTimings = [...activeBackendWorkerTimings];
  const timing = activeTimings.length === 1
    ? activeTimings[0]
    : resolveMatchingTimingUnderConcurrency(stepTiming, activeTimings);
  if (!timing) {
    markActiveBackendWorkerTimingAmbiguous();
    return null;
  }
  if (activeRequestCount !== 1) {
    timing.innerStepAttribution = 'ambiguous-concurrency';
    if (timing.cardId && stepTiming.cardId !== timing.cardId) {
      return null;
    }
  }
  return timing;
}

function resolveMatchingTimingUnderConcurrency(
  stepTiming: BackendWorkerInnerStepTiming,
  activeTimings: ActiveBackendWorkerTiming[],
): ActiveBackendWorkerTiming | null {
  const stepMethod = extractStepMethod(stepTiming);
  const stepQueueType = extractStepQueueType(stepTiming);
  const candidates = activeTimings.filter((timing) => {
    if (stepMethod && timing.method !== stepMethod) {
      return false;
    }
    if (timing.cardId && stepTiming.cardId !== timing.cardId) {
      return false;
    }
    if (timing.queueType && stepQueueType !== timing.queueType) {
      return false;
    }
    if (!stepMethod && !stepTiming.cardId && !stepQueueType) {
      return false;
    }
    return true;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function extractStepMethod(stepTiming: BackendWorkerInnerStepTiming): string | null {
  const method = stepTiming.extra?.backendMethod ?? stepTiming.extra?.method;
  return typeof method === 'string' && method.length > 0 ? method : null;
}

function extractStepQueueType(stepTiming: BackendWorkerInnerStepTiming): string | null {
  if (typeof stepTiming.queueType === 'string' && stepTiming.queueType.length > 0) {
    return stepTiming.queueType;
  }
  const queueType = stepTiming.extra?.queueType;
  return typeof queueType === 'string' && queueType.length > 0 ? queueType : null;
}

export function recordReviewFeedbackHostEffect(
  timing: ActiveBackendWorkerTiming | null,
  kind: BackendWorkerHostEffect['kind'],
  durationMs: number,
  metadata: { path?: string | null; byteLength?: number | null } = {},
): void {
  if (!timing) {
    return;
  }
  timing.hostEffectCount += 1;
  timing.hostEffectTotalMs += durationMs;
  if (!timing.slowestHostEffect || durationMs > timing.slowestHostEffect.durationMs) {
    timing.slowestHostEffect = {
      kind,
      durationMs,
      path: metadata.path ?? null,
      byteLength: metadata.byteLength ?? null,
      storageClass: classifyBackendWorkerHostEffectStorage(kind, metadata.path),
    };
  }
}

export function recordReviewFeedbackInnerStep(stepTiming: BackendWorkerInnerStepTiming): void {
  const timing = resolveActiveBackendWorkerTimingForInnerStep(stepTiming);
  if (!timing) {
    return;
  }
  if (timing.innerSteps.length >= MAX_BACKEND_WORKER_INNER_STEPS) {
    timing.innerStepsTruncated = true;
    return;
  }
  timing.innerSteps.push(stepTiming);
}

export const recordBackendWorkerHostEffect = recordReviewFeedbackHostEffect;

export const recordBackendWorkerInnerStep = recordReviewFeedbackInnerStep;
