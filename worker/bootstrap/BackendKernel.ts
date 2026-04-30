import {
  BACKEND_RPC_VERSION,
  type BackendDiagnosticsStatusResult,
  type BackendHealthResult,
  type BackendRpcRequest,
  type BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import {
  createUnavailableSqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';

interface BackendKernelDependencies {
  database: WorkerSqliteDatabaseService;
}

function buildSuccess<TResult>(
  id: number | string,
  result: TResult,
): BackendRpcResponse<TResult> {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    result,
  };
}

function buildError(
  id: number | string,
  code: 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'METHOD_NOT_FOUND' | 'INTERNAL_ERROR',
  message: string,
): BackendRpcResponse {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };
}

export class BackendKernel {
  constructor(private readonly deps: BackendKernelDependencies) {}

  static createWithoutBridge(): BackendKernel {
    const reason = 'SrsBackendWorker persistence bridge is unavailable';
    const bridge = createUnavailableSqlitePersistenceBridge(reason);
    return BackendKernel.createWithBridge(bridge);
  }

  static createWithBridge(bridge: SqlitePersistenceBridge): BackendKernel {
    return new BackendKernel({
      database: new WorkerSqliteDatabaseService(bridge),
    });
  }

  async handle(request: BackendRpcRequest): Promise<BackendRpcResponse> {
    if (!request || request.jsonrpc !== BACKEND_RPC_VERSION || !request.method) {
      return buildError(
        request?.id ?? 'invalid-request',
        'INVALID_REQUEST',
        'Invalid SrsBackendWorker JSON-RPC request',
      );
    }

    try {
      switch (request.method) {
        case 'system.health':
          return buildSuccess(request.id, this.systemHealth());
        case 'db.load':
          return buildSuccess(request.id, await this.deps.database.load());
        case 'db.persist':
          return buildSuccess(request.id, await this.deps.database.persist());
        case 'diagnostics.status':
          return buildSuccess(request.id, this.diagnosticsStatus());
        default:
          return buildError(request.id, 'METHOD_NOT_FOUND', `Unknown method: ${request.method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('persistence bridge is unavailable')) {
        return buildError(request.id, 'BACKEND_UNAVAILABLE', message);
      }
      return buildError(request.id, 'INTERNAL_ERROR', message);
    }
  }

  private systemHealth(): BackendHealthResult {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      initialized: this.deps.database.getStatus().initialized,
    };
  }

  private diagnosticsStatus(): BackendDiagnosticsStatusResult {
    const status = this.deps.database.getStatus();
    return {
      runtime: 'srs-backend-worker',
      initialized: status.initialized,
      dbFile: status.dbFile,
    };
  }
}
