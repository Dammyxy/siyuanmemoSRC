import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import {
  type BackendAutoCardExecuteEnvelope,
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

export interface AutoCardExecuteRelayRuntimeDependencies {
  getBackendClient: () => SrsBackendClient | null;
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
    const runtimePolicy = this.deps.getRuntimePolicy();
    if (runtimePolicy && !runtimePolicy.capabilities.autoCardExecuteWriteEnabled) {
      this.deps.tracePolicyDecision(
        runtimePolicy.capabilities.backendWorkerAvailable ? 'writer-relay-disabled' : 'backend-worker-disabled',
        { method: 'autocard.execute' },
      );
      throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires backend+writer ownership');
    }

    const backendClient = this.deps.getBackendClient();
    if (!backendClient) {
      this.deps.tracePolicyDecision('backend-worker-unavailable', { method: 'autocard.execute' });
      throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires backend-worker ownership');
    }

    const relayRuntime = this.deps.getRelayRuntimeState();
    this.assertRelayRuntimeAvailable(runtimePolicy, relayRuntime);
    const request: BackendAutoCardExecuteRequest = {
      envelope: this.deps.toBackendExecuteEnvelope(envelope),
    };

    if (relayRuntime.mode === 'follower') {
      return this.executeViaFollowerRelay(relayRuntime, request, envelope);
    }

    const relayResult = await this.ensureWriterRuntime(runtimePolicy, request, envelope);
    if (relayResult) {
      return relayResult;
    }
    return this.executeViaBackend(backendClient, request, envelope);
  }

  private assertRelayRuntimeAvailable(
    runtimePolicy: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null,
    relayRuntime: BackendRelayRuntimeState,
  ): void {
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'missing') {
      this.deps.tracePolicyDecision('writer-relay-runtime-missing', { method: 'autocard.execute' });
      throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');
    }
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'unknown') {
      this.deps.tracePolicyDecision('writer-relay-runtime-unknown', {
        method: 'autocard.execute',
        rawMode: relayRuntime.rawMode,
      });
      throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');
    }
  }

  private async ensureWriterRuntime(
    runtimePolicy: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null,
    request: BackendAutoCardExecuteRequest,
    envelope: AutoCardExecutionEnvelope,
  ): Promise<void | AutoCardExecutionResult> {
    const runtime = this.deps.getFrontendRelayRuntime();
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && !runtime?.ensureWritable) {
      this.deps.tracePolicyDecision('writer-relay-runtime-missing', { method: 'autocard.execute' });
      throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');
    }
    if (!runtime?.ensureWritable) {
      return;
    }

    try {
      await measureRuntimePerformance('relay', 'ensure-writable.autocard-execute', () => runtime.ensureWritable!(), {
        method: 'autocard.execute',
      });
    } catch (error) {
      const refreshedRelayRuntime = this.deps.getRelayRuntimeState();
      if (refreshedRelayRuntime.mode === 'follower') {
        return this.executeViaFollowerRelay(refreshedRelayRuntime, request, envelope);
      }
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.startsWith('BACKEND_UNAVAILABLE:')) {
        this.deps.tracePolicyDecision('writer-unavailable', {
          method: 'autocard.execute',
          error: message,
        });
      }
      throw error;
    }

    const refreshedRelayRuntime = this.deps.getRelayRuntimeState();
    if (refreshedRelayRuntime.mode === 'follower') {
      return this.executeViaFollowerRelay(refreshedRelayRuntime, request, envelope);
    }
  }

  private async executeViaFollowerRelay(
    relayRuntime: Extract<BackendRelayRuntimeState, { mode: 'follower' }>,
    request: BackendAutoCardExecuteRequest,
    envelope: AutoCardExecutionEnvelope,
  ): Promise<AutoCardExecutionResult> {
    const followerClient = this.deps.getFollowerCommandClient();
    if (!followerClient) {
      this.deps.tracePolicyDecision('follower-relay-unavailable', {
        method: 'autocard.execute',
        instanceId: relayRuntime.instanceId,
      });
      throw new Error('BACKEND_UNAVAILABLE: autocard.execute relay is unavailable in follower mode');
    }
    try {
      const relayResult = await measureRuntimePerformance('autocard', 'execute.relay-submit-wait', () => followerClient.submitAndWait<unknown>({
        instanceId: relayRuntime.instanceId,
        method: 'autocard.execute',
        params: request,
      }), {
        envelopeKind: envelope.kind,
        method: 'autocard.execute',
      });
      return normalizeBackendExecuteResult(relayResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.includes('BACKEND_UNAVAILABLE: writer relay timeout')) {
        this.deps.tracePolicyDecision('follower-relay-timeout', {
          method: 'autocard.execute',
          instanceId: relayRuntime.instanceId,
        });
      }
      throw error;
    }
  }

  private async executeViaBackend(
    backendClient: SrsBackendClient,
    request: BackendAutoCardExecuteRequest,
    envelope: AutoCardExecutionEnvelope,
  ): Promise<AutoCardExecutionResult> {
    try {
      const result = await measureRuntimePerformance('autocard', 'execute.backend-worker', () => backendClient.executeAutoCard(request), {
        envelopeKind: envelope.kind,
        method: 'autocard.execute',
      });
      return normalizeBackendExecuteResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.startsWith('BACKEND_UNAVAILABLE:')) {
        if (message.includes('writer lease')) {
          this.deps.tracePolicyDecision('writer-unavailable', {
            method: 'autocard.execute',
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
