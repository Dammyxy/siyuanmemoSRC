import type { PrivateApiCapabilityResult } from '../../../packages/contracts/src/backend-rpc';

export interface PrivateApiAuditEvent {
  requestId: string;
  method: string;
  callerIntent: string;
  capabilityResult: PrivateApiCapabilityResult;
  accepted: boolean;
  resultStatus: 'accepted' | 'completed' | 'rejected' | 'unavailable' | 'failed';
  timestamp: number;
}

export class PrivateApiAuditService {
  private readonly events: PrivateApiAuditEvent[] = [];
  constructor(private readonly maxEvents = 500) {}

  canExecute(input: {
    method: string;
    backendWorkerAvailable: boolean;
    kernelSidecarAvailable: boolean;
    writerAvailable: boolean;
  }): PrivateApiCapabilityResult {
    const method = String(input.method || '').trim();
    const methodAllowed = method.startsWith('private.read.')
      || method.startsWith('private.command.')
      || method === 'private.health'
      || method === 'private.diagnostics.status'
      || method === 'private.audit.query';
    if (!methodAllowed) {
      return {
        available: false,
        reason: 'method-not-allowed',
        backendWorkerAvailable: input.backendWorkerAvailable,
        kernelSidecarAvailable: input.kernelSidecarAvailable,
        writerAvailable: input.writerAvailable,
        methodAllowed,
      };
    }
    if (!input.backendWorkerAvailable) {
      return {
        available: false,
        reason: 'backend-worker-unavailable',
        backendWorkerAvailable: false,
        kernelSidecarAvailable: input.kernelSidecarAvailable,
        writerAvailable: input.writerAvailable,
        methodAllowed,
      };
    }
    return {
      available: true,
      reason: null,
      backendWorkerAvailable: true,
      kernelSidecarAvailable: input.kernelSidecarAvailable,
      writerAvailable: input.writerAvailable,
      methodAllowed: true,
    };
  }

  ensurePayloadWithinLimit(payload: unknown, limitBytes: number): void {
    const limit = Math.max(64, Math.floor(Number(limitBytes || 0)));
    const encoded = JSON.stringify(payload ?? null) ?? '';
    if (encoded.length > limit) {
      throw new Error(`INVALID_REQUEST: private mutation payload exceeds limit (${encoded.length}/${limit})`);
    }
  }

  record(event: PrivateApiAuditEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  query(limit = 50): PrivateApiAuditEvent[] {
    const max = Math.max(1, Math.floor(Number(limit || 0)));
    return this.events.slice(-max).reverse();
  }
}
