import { describe, expect, it, vi } from 'vitest';
import { BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_HANDLER_REGISTRATIONS } from './BackendForeignEpochRecoveryRpcAdapter';

function handler(method: string) {
  return BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_HANDLER_REGISTRATIONS.find((entry) => entry.method === method)!;
}

describe('BackendForeignEpochRecoveryRpcAdapter', () => {
  it('routes preview, apply, and status only through the recovery runtime', async () => {
    const runtime = {
      preview: vi.fn(async (request) => ({ request, kind: 'preview' } as never)),
      apply: vi.fn(async (request) => ({ request, kind: 'apply' } as never)),
      status: vi.fn(async (request) => ({ request, kind: 'status' } as never)),
    };
    const context = { foreignEpochRecovery: runtime } as never;
    const applyRequest = {
      operationId: 'operation-a',
      planHash: `sha256:${'a'.repeat(64)}`,
      backupReceipt: {},
    };

    await handler('recovery.foreignEpoch.preview').handle([{ expectedStage: 'authority-publication' }], context);
    await handler('recovery.foreignEpoch.apply').handle([applyRequest], context);
    await handler('recovery.foreignEpoch.status').handle([{ operationId: 'operation-a' }], context);

    expect(runtime.preview).toHaveBeenCalledWith({ expectedStage: 'authority-publication' });
    expect(runtime.apply).toHaveBeenCalledWith(applyRequest);
    expect(runtime.status).toHaveBeenCalledWith({ operationId: 'operation-a' });
  });

  it('rejects missing apply params before invoking the runtime', async () => {
    const runtime = {
      preview: vi.fn(),
      apply: vi.fn(),
      status: vi.fn(),
    };

    expect(() => handler('recovery.foreignEpoch.apply').handle([], {
      foreignEpochRecovery: runtime,
    } as never)).toThrow('requires named params');
    expect(runtime.apply).not.toHaveBeenCalled();
  });
});
