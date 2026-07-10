import {
  BACKEND_RPC_VERSION,
  type BackendAutoCardExecuteBatchResult,
  type BackendAutoCardExecuteResult,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendProgressiveCommandExecuteRequest,
  type BackendProgressiveCommandExecuteResult,
  type BackendRpcResponse,
  type BackendTopicDerivedCommandExecuteRequest,
  type BackendTopicDerivedCommandExecuteResult,
} from '../../packages/contracts/src/backend-rpc';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createIndexedDbReviewFeedbackJournalStore } from '../db/ReviewFeedbackJournalStore';
import type { MessagePackTruthSegmentFileStore } from '../truth/MessagePackTruthSegmentStore';
import { BackendKernel } from './BackendKernel';
import type {
  BackendWorkerHostEffect,
  BackendWorkerHostEffectResultMessage,
  BackendWorkerMainToWorkerMessage,
  BackendWorkerResponseTiming,
  BackendWorkerToMainMessage,
} from './BackendWorkerProtocol';
import {
  beginBackendWorkerTiming,
  beginBackendWorkerRequest,
  endBackendWorkerRequest,
  markActiveBackendWorkerTimingAmbiguous,
  recordBackendWorkerHostEffect,
  recordBackendWorkerInnerStep,
  resolveExclusiveActiveBackendWorkerTiming,
  shouldSuppressReviewFeedbackPersistenceHostEffect,
  type ActiveReviewFeedbackTiming,
} from './ReviewFeedbackTimingScope';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BackendWorkerEntry');
const REVIEW_FEEDBACK_WORKER_ENTRY_STEP_SLOW_MS = 120;

type WorkerGlobalScopeLike = {
  postMessage(message: BackendWorkerToMainMessage): void;
  onmessage: ((event: MessageEvent<BackendWorkerMainToWorkerMessage>) => void) | null;
  close?: () => void;
};

const scope = self as unknown as WorkerGlobalScopeLike;

let hostEffectSeq = 0;
const pendingHostEffects = new Map<string, {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}>();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildInternalErrorResponse(
  id: string | number,
  message: string,
): BackendRpcResponse {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  };
}

function requestHostEffect<TResult>(effect: BackendWorkerHostEffect): Promise<TResult> {
  const effectId = `effect-${++hostEffectSeq}`;
  const startedAt = Date.now();
  const activeTiming = resolveExclusiveActiveBackendWorkerTiming();
  const effectMetadata = {
    path: 'path' in effect ? String(effect.path || '') || null : null,
    byteLength: 'bytes' in effect && effect.bytes instanceof Uint8Array
      ? effect.bytes.byteLength
      : null,
    purpose: 'purpose' in effect ? String(effect.purpose || '') || null : null,
    substep: 'substep' in effect ? String(effect.substep || '') || null : null,
  };
  if (
    shouldSuppressReviewFeedbackPersistenceHostEffect(effect.kind, activeTiming)
  ) {
    recordBackendWorkerHostEffect(
      activeTiming?.method === 'review.feedback' ? activeTiming : null,
      effect.kind,
      Date.now() - startedAt,
      effectMetadata,
    );
    return Promise.reject(new Error(
      `BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect ${effect.kind}`,
    ));
  }
  const pending = new Promise<TResult>((resolve, reject) => {
    pendingHostEffects.set(effectId, {
      resolve: (result) => {
        const workerTiming = resolveExclusiveActiveBackendWorkerTiming();
        recordBackendWorkerHostEffect(workerTiming, effect.kind, Date.now() - startedAt, effectMetadata);
        if (!workerTiming) {
          markActiveBackendWorkerTimingAmbiguous();
        }
        resolve(result as TResult);
      },
      reject: (error) => {
        const workerTiming = resolveExclusiveActiveBackendWorkerTiming();
        recordBackendWorkerHostEffect(workerTiming, effect.kind, Date.now() - startedAt, effectMetadata);
        if (!workerTiming) {
          markActiveBackendWorkerTimingAmbiguous();
        }
        reject(error);
      },
    });
  });
  scope.postMessage({
    kind: 'host-effect',
    effectId,
    effect: {
      ...effect,
      requestMethod: activeTiming?.method ?? null,
    },
  });
  return pending;
}

function buildReviewFeedbackResponseTiming(input: {
  sentAt: number | null;
  receivedAt: number;
  handleStartedAt: number;
  handledAt: number;
  requestTiming: ActiveReviewFeedbackTiming;
}): BackendWorkerResponseTiming {
  return {
    sentAt: input.sentAt,
    receivedAt: input.receivedAt,
    receivedDelayMs: input.sentAt === null ? null : Math.max(0, input.receivedAt - input.sentAt),
    handleStartedAt: input.handleStartedAt,
    handledAt: input.handledAt,
    handleDurationMs: Math.max(0, input.handledAt - input.handleStartedAt),
    hostEffectCount: input.requestTiming.hostEffectCount,
    hostEffectTotalMs: input.requestTiming.hostEffectTotalMs,
    hostEffectAttribution: input.requestTiming.hostEffectAttribution,
    slowestHostEffect: input.requestTiming.slowestHostEffect,
    hostEffectBreakdown: input.requestTiming.hostEffectBreakdown,
    innerSteps: input.requestTiming.innerSteps,
    innerStepAttribution: input.requestTiming.innerStepAttribution,
    innerStepsTruncated: input.requestTiming.innerStepsTruncated,
  };
}

function handleHostEffectResult(message: BackendWorkerHostEffectResultMessage): void {
  const pending = pendingHostEffects.get(message.effectId);
  if (!pending) {
    return;
  }
  pendingHostEffects.delete(message.effectId);
  if (message.ok) {
    pending.resolve(message.result);
    return;
  }
  pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
}

function extractReviewFeedbackCardId(message: BackendWorkerMainToWorkerMessage): string | null {
  if (message.kind !== 'request' || !isReviewFeedbackTimingMethod(message.request.method)) {
    return null;
  }
  const params = Array.isArray(message.request.params) ? message.request.params[0] : null;
  if (!params || typeof params !== 'object') {
    return null;
  }
  const cardId = String((params as { cardId?: unknown }).cardId || '').trim();
  return cardId || null;
}

function extractQueueType(message: BackendWorkerMainToWorkerMessage): string | null {
  if (message.kind !== 'request') {
    return null;
  }
  const params = Array.isArray(message.request.params) ? message.request.params[0] : null;
  if (!params || typeof params !== 'object') {
    return null;
  }
  const queueType = String((params as { queueType?: unknown }).queueType || '').trim();
  return queueType || null;
}

const DIAGNOSTIC_TIMING_METHODS = new Set<string>([
  'browser.deck.page',
  'browser.stats',
  'browser.deck.documentCounts',
  'review.session.feedback',
  'storage.projection.rebuild',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'queue.projection.replace',
]);

function isReviewFeedbackTimingMethod(method: string): boolean {
  return method === 'review.feedback' || method === 'review.session.feedback';
}

function shouldCaptureBackendWorkerTiming(method: string): boolean {
  return isReviewFeedbackTimingMethod(method) || DIAGNOSTIC_TIMING_METHODS.has(method);
}

function logReviewFeedbackWorkerEntryStepIfSlow(
  step: string,
  cardId: string | null,
  durationMs: number,
): void {
  if (durationMs < REVIEW_FEEDBACK_WORKER_ENTRY_STEP_SLOW_MS) {
    return;
  }
  logger.trace?.('[SiYuanMemo][BackendWorkerEntry] slow review.feedback worker entry step', {
    step,
    cardId,
    durationMs,
    pendingHostEffects: pendingHostEffects.size,
  });
}

const truthFileStore: MessagePackTruthSegmentFileStore = {
  readBinary: (path) => requestHostEffect<Uint8Array | null>({
    kind: 'truth.readBinary',
    path,
  }),
  writeBinary: (path, bytes) => requestHostEffect<void>({
    kind: 'truth.writeBinary',
    path,
    bytes,
  }),
  readJSON: <T>(path: string) => requestHostEffect<T | null>({
    kind: 'truth.readJSON',
    path,
  }),
  writeJSON: (path, value) => requestHostEffect<void>({
    kind: 'truth.writeJSON',
    path,
    value,
  }),
  listFiles: (prefix) => requestHostEffect<string[]>({
    kind: 'truth.listFiles',
    prefix,
  }),
};

const database = new WorkerSqliteDatabaseService({
  truthFileStore,
  reviewFeedbackJournalStore: createIndexedDbReviewFeedbackJournalStore(),
  readBinary: (path, metadata) => requestHostEffect<Uint8Array | null>({
    kind: 'sqlite.readBinary',
    path,
    purpose: metadata?.purpose ?? null,
    substep: metadata?.substep ?? null,
  }),
  writeBinary: (path, bytes, metadata) => requestHostEffect<void>({
    kind: 'sqlite.writeBinary',
    path,
    bytes,
    purpose: metadata?.purpose ?? null,
    substep: metadata?.substep ?? null,
  }),
  readJSON: <T>(path: string, metadata?: { purpose?: string | null; substep?: string | null }) => requestHostEffect<T | null>({
    kind: 'sqlite.readJSON',
    path,
    purpose: metadata?.purpose ?? null,
    substep: metadata?.substep ?? null,
  }),
  writeJSON: (path, value, metadata) => requestHostEffect<void>({
    kind: 'sqlite.writeJSON',
    path,
    value,
    purpose: metadata?.purpose ?? null,
    substep: metadata?.substep ?? null,
  }),
  hasLegacyPetalSqliteDb: () => requestHostEffect<boolean>({
    kind: 'sqlite.hasLegacyPetalSqliteDb',
  }),
  readSyncConflictDatabaseSources: () => requestHostEffect<Array<{
    sourceId: string;
    bytes: Uint8Array;
    path?: string | null;
    modifiedAt?: number | null;
    size?: number | null;
  }>>({
    kind: 'sqlite.readSyncConflictDatabaseSources',
  }),
  cleanupSyncConflictDatabaseSources: (sourceIds) => requestHostEffect<{
    cleaned: Array<{ sourceId: string; path: string | null }>;
    skipped: Array<{ sourceId: string; reason: string }>;
    failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  }>({
    kind: 'sqlite.cleanupSyncConflictDatabaseSources',
    sourceIds,
  }),
});

const backendKernel = new BackendKernel({
  database,
  truthFileStore,
  resolveExistingBlockIds: (blockIds) => requestHostEffect<string[]>({
    kind: 'siyuan.resolveExistingBlockIds',
    blockIds,
  }),
  resolveNeuralGraphQuery: (request: BackendNeuralGraphQueryRequest) => requestHostEffect<BackendNeuralGraphQueryResult>({
    kind: 'siyuan.neuralGraph.query',
    request,
  }),
  executeAutoCard: (request) => requestHostEffect<BackendAutoCardExecuteResult>({
    kind: 'autocard.execute',
    request,
  }),
  executeAutoCardBatch: (request) => requestHostEffect<BackendAutoCardExecuteBatchResult>({
    kind: 'autocard.executeBatch',
    request,
  }),
  executeProgressiveCommand: (request: BackendProgressiveCommandExecuteRequest) => requestHostEffect<BackendProgressiveCommandExecuteResult>({
    kind: 'progressive.command.execute',
    request,
  }),
  executeTopicDerivedCommand: (request: BackendTopicDerivedCommandExecuteRequest) => requestHostEffect<BackendTopicDerivedCommandExecuteResult>({
    kind: 'topic-derived.command.execute',
    request,
  }),
});

scope.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.kind === 'host-effect-result') {
    handleHostEffectResult(message);
    return;
  }
  if (message.kind === 'shutdown') {
    pendingHostEffects.clear();
    scope.close?.();
    return;
  }
  if (message.kind === 'probe') {
    scope.postMessage({
      kind: 'probe-result',
      probeId: message.probeId,
    });
    return;
  }
  if (message.kind === 'request') {
    const isReviewFeedback = message.request.method === 'review.feedback';
    const isReviewFeedbackTiming = isReviewFeedbackTimingMethod(message.request.method);
    const cardId = isReviewFeedbackTiming ? extractReviewFeedbackCardId(message) : null;
    const queueType = extractQueueType(message);
    const captureTiming = shouldCaptureBackendWorkerTiming(message.request.method);
    const receivedAt = Date.now();
    const sentAt = typeof message.sentAt === 'number' && Number.isFinite(message.sentAt)
      ? message.sentAt
      : null;
    const requestTiming: ActiveReviewFeedbackTiming | null = isReviewFeedback
      ? beginBackendWorkerRequest(true, cardId)
      : captureTiming
        ? beginBackendWorkerTiming(message.request.method, null, { queueType })
        : beginBackendWorkerRequest(false);
    if (isReviewFeedback) {
      if (sentAt !== null) {
        logReviewFeedbackWorkerEntryStepIfSlow('main-to-worker-received', cardId, receivedAt - sentAt);
      }
    }
    const startedAt = Date.now();
    backendKernel.handle(message.request)
      .catch((error) => buildInternalErrorResponse(
        message.request?.id ?? 'invalid-request',
        toErrorMessage(error),
      ))
      .then((response) => {
        const handledAt = Date.now();
        if (captureTiming) {
          recordBackendWorkerInnerStep({
            layer: 'worker-entry',
            step: 'handle-to-response',
            cardId,
            durationMs: Math.max(0, handledAt - startedAt),
            queueType,
            extra: {
              backendMethod: message.request.method,
              queueType,
            },
          });
        }
        if (isReviewFeedback) {
          logReviewFeedbackWorkerEntryStepIfSlow('handle-to-response', cardId, handledAt - startedAt);
        }
        const timing = captureTiming && requestTiming
          ? buildReviewFeedbackResponseTiming({
              sentAt,
              receivedAt,
              handleStartedAt: startedAt,
              handledAt,
              requestTiming,
            })
          : null;
        scope.postMessage({
          kind: 'response',
          requestId: message.requestId,
          response,
          timing,
        });
      })
      .finally(() => {
        endBackendWorkerRequest(requestTiming);
      });
  }
};

scope.postMessage({ kind: 'ready' });
