import type {
  BackendRpcHandlerAdapter,
  PrivateApiAuditQueryRequest,
  PrivateApiAuditQueryResult,
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_PRIVATE_API_RPC_METHODS,
  type BackendPrivateApiRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import {
  applyBrowserSourceExistenceSweepHostWithChanges,
  type BackendBrowserRpcRuntime,
} from './BackendBrowserRpcAdapter';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendPrivateApiDatabase {
  queryDeckPage(
    query: Record<string, unknown>,
    page: { readonly startRow?: number; readonly endRow?: number },
  ): Promise<{ readonly cards?: unknown[] } | null> | { readonly cards?: unknown[] } | null;
  getStatus(): {
    readonly ingest: unknown;
  };
}

export interface BackendPrivateApiRpcRuntime {
  auditEventCount(): number;
  queryAudit(request: PrivateApiAuditQueryRequest | null): PrivateApiAuditQueryResult;
  read(method: PrivateApiReadRequest['method'], request: PrivateApiReadRequest | null): Promise<PrivateApiReadResult> | PrivateApiReadResult;
  command(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> | PrivateApiMutationResult;
}

export interface BackendPrivateApiRpcHandlerContext extends BackendRpcHandlerContext {
  readonly privateApi: BackendPrivateApiRpcRuntime;
}

export type BackendPrivateApiRpcHandlerRegistration = BackendRpcHandlerRegistration<BackendPrivateApiRpcHandlerContext>;

type PrivateApiAuditStatus = 'accepted' | 'completed' | 'rejected' | 'failed';

export class BackendPrivateApiRuntime implements BackendPrivateApiRpcRuntime {
  private readonly auditTrail: Array<{
    requestId: string;
    method: string;
    callerIntent: string;
    status: PrivateApiAuditStatus;
    timestamp: number;
  }> = [];
  private readonly commandResultsByIdempotencyKey = new Map<string, PrivateApiMutationResult>();
  private readonly now: () => number;

  constructor(
    private readonly deps: {
      readonly database: BackendPrivateApiDatabase;
      readonly browser: BackendBrowserRpcRuntime;
      readonly maxAuditEvents?: number;
      readonly now?: () => number;
    },
  ) {
    this.now = deps.now ?? Date.now;
  }

  auditEventCount(): number {
    return this.auditTrail.length;
  }

  queryAudit(request: PrivateApiAuditQueryRequest | null): PrivateApiAuditQueryResult {
    const limit = Math.max(1, Math.floor(Number(request?.limit ?? 20)));
    const rows = this.auditTrail.slice(-limit).reverse();
    return {
      ok: true,
      data: rows,
      diagnosticEventId: `private-audit:${this.now()}`,
      auditStatus: 'recorded',
    };
  }

  async read(
    method: PrivateApiReadRequest['method'],
    request: PrivateApiReadRequest | null,
  ): Promise<PrivateApiReadResult> {
    const requestId = normalizeString(request?.requestId) || `private-read:${this.now()}`;
    const callerIntent = normalizeString(request?.callerIntent) || 'unknown';
    const limit = Math.max(1, Math.floor(Number(request?.limit ?? 20)));
    this.recordAudit({
      requestId,
      method,
      callerIntent,
      status: 'accepted',
    });

    let data: unknown;
    if (method === 'private.read.cards') {
      const page = await this.deps.database.queryDeckPage({}, { startRow: 0, endRow: limit });
      data = page?.cards ?? [];
    } else if (method === 'private.read.queues') {
      data = {
        ingest: this.deps.database.getStatus().ingest,
      };
    } else {
      data = [];
    }

    this.recordAudit({
      requestId,
      method,
      callerIntent,
      status: 'completed',
    });
    return {
      ok: true,
      data,
      diagnosticEventId: `private-read:${requestId}`,
      auditStatus: 'recorded',
    };
  }

  async command(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    const requestId = normalizeString(request.requestId);
    const callerIntent = normalizeString(request.callerIntent);
    const idempotencyKey = normalizeString(request.idempotencyKey);
    if (!requestId || !callerIntent || !idempotencyKey) {
      throw new Error('INVALID_REQUEST: private.command.execute requires requestId/callerIntent/idempotencyKey');
    }
    if (!isAuthorizedPrivateMutationCapability(request.capabilityResult)) {
      throw new Error('INVALID_REQUEST: private.command.execute requires authorized private API capability');
    }

    const cached = this.commandResultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      this.recordAudit({
        requestId,
        method: 'private.command.execute',
        callerIntent,
        status: 'completed',
      });
      return cached;
    }

    this.recordAudit({
      requestId,
      method: 'private.command.execute',
      callerIntent,
      status: 'accepted',
    });
    const commandParams = request.params && typeof request.params === 'object'
      ? request.params
      : {};
    const operation = normalizeString(commandParams.operation);
    if (operation !== 'browser.sourceExistence.applySweepHost') {
      throw new Error(`INVALID_REQUEST: unsupported private.command.execute operation: ${operation || '<missing>'}`);
    }
    const applied = await applyBrowserSourceExistenceSweepHostWithChanges({
      request: commandParams.request,
      checkedAt: commandParams.checkedAt,
    }, this.deps.browser);
    const result = {
      ok: true,
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: applied.changedBlockIds.length > 0
        ? { blockIds: applied.changedBlockIds }
        : {},
      result: {
        operation,
        idempotencyKey,
        committed: true,
        sweep: applied.result,
      },
      auditStatus: 'recorded',
      diagnosticEventId: `private-command:${requestId}`,
    } as PrivateApiMutationResult;
    this.commandResultsByIdempotencyKey.set(idempotencyKey, result);
    this.recordAudit({
      requestId,
      method: 'private.command.execute',
      callerIntent,
      status: 'completed',
    });
    return result;
  }

  private recordAudit(input: {
    requestId: string;
    method: string;
    callerIntent: string;
    status: PrivateApiAuditStatus;
  }): void {
    this.auditTrail.push({
      requestId: input.requestId,
      method: input.method,
      callerIntent: input.callerIntent,
      status: input.status,
      timestamp: this.now(),
    });
    const maxAuditEvents = this.deps.maxAuditEvents ?? 500;
    if (this.auditTrail.length > maxAuditEvents) {
      this.auditTrail.splice(0, this.auditTrail.length - maxAuditEvents);
    }
  }
}

const BACKEND_PRIVATE_API_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendPrivateApiRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendPrivateApiRpcHandlerContext
  >;
} = {
  'private.audit.query': {
    method: 'private.audit.query',
    family: 'private-api',
    handle(params, context): PrivateApiAuditQueryResult {
      return context.privateApi.queryAudit(readNamedParams<PrivateApiAuditQueryRequest>(params));
    },
  },
  'private.read.cards': {
    method: 'private.read.cards',
    family: 'private-api',
    handle(params, context): Promise<PrivateApiReadResult> | PrivateApiReadResult {
      return context.privateApi.read('private.read.cards', readNamedParams<PrivateApiReadRequest>(params));
    },
  },
  'private.read.queues': {
    method: 'private.read.queues',
    family: 'private-api',
    handle(params, context): Promise<PrivateApiReadResult> | PrivateApiReadResult {
      return context.privateApi.read('private.read.queues', readNamedParams<PrivateApiReadRequest>(params));
    },
  },
  'private.read.sessions': {
    method: 'private.read.sessions',
    family: 'private-api',
    handle(params, context): Promise<PrivateApiReadResult> | PrivateApiReadResult {
      return context.privateApi.read('private.read.sessions', readNamedParams<PrivateApiReadRequest>(params));
    },
  },
  'private.command.execute': {
    method: 'private.command.execute',
    family: 'private-api',
    handle(params, context): Promise<PrivateApiMutationResult> | PrivateApiMutationResult {
      return context.privateApi.command(
        readRequiredNamedParams(params, 'private.command.execute requires named params'),
      );
    },
  },
};

export const BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS: readonly BackendPrivateApiRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_PRIVATE_API_RPC_METHODS.map((method) => ({
      ...BACKEND_PRIVATE_API_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendPrivateApiRpcAdapter',
    })),
  );

function isAuthorizedPrivateMutationCapability(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const capability = value as {
    available?: unknown;
    methodAllowed?: unknown;
    backendWorkerAvailable?: unknown;
    writerAvailable?: unknown;
  };
  return capability.available === true
    && capability.methodAllowed === true
    && capability.backendWorkerAvailable === true
    && capability.writerAvailable === true;
}

function readNamedParams<TParams extends object>(params: unknown): TParams | null {
  if (!params) {
    return null;
  }
  if (Array.isArray(params)) {
    const [first] = params;
    if (!first || typeof first !== 'object') {
      return null;
    }
    return first as TParams;
  }
  if (typeof params === 'object') {
    return params as TParams;
  }
  return null;
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return named;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}
