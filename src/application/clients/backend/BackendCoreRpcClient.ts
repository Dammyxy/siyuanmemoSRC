import type {
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendPrivateDiagnosticsStatusResult,
  BackendPrivateHealthResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendCoreClientFacet {
  systemHealth(): Promise<BackendHealthResult>;
  loadDatabase(): Promise<{ ok: true; initialized: true; dbFile: string }>;
  persistDatabase(): Promise<{ ok: true; persisted: true; dbFile: string }>;
  diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult>;
  privateHealth(): Promise<BackendPrivateHealthResult>;
  privateDiagnosticsStatus(): Promise<BackendPrivateDiagnosticsStatusResult>;
}

export class BackendCoreRpcClient implements BackendCoreClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  systemHealth(): Promise<BackendHealthResult> {
    return this.rpcCaller.call<BackendHealthResult>('system.health');
  }

  loadDatabase(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    return this.rpcCaller.call('db.load');
  }

  persistDatabase(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    return this.rpcCaller.call('db.persist');
  }

  diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> {
    return this.rpcCaller.call<BackendDiagnosticsStatusResult>('diagnostics.status');
  }

  privateHealth(): Promise<BackendPrivateHealthResult> {
    return this.rpcCaller.call<BackendPrivateHealthResult>('private.health');
  }

  privateDiagnosticsStatus(): Promise<BackendPrivateDiagnosticsStatusResult> {
    return this.rpcCaller.call<BackendPrivateDiagnosticsStatusResult>('private.diagnostics.status');
  }
}
