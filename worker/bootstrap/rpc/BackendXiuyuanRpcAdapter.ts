import type {
  BackendRpcHandlerAdapter,
  BackendXiuyuanSyncExecuteRequest,
  BackendXiuyuanSyncExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_XIUYUAN_RPC_METHODS, type BackendXiuyuanRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import { WorkerXiuyuanSyncPlanner, type WorkerXiuyuanSyncPlannerDependencies } from '../../xiuyuan/WorkerXiuyuanSyncPlanner';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendXiuyuanRpcRuntime {
  execute(request: BackendXiuyuanSyncExecuteRequest): Promise<BackendXiuyuanSyncExecuteResult> | BackendXiuyuanSyncExecuteResult;
}

export interface BackendXiuyuanRpcHandlerContext extends BackendRpcHandlerContext {
  readonly xiuyuan: BackendXiuyuanRpcRuntime;
}

export type BackendXiuyuanRpcHandlerRegistration = BackendRpcHandlerRegistration<BackendXiuyuanRpcHandlerContext>;

export class BackendXiuyuanSyncRuntime implements BackendXiuyuanRpcRuntime {
  private readonly resultsByIdempotencyKey = new Map<string, BackendXiuyuanSyncExecuteResult>();

  constructor(private readonly deps: WorkerXiuyuanSyncPlannerDependencies) {}

  async execute(request: BackendXiuyuanSyncExecuteRequest): Promise<BackendXiuyuanSyncExecuteResult> {
    const cached = this.resultsByIdempotencyKey.get(request.idempotencyKey);
    if (cached) {
      return cached;
    }
    const planner = new WorkerXiuyuanSyncPlanner(this.deps);
    const result = await planner.execute(request);
    this.resultsByIdempotencyKey.set(request.idempotencyKey, result);
    return result;
  }
}

const BACKEND_XIUYUAN_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendXiuyuanRpcMethod]: BackendRpcHandlerAdapter<unknown, unknown, BackendXiuyuanRpcHandlerContext>;
} = {
  'xiuyuan.sync.execute': {
    method: 'xiuyuan.sync.execute',
    family: 'xiuyuan',
    handle(params, context): Promise<BackendXiuyuanSyncExecuteResult> | BackendXiuyuanSyncExecuteResult {
      return context.xiuyuan.execute(
        readRequiredNamedParams(params, 'xiuyuan.sync.execute requires named params'),
      );
    },
  },
};

export const BACKEND_XIUYUAN_RPC_HANDLER_REGISTRATIONS: readonly BackendXiuyuanRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_XIUYUAN_RPC_METHODS.map((method) => ({
      ...BACKEND_XIUYUAN_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendXiuyuanRpcAdapter',
    })),
  );

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
