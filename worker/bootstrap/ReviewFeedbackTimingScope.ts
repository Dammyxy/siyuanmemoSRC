import type {
  BackendWorkerHostEffect,
  BackendWorkerInnerStepTiming,
  BackendWorkerResponseTiming,
} from './BackendWorkerProtocol';

const MAX_REVIEW_FEEDBACK_INNER_STEPS = 24;

export type ActiveReviewFeedbackTiming = {
  cardId: string | null;
  hostEffectCount: number;
  hostEffectTotalMs: number;
  hostEffectAttribution: BackendWorkerResponseTiming['hostEffectAttribution'];
  slowestHostEffect: {
    kind: BackendWorkerHostEffect['kind'];
    durationMs: number;
  } | null;
  innerSteps: BackendWorkerInnerStepTiming[];
  innerStepAttribution: BackendWorkerResponseTiming['innerStepAttribution'];
  innerStepsTruncated: boolean;
};

let activeRequestCount = 0;
const activeReviewFeedbackTimings = new Set<ActiveReviewFeedbackTiming>();

export function beginBackendWorkerRequest(
  isReviewFeedback: boolean,
  cardId: string | null = null,
): ActiveReviewFeedbackTiming | null {
  activeRequestCount += 1;
  if (!isReviewFeedback) {
    return null;
  }
  const timing: ActiveReviewFeedbackTiming = {
    cardId,
    hostEffectCount: 0,
    hostEffectTotalMs: 0,
    hostEffectAttribution: 'complete',
    slowestHostEffect: null,
    innerSteps: [],
    innerStepAttribution: 'complete',
    innerStepsTruncated: false,
  };
  activeReviewFeedbackTimings.add(timing);
  return timing;
}

export function endBackendWorkerRequest(timing: ActiveReviewFeedbackTiming | null): void {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  if (timing) {
    activeReviewFeedbackTimings.delete(timing);
  }
}

export function resolveExclusiveActiveReviewFeedbackTiming(): ActiveReviewFeedbackTiming | null {
  if (activeReviewFeedbackTimings.size === 0) {
    return null;
  }
  if (activeRequestCount !== 1 || activeReviewFeedbackTimings.size !== 1) {
    for (const timing of activeReviewFeedbackTimings) {
      timing.hostEffectAttribution = 'ambiguous-concurrency';
      timing.innerStepAttribution = 'ambiguous-concurrency';
    }
    return null;
  }
  return activeReviewFeedbackTimings.values().next().value ?? null;
}

export function markActiveReviewFeedbackTimingAmbiguous(): void {
  for (const timing of activeReviewFeedbackTimings) {
    timing.hostEffectAttribution = 'ambiguous-concurrency';
    timing.innerStepAttribution = 'ambiguous-concurrency';
  }
}

function resolveActiveReviewFeedbackTimingForInnerStep(
  stepTiming: BackendWorkerInnerStepTiming,
): ActiveReviewFeedbackTiming | null {
  if (activeReviewFeedbackTimings.size === 0) {
    return null;
  }
  if (activeReviewFeedbackTimings.size !== 1) {
    markActiveReviewFeedbackTimingAmbiguous();
    return null;
  }
  const timing = activeReviewFeedbackTimings.values().next().value ?? null;
  if (activeRequestCount !== 1) {
    timing.innerStepAttribution = 'ambiguous-concurrency';
    if (timing.cardId && stepTiming.cardId !== timing.cardId) {
      return null;
    }
  }
  return timing;
}

export function recordReviewFeedbackHostEffect(
  timing: ActiveReviewFeedbackTiming | null,
  kind: BackendWorkerHostEffect['kind'],
  durationMs: number,
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
    };
  }
}

export function recordReviewFeedbackInnerStep(stepTiming: BackendWorkerInnerStepTiming): void {
  const timing = resolveActiveReviewFeedbackTimingForInnerStep(stepTiming);
  if (!timing) {
    return;
  }
  if (timing.innerSteps.length >= MAX_REVIEW_FEEDBACK_INNER_STEPS) {
    timing.innerStepsTruncated = true;
    return;
  }
  timing.innerSteps.push(stepTiming);
}
