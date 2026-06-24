import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import type { BackendIntegrationClientFacet } from '@/application/clients/backend';
import {
  type BackendAutoCardExecuteEnvelope,
  type BackendAutoCardExecuteBatchRequest,
  type BackendAutoCardExecuteBatchResult,
  type BackendAutoCardExecuteRequest,
  type BackendAutoCardExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';
import type { AutoCardExecutionEnvelope, AutoCardExecutionResult } from './AutoCardExecutionRuntime';
import type { BackendRelayRuntimeState } from './AutoCardDecisionRelayRuntime';

export interface AutoCardExecuteFollowerCommandClient {
  submitAndWait: <TResult>(request: {
    instanceId: string;
    commandId?: string;
    method: string;
    params?: unknown;
  }, timeoutMs?: number) => Promise<TResult>;
}

export interface AutoCardExecuteFrontendRelayRuntime {
  ensureWritable?: () => Promise<void>;
}

export type AutoCardExecuteBackendClient = Pick<BackendIntegrationClientFacet, 'executeAutoCard' | 'executeAutoCardBatch'>;

export interface AutoCardExecuteRelayRuntimeDependencies {
  getBackendClient: () => AutoCardExecuteBackendClient | null;
  getRuntimePolicy: () => Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null;
  getRelayRuntimeState: () => BackendRelayRuntimeState;
  getFrontendRelayRuntime: () => AutoCardExecuteFrontendRelayRuntime | null;
  getFollowerCommandClient: () => AutoCardExecuteFollowerCommandClient | null;
  tracePolicyDecision: (reason: string, payload?: Record<string, unknown>) => void;
  toBackendExecuteEnvelope: (envelope: AutoCardExecutionEnvelope) => BackendAutoCardExecuteEnvelope;
}

export class AutoCardExecuteRelayRuntime {
  constructor(private readonly deps: AutoCardExecuteRelayRuntimeDependencies) {}

  async execute(envelope: AutoCardExecutionEnvelope): Promise<AutoCardExecutionResult> {
    const request: BackendAutoCardExecuteRequest = {
      envelope: this.deps.toBackendExecuteEnvelope(envelope),
    };
    return this.executeRequest({
      request,
      envelopeKind: envelope.kind,
      directBackendCall: (backendClient) => backendClient.executeAutoCard(request),
    });
  }

  async executeBatch(envelopes: AutoCardExecutionEnvelope[]): Promise<AutoCardExecutionResult> {
    const request: BackendAutoCardExecuteBatchRequest = {
      items: envelopes.map((envelope) => ({
        envelope: this.deps.toBackendExecuteEnvelope(envelope),
      })),
    };
    return this.executeRequest({
      request,
      envelopeKind: 'batch',
      directBackendCall: (backendClient) => backendClient.executeAutoCardBatch(request),
      method: 'autocard.executeBatch',
      normalize: normalizeBackendExecuteBatchResult,
    });
  }

  private async executeRequest(input: {
    request: BackendAutoCardExecuteRequest | BackendAutoCardExecuteBatchRequest;
    envelopeKind: AutoCardExecutionEnvelope['kind'] | 'batch';
    directBackendCall: (backendClient: AutoCardExecuteBackendClient) => Promise<unknown>;
    method?: 'autocard.execute' | 'autocard.executeBatch';
    normalize?: (payload: unknown) => AutoCardExecutionResult;
  }): Promise<AutoCardExecutionResult> {
    const method = input.method ?? 'autocard.execute';
    const normalize = input.normalize ?? normalizeBackendExecuteResult;
    const runtimePolicy = this.deps.getRuntimePolicy();
    if (runtimePolicy && !runtimePolicy.capabilities.autoCardExecuteWriteEnabled) {
      this.deps.tracePolicyDecision(
        runtimePolicy.capabilities.backendWorkerAvailable ? 'writer-relay-disabled' : 'backend-worker-disabled',
        { method },
      );
      throw new Error(`BACKEND_UNAVAILABLE: ${method} requires backend+writer ownership`);
    }

    const backendClient = this.deps.getBackendClient();
    if (!backendClient) {
      this.deps.tracePolicyDecision('backend-worker-unavailable', { method });
      throw new Error(`BACKEND_UNAVAILABLE: ${method} requires backend-worker ownership`);
    }

    const relayRuntime = this.deps.getRelayRuntimeState();
    this.assertRelayRuntimeAvailable(runtimePolicy, relayRuntime, method);

    if (relayRuntime.mode === 'follower') {
      return this.executeViaFollowerRelay(relayRuntime, input.request, input.envelopeKind, method, normalize);
    }

    const relayResult = await this.ensureWriterRuntime(runtimePolicy, input.request, input.envelopeKind, method, normalize);
    if (relayResult) {
      return relayResult;
    }
    return this.executeViaBackend(backendClient, input.envelopeKind, method, input.directBackendCall, normalize);
  }

  private assertRelayRuntimeAvailable(
    runtimePolicy: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null,
    relayRuntime: BackendRelayRuntimeState,
    method: 'autocard.execute' | 'autocard.executeBatch',
  ): void {
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'missing') {
      this.deps.tracePolicyDecision('writer-relay-runtime-missing', { method });
      throw new Error(`BACKEND_UNAVAILABLE: ${method} requires writer relay runtime`);
    }
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'unknown') {
      this.deps.tracePolicyDecision('writer-relay-runtime-unknown', {
        method,
        rawMode: relayRuntime.rawMode,
      });
      throw new Error(`BACKEND_UNAVAILABLE: ${method} requires writer relay runtime`);
    }
  }

  private async ensureWriterRuntime(
    runtimePolicy: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null,
    request: BackendAutoCardExecuteRequest | BackendAutoCardExecuteBatchRequest,
    envelopeKind: AutoCardExecutionEnvelope['kind'] | 'batch',
    method: 'autocard.execute' | 'autocard.executeBatch',
    normalize: (payload: unknown) => AutoCardExecutionResult,
  ): Promise<void | AutoCardExecutionResult> {
    const runtime = this.deps.getFrontendRelayRuntime();
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && !runtime?.ensureWritable) {
      this.deps.tracePolicyDecision('writer-relay-runtime-missing', { method });
      throw new Error(`BACKEND_UNAVAILABLE: ${method} requires writer relay runtime`);
    }
    if (!runtime?.ensureWritable) {
      return;
    }

    try {
      await measureRuntimePerformance('relay', 'ensure-writable.autocard-execute', () => runtime.ensureWritable!(), {
        method,
      });
    } catch (error) {
      const refreshedRelayRuntime = this.deps.getRelayRuntimeState();
      if (refreshedRelayRuntime.mode === 'follower') {
        return this.executeViaFollowerRelay(refreshedRelayRuntime, request, envelopeKind, method, normalize);
      }
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.startsWith('BACKEND_UNAVAILABLE:')) {
        this.deps.tracePolicyDecision('writer-unavailable', {
          method,
          error: message,
        });
      }
      throw error;
    }

    const refreshedRelayRuntime = this.deps.getRelayRuntimeState();
    if (refreshedRelayRuntime.mode === 'follower') {
      return this.executeViaFollowerRelay(refreshedRelayRuntime, request, envelopeKind, method, normalize);
    }
  }

  private async executeViaFollowerRelay(
    relayRuntime: Extract<BackendRelayRuntimeState, { mode: 'follower' }>,
    request: BackendAutoCardExecuteRequest | BackendAutoCardExecuteBatchRequest,
    envelopeKind: AutoCardExecutionEnvelope['kind'] | 'batch',
    method: 'autocard.execute' | 'autocard.executeBatch',
    normalize: (payload: unknown) => AutoCardExecutionResult,
  ): Promise<AutoCardExecutionResult> {
    const followerClient = this.deps.getFollowerCommandClient();
    if (!followerClient) {
      this.deps.tracePolicyDecision('follower-relay-unavailable', {
        method,
        instanceId: relayRuntime.instanceId,
      });
      throw new Error(`BACKEND_UNAVAILABLE: ${method} relay is unavailable in follower mode`);
    }
    try {
      const relayResult = await measureRuntimePerformance('autocard', 'execute.relay-submit-wait', () => followerClient.submitAndWait<unknown>({
        instanceId: relayRuntime.instanceId,
        method,
        params: request,
      }), {
        envelopeKind,
        method,
      });
      return normalize(relayResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.includes('BACKEND_UNAVAILABLE: writer relay timeout')) {
        this.deps.tracePolicyDecision('follower-relay-timeout', {
          method,
          instanceId: relayRuntime.instanceId,
        });
      }
      throw error;
    }
  }

  private async executeViaBackend(
    backendClient: AutoCardExecuteBackendClient,
    envelopeKind: AutoCardExecutionEnvelope['kind'] | 'batch',
    method: 'autocard.execute' | 'autocard.executeBatch',
    directBackendCall: (backendClient: AutoCardExecuteBackendClient) => Promise<unknown>,
    normalize: (payload: unknown) => AutoCardExecutionResult,
  ): Promise<AutoCardExecutionResult> {
    try {
      const result = await measureRuntimePerformance('autocard', 'execute.backend-worker', () => directBackendCall(backendClient), {
        envelopeKind,
        method,
      });
      return normalize(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.startsWith('BACKEND_UNAVAILABLE:')) {
        if (message.includes('writer lease')) {
          this.deps.tracePolicyDecision('writer-unavailable', {
            method,
            error: message,
          });
        }
        throw error;
      }
      throw error;
    }
  }
}

export function normalizeBackendExecuteResult(payload: unknown): AutoCardExecutionResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('autocard.execute returned invalid payload');
  }
  const candidate = payload as Partial<BackendAutoCardExecuteResult>;
  return {
    executed: candidate.executed === true,
    created: Math.max(0, Math.floor(Number(candidate.created || 0))),
    skipped: Math.max(0, Math.floor(Number(candidate.skipped || 0))),
  };
}

export function normalizeBackendExecuteBatchResult(payload: unknown): AutoCardExecutionResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('autocard.executeBatch returned invalid payload');
  }
  const candidate = payload as Partial<BackendAutoCardExecuteBatchResult>;
  const failed = Math.max(0, Math.floor(Number(candidate.failed || 0)));
  return {
    executed: candidate.executed === true,
    created: Math.max(0, Math.floor(Number(candidate.created || 0))),
    skipped: Math.max(0, Math.floor(Number(candidate.skipped || 0))),
    failed: failed > 0 ? failed : undefined,
  };
}
