import { describe, expect, it } from 'vitest';
import { PrivateApiAuditService } from '../PrivateApiAuditService';

describe('PrivateApiAuditService', () => {
  it('returns unavailable class when backend worker is not available', () => {
    const service = new PrivateApiAuditService();
    const result = service.canExecute({
      method: 'private.read.cards',
      backendWorkerAvailable: false,
      kernelSidecarAvailable: true,
      writerAvailable: false,
    });
    expect(result).toMatchObject({
      available: false,
      reason: 'backend-worker-unavailable',
      methodAllowed: true,
    });
  });

  it('returns method-not-allowed for unknown method', () => {
    const service = new PrivateApiAuditService();
    const result = service.canExecute({
      method: 'private.unknown.method',
      backendWorkerAvailable: true,
      kernelSidecarAvailable: true,
      writerAvailable: true,
    });
    expect(result).toMatchObject({
      available: false,
      reason: 'method-not-allowed',
      methodAllowed: false,
    });
  });

  it('enforces payload size limits', () => {
    const service = new PrivateApiAuditService();
    expect(() => service.ensurePayloadWithinLimit({ payload: 'x'.repeat(256) }, 64)).toThrow(
      'INVALID_REQUEST: private mutation payload exceeds limit',
    );
  });

  it('records and queries audit trail in reverse chronological order', () => {
    const service = new PrivateApiAuditService(3);
    service.record({
      requestId: 'r1',
      method: 'private.read.cards',
      callerIntent: 'test-1',
      capabilityResult: {
        available: true,
        reason: null,
        backendWorkerAvailable: true,
        kernelSidecarAvailable: true,
        writerAvailable: true,
        methodAllowed: true,
      },
      accepted: true,
      resultStatus: 'accepted',
      timestamp: 1,
    });
    service.record({
      requestId: 'r2',
      method: 'private.read.queues',
      callerIntent: 'test-2',
      capabilityResult: {
        available: true,
        reason: null,
        backendWorkerAvailable: true,
        kernelSidecarAvailable: true,
        writerAvailable: true,
        methodAllowed: true,
      },
      accepted: true,
      resultStatus: 'completed',
      timestamp: 2,
    });

    const rows = service.query(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].requestId).toBe('r2');
    expect(rows[1].requestId).toBe('r1');
  });
});
