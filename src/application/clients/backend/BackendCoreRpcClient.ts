import type {
  BackendDbLoadRequest,
  BackendDbLoadResult,
  BackendDbReloadResult,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendPrivateDiagnosticsStatusResult,
  BackendPrivateHealthResult,
  BackendStorageMaintenanceApplyBatchRequest,
  BackendStorageMaintenanceApplyBatchResult,
  BackendStorageMaintenanceStatusRequest,
  BackendStorageMaintenanceStatusResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendCoreClientFacet {
  systemHealth(): Promise<BackendHealthResult>;
  loadDatabase(request?: BackendDbLoadRequest): Promise<BackendDbLoadResult>;
  reloadDatabase(request?: BackendDbLoadRequest): Promise<BackendDbReloadResult>;
  storageMaintenanceStatus(
    request: BackendStorageMaintenanceStatusRequest,
  ): Promise<BackendStorageMaintenanceStatusResult>;
  applyStorageMaintenanceBatch(
    request: BackendStorageMaintenanceApplyBatchRequest,
  ): Promise<BackendStorageMaintenanceApplyBatchResult>;
  diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult>;
  privateHealth(): Promise<BackendPrivateHealthResult>;
  privateDiagnosticsStatus(): Promise<BackendPrivateDiagnosticsStatusResult>;
}

export class BackendCoreRpcClient implements BackendCoreClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  systemHealth(): Promise<BackendHealthResult> {
    return this.rpcCaller.call<BackendHealthResult>('system.health');
  }

  loadDatabase(request?: BackendDbLoadRequest): Promise<BackendDbLoadResult> {
    return this.rpcCaller.call('db.load', request);
  }

  reloadDatabase(request?: BackendDbLoadRequest): Promise<BackendDbReloadResult> {
    return this.rpcCaller.call('db.reload', request);
  }

  storageMaintenanceStatus(
    request: BackendStorageMaintenanceStatusRequest,
  ): Promise<BackendStorageMaintenanceStatusResult> {
    return this.rpcCaller.call('storage.maintenance.status', request);
  }

  applyStorageMaintenanceBatch(
    request: BackendStorageMaintenanceApplyBatchRequest,
  ): Promise<BackendStorageMaintenanceApplyBatchResult> {
    return this.rpcCaller.call('storage.maintenance.applyBatch', request);
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
