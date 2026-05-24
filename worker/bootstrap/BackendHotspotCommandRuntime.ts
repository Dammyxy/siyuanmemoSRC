import type {
  BackendHotspotCommandDiagnostics,
  BackendHotspotCommandEnvelope,
  BackendHotspotCommandFamily,
  BackendHotspotCommandProgress,
  BackendHotspotCommandState,
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendHotspotJobGetRequest,
  BackendHotspotJobGetResult,
} from '../../packages/contracts/src/backend-rpc';

interface RuntimeDeps {
  now?: () => number;
}

interface HotspotCommandRecord {
  family: BackendHotspotCommandFamily;
  commandId: string;
  idempotencyKey: string;
  state: BackendHotspotCommandState;
  progress: BackendHotspotCommandProgress;
  diagnostics: BackendHotspotCommandDiagnostics;
}

export interface BackendHotspotCommandDiagnosticsSnapshot {
  submittedTotal: number;
  idempotencyHitTotal: number;
  acceptedLatencyMsTotal: number;
  lastAcceptedLatencyMs: number;
  pendingCount: number;
  terminalCount: number;
  unavailableTotal: number;
  timeoutTotal: number;
  canceledTotal: number;
  writerRelayFailureTotal: number;
  kernelProxyFailureTotal: number;
}

const TERMINAL_STATES = new Set<BackendHotspotCommandState>([
  'succeeded',
  'failed',
  'unavailable',
  'timeout',
  'canceled',
  'duplicate',
  'stale-generation',
  'validation-failed',
]);

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function createDiagnosticId(family: BackendHotspotCommandFamily, commandId: string, now: number): string {
  return `hotspot:${family}:${commandId}:${now}`;
}

export class BackendHotspotCommandRuntime {
  private readonly recordsByCommandId = new Map<string, HotspotCommandRecord>();
  private readonly commandIdByIdempotencyKey = new Map<string, string>();
  private readonly now: () => number;
  private submittedTotal = 0;
  private idempotencyHitTotal = 0;
  private acceptedLatencyMsTotal = 0;
  private lastAcceptedLatencyMs = 0;
  private writerRelayFailureTotal = 0;
  private kernelProxyFailureTotal = 0;

  constructor(deps: RuntimeDeps = {}) {
    this.now = deps.now || (() => Date.now());
  }

  submit(request: BackendHotspotCommandSubmitRequest): BackendHotspotCommandSubmitResult {
    const envelope = this.validateEnvelope(request?.envelope);
    const existingCommandId = this.commandIdByIdempotencyKey.get(envelope.idempotencyKey);
    if (existingCommandId) {
      const existing = this.recordsByCommandId.get(existingCommandId);
      if (existing) {
        this.idempotencyHitTotal += 1;
        return this.toSubmitResult(existing);
      }
    }

    const now = this.now();
    const submittedAt = Number(envelope.submittedAt) || now;
    const acceptedLatencyMs = Math.max(0, now - submittedAt);
    const progress: BackendHotspotCommandProgress = {
      state: 'accepted',
      currentStep: 'accepted',
      completedUnits: 0,
      totalUnits: null,
      updatedAt: now,
    };
    const diagnostics: BackendHotspotCommandDiagnostics = {
      diagnosticEventId: normalizeString(envelope.diagnostics?.diagnosticEventId)
        || createDiagnosticId(envelope.family, envelope.commandId, now),
      family: envelope.family,
      commandId: envelope.commandId,
      timing: {
        submittedAt,
        deadlineAt: Number.isFinite(Number(envelope.deadlineAt)) ? Number(envelope.deadlineAt) : null,
      },
      counters: { acceptedLatencyMs },
      errorCategory: null,
    };
    const record: HotspotCommandRecord = {
      family: envelope.family,
      commandId: envelope.commandId,
      idempotencyKey: envelope.idempotencyKey,
      state: 'accepted',
      progress,
      diagnostics,
    };
    this.recordsByCommandId.set(record.commandId, record);
    this.commandIdByIdempotencyKey.set(record.idempotencyKey, record.commandId);
    this.submittedTotal += 1;
    this.acceptedLatencyMsTotal += acceptedLatencyMs;
    this.lastAcceptedLatencyMs = acceptedLatencyMs;
    return this.toSubmitResult(record);
  }

  get(request: BackendHotspotJobGetRequest): BackendHotspotJobGetResult {
    const family = normalizeString(request?.family) as BackendHotspotCommandFamily;
    const commandId = normalizeString(request?.commandId);
    if (!family || !commandId) {
      throw new Error('INVALID_REQUEST: hotspot.job.get requires family and commandId');
    }
    const record = this.recordsByCommandId.get(commandId);
    if (!record || record.family !== family) {
      return {
        ok: false,
        family,
        commandId,
        state: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
        reason: 'hotspot command state unavailable',
        recoverable: true,
      };
    }
    return this.toSubmitResult(record);
  }

  getDiagnostics(): BackendHotspotCommandDiagnosticsSnapshot {
    const records = Array.from(this.recordsByCommandId.values());
    return {
      submittedTotal: this.submittedTotal,
      idempotencyHitTotal: this.idempotencyHitTotal,
      acceptedLatencyMsTotal: this.acceptedLatencyMsTotal,
      lastAcceptedLatencyMs: this.lastAcceptedLatencyMs,
      pendingCount: records.filter((record) => !TERMINAL_STATES.has(record.state)).length,
      terminalCount: records.filter((record) => TERMINAL_STATES.has(record.state)).length,
      unavailableTotal: records.filter((record) => record.state === 'unavailable').length,
      timeoutTotal: records.filter((record) => record.state === 'timeout').length,
      canceledTotal: records.filter((record) => record.state === 'canceled').length,
      writerRelayFailureTotal: this.writerRelayFailureTotal,
      kernelProxyFailureTotal: this.kernelProxyFailureTotal,
    };
  }

  private validateEnvelope(envelope: BackendHotspotCommandEnvelope | undefined): BackendHotspotCommandEnvelope {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error('INVALID_REQUEST: hotspot.command.submit requires envelope');
    }
    const family = normalizeString(envelope.family) as BackendHotspotCommandFamily;
    const commandId = normalizeString(envelope.commandId);
    const idempotencyKey = normalizeString(envelope.idempotencyKey);
    if (!family || !commandId || !idempotencyKey) {
      throw new Error('INVALID_REQUEST: hotspot.command.submit requires family/commandId/idempotencyKey');
    }
    if (!envelope.caller || typeof envelope.caller !== 'object') {
      throw new Error('INVALID_REQUEST: hotspot.command.submit requires caller identity');
    }
    if (!envelope.writerExpectation || typeof envelope.writerExpectation !== 'object') {
      throw new Error('INVALID_REQUEST: hotspot.command.submit requires writer expectation');
    }
    return {
      ...envelope,
      family,
      commandId,
      idempotencyKey,
    };
  }

  private toSubmitResult(record: HotspotCommandRecord): BackendHotspotCommandSubmitResult {
    if (TERMINAL_STATES.has(record.state)) {
      if (record.state === 'succeeded' || record.state === 'duplicate') {
        return {
          ok: true,
          family: record.family,
          commandId: record.commandId,
          idempotencyKey: record.idempotencyKey,
          state: record.state,
          result: null,
          progress: { ...record.progress },
          diagnostics: { ...record.diagnostics },
        };
      }
      return {
        ok: false,
        family: record.family,
        commandId: record.commandId,
        idempotencyKey: record.idempotencyKey,
        state: record.state as Exclude<BackendHotspotCommandState, 'accepted' | 'running' | 'waiting-for-renderer-facts' | 'waiting-for-user-approval' | 'succeeded' | 'duplicate'>,
        unavailableClass: record.diagnostics.errorCategory === 'VALIDATION_FAILED' || record.diagnostics.errorCategory === 'UNKNOWN'
          ? null
          : record.diagnostics.errorCategory ?? null,
        reason: record.diagnostics.errorCategory || 'hotspot command failed',
        recoverable: record.state === 'unavailable' || record.state === 'timeout' || record.state === 'stale-generation',
        progress: { ...record.progress },
        diagnostics: { ...record.diagnostics },
      };
    }
    return {
      ok: true,
      accepted: true,
      family: record.family,
      commandId: record.commandId,
      idempotencyKey: record.idempotencyKey,
      state: record.state as 'accepted' | 'running' | 'waiting-for-renderer-facts' | 'waiting-for-user-approval',
      progress: { ...record.progress },
      diagnostics: { ...record.diagnostics },
    };
  }
}
