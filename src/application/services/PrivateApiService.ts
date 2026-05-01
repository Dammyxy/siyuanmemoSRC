import type {
  PrivateApiCapabilityResult,
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { PrivateApiClient } from '@/application/clients/PrivateApiClient';
import type { PrivateApiAuditEvent, PrivateApiAuditService } from '@/application/services/PrivateApiAuditService';

interface PrivateApiServiceDeps {
  privateApiClient: Pick<PrivateApiClient, 'read' | 'mutate'>;
  auditService: Pick<PrivateApiAuditService, 'canExecute' | 'ensurePayloadWithinLimit' | 'record'>;
  resolveCapabilitySource?: () => CapabilitySourceInput;
}

interface CapabilitySourceInput {
  backendWorkerAvailable?: boolean;
  kernelSidecarAvailable?: boolean;
  writerAvailable?: boolean;
}

export class PrivateApiService {
  private readonly privateApiClient: Pick<PrivateApiClient, 'read' | 'mutate'>;
  private readonly auditService: Pick<PrivateApiAuditService, 'canExecute' | 'ensurePayloadWithinLimit' | 'record'>;
  private readonly resolveCapabilitySource: (() => CapabilitySourceInput) | null;
  private readonly maxMutationPayloadBytes: number;

  constructor(
    deps: PrivateApiServiceDeps,
    options?: {
      maxMutationPayloadBytes?: number;
    },
  ) {
    this.privateApiClient = deps.privateApiClient;
    this.auditService = deps.auditService;
    this.resolveCapabilitySource = deps.resolveCapabilitySource || null;
    this.maxMutationPayloadBytes = Math.max(
      64,
      Math.floor(Number(options?.maxMutationPayloadBytes ?? 8_192)),
    );
  }

  async read(
    request: PrivateApiReadRequest,
    capabilitySource: CapabilitySourceInput = {},
  ): Promise<PrivateApiReadResult> {
    const capabilityResult = this.resolveCapability(
      request.method,
      this.mergeCapabilitySource(capabilitySource),
    );
    if (!capabilityResult.available) {
      this.recordAudit({
        requestId: request.requestId,
        method: request.method,
        callerIntent: request.callerIntent,
        capabilityResult,
        accepted: false,
        resultStatus: 'unavailable',
      });
      throw new Error(`BACKEND_UNAVAILABLE: capability unavailable (${capabilityResult.reason})`);
    }
    this.recordAudit({
      requestId: request.requestId,
      method: request.method,
      callerIntent: request.callerIntent,
      capabilityResult,
      accepted: true,
      resultStatus: 'accepted',
    });
    const result = await this.privateApiClient.read({
      ...request,
      capabilityResult,
    });
    this.recordAudit({
      requestId: request.requestId,
      method: request.method,
      callerIntent: request.callerIntent,
      capabilityResult,
      accepted: true,
      resultStatus: 'completed',
    });
    return result;
  }

  async mutate(
    request: PrivateApiMutationRequest,
    capabilitySource: CapabilitySourceInput = {},
  ): Promise<PrivateApiMutationResult> {
    const idempotencyKey = String(request.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      throw new Error('INVALID_REQUEST: private mutation requires idempotencyKey');
    }
    this.auditService.ensurePayloadWithinLimit(request.params ?? {}, this.maxMutationPayloadBytes);
    const capabilityResult = this.resolveCapability(
      request.method,
      this.mergeCapabilitySource(capabilitySource),
    );
    if (!capabilityResult.available) {
      this.recordAudit({
        requestId: request.requestId,
        method: request.method,
        callerIntent: request.callerIntent,
        capabilityResult,
        accepted: false,
        resultStatus: 'unavailable',
      });
      throw new Error(`BACKEND_UNAVAILABLE: capability unavailable (${capabilityResult.reason})`);
    }
    this.recordAudit({
      requestId: request.requestId,
      method: request.method,
      callerIntent: request.callerIntent,
      capabilityResult,
      accepted: true,
      resultStatus: 'accepted',
    });
    const result = await this.privateApiClient.mutate({
      ...request,
      idempotencyKey,
      capabilityResult,
    });
    this.recordAudit({
      requestId: request.requestId,
      method: request.method,
      callerIntent: request.callerIntent,
      capabilityResult,
      accepted: true,
      resultStatus: 'completed',
    });
    return result;
  }

  private resolveCapability(
    method: string,
    capabilitySource: CapabilitySourceInput,
  ): PrivateApiCapabilityResult {
    return this.auditService.canExecute({
      method,
      backendWorkerAvailable: capabilitySource.backendWorkerAvailable !== false,
      kernelSidecarAvailable: capabilitySource.kernelSidecarAvailable !== false,
      writerAvailable: capabilitySource.writerAvailable !== false,
    });
  }

  private mergeCapabilitySource(overrides: CapabilitySourceInput): CapabilitySourceInput {
    const base = this.resolveCapabilitySource?.() || {};
    return {
      backendWorkerAvailable: overrides.backendWorkerAvailable ?? base.backendWorkerAvailable,
      kernelSidecarAvailable: overrides.kernelSidecarAvailable ?? base.kernelSidecarAvailable,
      writerAvailable: overrides.writerAvailable ?? base.writerAvailable,
    };
  }

  private recordAudit(event: Omit<PrivateApiAuditEvent, 'timestamp'>): void {
    this.auditService.record({
      ...event,
      timestamp: Date.now(),
    });
  }
}
