import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutoCardListenerCandidateRuntime,
  type AutoCardListenerBusinessIdentity,
  type CandidateBlockContext,
} from '../AutoCardListenerCandidateRuntime';

function createRuntime(input?: {
  maxDiagnostics?: number;
  retryDelays?: number[];
  followUpDelayMs?: number;
  evaluateCandidate?: (blockId: string) => Promise<void>;
  businessIdentity?: AutoCardListenerBusinessIdentity | null;
}) {
  let candidateCounter = 0;
  const evaluateCandidate = vi.fn(input?.evaluateCandidate ?? (async () => undefined));
  const clearEvaluationFingerprint = vi.fn();
  const clearBusinessIdentity = vi.fn();
  const traceAutoCard = vi.fn();
  const runtime = new AutoCardListenerCandidateRuntime({
    settledEvaluationDelayMs: 300,
    candidateRetryDelaysMs: input?.retryDelays ?? [250, 750],
    followUpEvaluationDelayMs: input?.followUpDelayMs ?? 0,
    maxDiagnostics: input?.maxDiagnostics ?? 200,
    nextCandidateId: () => `candidate-${++candidateCounter}`,
    evaluateCandidate,
    clearEvaluationFingerprint,
    getBusinessIdentity: () => input?.businessIdentity ?? null,
    clearBusinessIdentity,
    traceAutoCard,
  });

  return {
    runtime,
    evaluateCandidate,
    clearEvaluationFingerprint,
    clearBusinessIdentity,
    traceAutoCard,
  };
}

function context(overrides?: Partial<CandidateBlockContext>): CandidateBlockContext {
  return {
    candidateId: 'candidate-1',
    blockId: 'block-1',
    txBatchId: 'tx-1',
    actions: ['insert'],
    enqueuedAt: Date.now(),
    opIds: ['op-1'],
    retryAttempt: 0,
    ...overrides,
  };
}

describe('AutoCardListenerCandidateRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a candidate, records diagnostics, and evaluates after settle delay', async () => {
    const { runtime, evaluateCandidate } = createRuntime();

    runtime.enqueueCandidateBlock('block-1', 'tx-1', 'insert', 'op-1');

    expect(runtime.getPendingCandidateCount()).toBe(1);
    expect(runtime.getDiagnostics()).toMatchObject([{
      candidateId: 'candidate-1',
      blockId: 'block-1',
      status: 'accepted',
      reason: 'insert',
      terminal: false,
      actions: ['insert'],
      opIds: ['op-1'],
      attempt: 0,
    }]);

    await vi.advanceTimersByTimeAsync(299);
    expect(evaluateCandidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(evaluateCandidate).toHaveBeenCalledWith('block-1');
  });

  it('cancels a pending candidate and clears fingerprint state', () => {
    const { runtime, evaluateCandidate, clearEvaluationFingerprint } = createRuntime();
    runtime.enqueueCandidateBlock('block-1', 'tx-1', 'insert', 'op-1');

    runtime.cancelPendingCandidate('block-1', 'tx-2', 'delete');
    vi.advanceTimersByTime(300);

    expect(runtime.getPendingCandidateCount()).toBe(0);
    expect(evaluateCandidate).not.toHaveBeenCalled();
    expect(clearEvaluationFingerprint).toHaveBeenCalledWith('block-1');
    expect(runtime.getDiagnostics().at(-1)).toMatchObject({
      status: 'skipped',
      reason: 'delete',
      terminal: true,
    });
  });

  it('keeps diagnostics immutable and trims old entries by retention limit', () => {
    const { runtime } = createRuntime({ maxDiagnostics: 2 });

    runtime.enqueueCandidateBlock('block-1', 'tx-1', 'insert', 'op-1');
    runtime.enqueueCandidateBlock('block-2', 'tx-1', 'insert', 'op-2');
    runtime.enqueueCandidateBlock('block-3', 'tx-1', 'insert', 'op-3');

    const diagnostics = runtime.getDiagnostics();
    diagnostics[0].actions.push('mutated');

    expect(runtime.getDiagnostics()).toHaveLength(2);
    expect(runtime.getDiagnostics().map((diagnostic) => diagnostic.blockId)).toEqual(['block-2', 'block-3']);
    expect(runtime.getDiagnostics()[0].actions).toEqual(['insert']);
  });

  it('clears pending timers, contexts, and diagnostics on dispose', async () => {
    const { runtime, evaluateCandidate } = createRuntime();
    runtime.enqueueCandidateBlock('block-1', 'tx-1', 'insert', 'op-1');

    runtime.dispose();
    await vi.advanceTimersByTimeAsync(300);

    expect(runtime.getPendingCandidateCount()).toBe(0);
    expect(runtime.getDiagnostics()).toEqual([]);
    expect(evaluateCandidate).not.toHaveBeenCalled();
  });

  it('schedules transient retry while attempts remain', async () => {
    const { runtime, evaluateCandidate } = createRuntime({ retryDelays: [250] });

    const result = runtime.completeCandidateEvaluation({
      blockId: 'block-1',
      initialContext: context(),
      checkStatus: 'empty-content',
      errorMessage: null,
      runId: 'run-1',
    });

    expect(result.scheduledContinuation).toBe(true);
    expect(runtime.getDiagnostics().at(-1)).toMatchObject({
      status: 'retry-scheduled',
      reason: 'empty-content',
      delayMs: 250,
      attempt: 1,
      terminal: false,
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(evaluateCandidate).toHaveBeenCalledWith('block-1');
  });

  it('records retry exhaustion when transient attempts are exhausted', () => {
    const { runtime, clearBusinessIdentity } = createRuntime({ retryDelays: [] });

    const result = runtime.completeCandidateEvaluation({
      blockId: 'block-1',
      initialContext: context(),
      checkStatus: 'missing-block',
      errorMessage: null,
      runId: 'run-1',
    });

    expect(result.scheduledContinuation).toBe(false);
    expect(runtime.getPendingCandidateCount()).toBe(0);
    expect(clearBusinessIdentity).toHaveBeenCalledWith('block-1');
    expect(runtime.getDiagnostics().at(-1)).toMatchObject({
      status: 'retry-exhausted',
      reason: 'missing-block',
      terminal: true,
      runId: 'run-1',
    });
  });

  it('schedules already-processing follow-up', async () => {
    const { runtime, evaluateCandidate } = createRuntime({ followUpDelayMs: 10 });
    runtime.enqueueCandidateBlock('block-1', 'tx-1', 'insert', 'op-1');

    expect(runtime.markAlreadyProcessing('block-1', 'run-1')).toBe(true);
    const result = runtime.completeCandidateEvaluation({
      blockId: 'block-1',
      initialContext: runtime.getCandidateContext('block-1'),
      checkStatus: 'skipped',
      errorMessage: null,
      runId: 'run-2',
    });

    expect(result.scheduledContinuation).toBe(true);
    expect(runtime.getDiagnostics().at(-1)).toMatchObject({
      status: 'retry-scheduled',
      reason: 'already-processing-follow-up',
      delayMs: 10,
      terminal: false,
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(evaluateCandidate).toHaveBeenCalledWith('block-1');
  });

  it('records terminal created outcome and clears business identity', () => {
    const businessIdentity: AutoCardListenerBusinessIdentity = {
      key: 'identity-1',
      sourceBlockId: 'block-1',
      symbolRangeFingerprint: 'fingerprint-1',
      resolvedCardType: 'item',
      envelopeKind: 'planner-decision',
      targetTopicContainerId: null,
      selectedDecisionId: 'BasicDirectionRule',
      enabledDecisionIds: ['BasicDirectionRule'],
      matchedRuleIds: ['BasicDirectionRule'],
    };
    const { runtime, clearBusinessIdentity } = createRuntime({ businessIdentity });

    const result = runtime.completeCandidateEvaluation({
      blockId: 'block-1',
      initialContext: context(),
      checkStatus: 'executed-planner-decision',
      errorMessage: null,
      runId: 'run-1',
    });

    expect(result.scheduledContinuation).toBe(false);
    expect(clearBusinessIdentity).toHaveBeenCalledWith('block-1');
    expect(runtime.getDiagnostics().at(-1)).toMatchObject({
      status: 'created',
      reason: 'executed-planner-decision',
      terminal: true,
      businessIdentity,
    });
  });
});
