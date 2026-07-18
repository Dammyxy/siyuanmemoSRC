import type {
  BackendDbLoadResult,
  BackendDbLoadRequest,
  BackendDbReloadResult,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendPrivateDiagnosticsStatusResult,
  BackendPrivateHealthResult,
  BackendStorageMaintenanceApplyBatchRequest,
  BackendStorageMaintenanceApplyBatchResult,
  BackendStoragePressureRecoveryRequest,
  BackendStoragePressureRecoveryResult,
  BackendStorageMaintenanceStatusRequest,
  BackendStorageMaintenanceStatusResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_CORE_RPC_METHODS, type BackendCoreRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendCoreRpcDatabase {
  getStatus(): { initialized: boolean };
  load(request?: BackendDbLoadRequest): Promise<BackendDbLoadResult> | BackendDbLoadResult;
  reloadFromDisk(request?: BackendDbLoadRequest): Promise<BackendDbReloadResult>;
  getStorageMaintenanceStatus(
    request: BackendStorageMaintenanceStatusRequest,
  ): Promise<BackendStorageMaintenanceStatusResult>;
  applyStorageMaintenanceBatch(
    request: BackendStorageMaintenanceApplyBatchRequest,
  ): Promise<BackendStorageMaintenanceApplyBatchResult>;
  recoverLegacyDeltaStoragePressure(
    request?: BackendStoragePressureRecoveryRequest,
  ): Promise<BackendStoragePressureRecoveryResult>;
}

export interface BackendCoreRpcRuntime {
  readonly database: BackendCoreRpcDatabase;
  readDiagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> | BackendDiagnosticsStatusResult;
  getPrivateAuditEventCount(): number;
  onDatabaseReadinessClassified?(readiness: BackendDbLoadResult['readiness']): Promise<void>;
}

export interface BackendCoreRpcHandlerContext extends BackendRpcHandlerContext {
  readonly core: BackendCoreRpcRuntime;
}

export type BackendCoreRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendCoreRpcHandlerContext
>;

const BACKEND_CORE_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendCoreRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendCoreRpcHandlerContext
  >;
} = {
  'system.health': {
    method: 'system.health',
    family: 'core',
    handle(_params, context): BackendHealthResult {
      return {
        ok: true,
        runtime: 'srs-backend-worker',
        initialized: context.core.database.getStatus().initialized,
      };
    },
  },
  'db.load': {
    method: 'db.load',
    family: 'core',
    async handle(params, context): Promise<BackendDbLoadResult> {
      const result = await context.core.database.load(readDbLoadRequest(params, 'db.load'));
      await context.core.onDatabaseReadinessClassified?.(result.readiness);
      return result;
    },
  },
  'db.reload': {
    method: 'db.reload',
    family: 'core',
    async handle(params, context): Promise<BackendDbReloadResult> {
      const result = await context.core.database.reloadFromDisk(readDbLoadRequest(params, 'db.reload'));
      await context.core.onDatabaseReadinessClassified?.(result.readiness);
      return result;
    },
  },
  'storage.maintenance.status': {
    method: 'storage.maintenance.status',
    family: 'core',
    handle(params, context): Promise<BackendStorageMaintenanceStatusResult> {
      return context.core.database.getStorageMaintenanceStatus(
        readRequiredNamedParams<BackendStorageMaintenanceStatusRequest>(
          params,
          'storage.maintenance.status requires named params',
        ),
      );
    },
  },
  'storage.maintenance.applyBatch': {
    method: 'storage.maintenance.applyBatch',
    family: 'core',
    handle(params, context): Promise<BackendStorageMaintenanceApplyBatchResult> {
      return context.core.database.applyStorageMaintenanceBatch(
        readRequiredNamedParams<BackendStorageMaintenanceApplyBatchRequest>(
          params,
          'storage.maintenance.applyBatch requires named params',
        ),
      );
    },
  },
  'storage.pressure.recover': {
    method: 'storage.pressure.recover',
    family: 'core',
    handle(params, context): Promise<BackendStoragePressureRecoveryResult> {
      return context.core.database.recoverLegacyDeltaStoragePressure(
        readOptionalNamedParams<BackendStoragePressureRecoveryRequest>(
          params,
          'storage.pressure.recover request must be an object',
        ),
      );
    },
  },
  'diagnostics.status': {
    method: 'diagnostics.status',
    family: 'core',
    handle(_params, context): Promise<BackendDiagnosticsStatusResult> | BackendDiagnosticsStatusResult {
      return context.core.readDiagnosticsStatus();
    },
  },
  'private.health': {
    method: 'private.health',
    family: 'core',
    handle(): BackendPrivateHealthResult {
      return {
        ok: true,
        runtime: 'srs-backend-worker',
        feature: 'private-api',
      };
    },
  },
  'private.diagnostics.status': {
    method: 'private.diagnostics.status',
    family: 'core',
    async handle(_params, context): Promise<BackendPrivateDiagnosticsStatusResult> {
      return {
        ok: true,
        runtime: 'srs-backend-worker',
        status: await context.core.readDiagnosticsStatus(),
        auditEvents: context.core.getPrivateAuditEventCount(),
      };
    },
  },
};

function readDbLoadRequest(
  params: unknown,
  method: 'db.load' | 'db.reload',
): BackendDbLoadRequest | undefined {
  if (Array.isArray(params) && params.length === 0) {
    return undefined;
  }
  if (!Array.isArray(params) || params.length !== 1) {
    throw new Error(`INVALID_REQUEST: ${method} expects positional [request] params`);
  }
  const candidate = params[0];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`INVALID_REQUEST: ${method} request must be an object`);
  }
  const request = candidate as Record<string, unknown>;
  assertOptionalStartupIdentityDisposition(request.startupIdentityDisposition, method);
  assertOptionalStringField(request, 'truthDeviceId', method);
  assertOptionalStringField(request, 'identityEpoch', method);
  assertOptionalStringField(request, 'cardTruthGenerationId', method);
  assertOptionalStringField(request, 'reviewTruthGenerationId', method);
  assertOptionalNumberField(request, 'truthSchemaVersion', method);
  assertOptionalNumberField(request, 'maxSegmentBytes', method);
  return candidate as BackendDbLoadRequest;
}

function assertOptionalStartupIdentityDisposition(
  value: unknown,
  method: 'db.load' | 'db.reload',
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition must be an object or null`);
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition.version must be 1`);
  }
  if (
    candidate.status !== 'verified'
    && candidate.status !== 'read-only-recovery-required'
    && candidate.status !== 'read-only-authority-unavailable'
  ) {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition.status is invalid`);
  }
  if (typeof candidate.writable !== 'boolean' || typeof candidate.retryable !== 'boolean') {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition writable/retryable flags must be boolean`);
  }
  if (
    candidate.deviceId !== null
    && candidate.deviceId !== undefined
    && typeof candidate.deviceId !== 'string'
  ) {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition.deviceId must be string or null`);
  }
  if (
    candidate.identityEpoch !== null
    && candidate.identityEpoch !== undefined
    && typeof candidate.identityEpoch !== 'string'
  ) {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition.identityEpoch must be string or null`);
  }
  if (typeof candidate.source !== 'string') {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition.source must be string`);
  }
  if (
    candidate.reason !== null
    && candidate.reason !== undefined
    && typeof candidate.reason !== 'string'
  ) {
    throw new Error(`INVALID_REQUEST: ${method} request.startupIdentityDisposition.reason must be string or null`);
  }
}

function assertOptionalStringField(
  request: Record<string, unknown>,
  field: keyof BackendDbLoadRequest,
  method: 'db.load' | 'db.reload',
): void {
  const value = request[field];
  if (value === undefined || value === null || typeof value === 'string') {
    return;
  }
  throw new Error(`INVALID_REQUEST: ${method} request.${field} must be string or null`);
}

function assertOptionalNumberField(
  request: Record<string, unknown>,
  field: keyof BackendDbLoadRequest,
  method: 'db.load' | 'db.reload',
): void {
  const value = request[field];
  if (value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value))) {
    return;
  }
  throw new Error(`INVALID_REQUEST: ${method} request.${field} must be finite number or null`);
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const candidate = Array.isArray(params) ? params[0] : params;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return candidate as TParams;
}

function readOptionalNamedParams<TParams extends object>(params: unknown, message: string): TParams | undefined {
  if (params === undefined || (Array.isArray(params) && params.length === 0)) {
    return undefined;
  }
  const candidate = Array.isArray(params) ? params[0] : params;
  if (candidate === undefined || candidate === null) {
    return undefined;
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return candidate as TParams;
}

export const BACKEND_CORE_RPC_HANDLER_REGISTRATIONS: readonly BackendCoreRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_CORE_RPC_METHODS.map((method) => ({
      ...BACKEND_CORE_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendCoreRpcAdapter',
    })),
  );
