import type {
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_AUTOCARD_RPC_METHODS, type BackendAutoCardRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendAutoCardRpcDatabase {
  resolveAutoCardDecision(
    request: BackendAutoCardDecisionResolveRequest,
  ): Promise<BackendAutoCardDecisionResolveResult> | BackendAutoCardDecisionResolveResult;
  recordAutoCardExecuteOutcome(input: {
    status: 'created' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
    created?: number;
    skipped?: number;
  }): void;
}

export interface BackendAutoCardRpcRuntime {
  readonly database: BackendAutoCardRpcDatabase;
  executeAutoCard?(
    request: BackendAutoCardExecuteRequest,
  ): Promise<BackendAutoCardExecuteResult> | BackendAutoCardExecuteResult;
}

export interface BackendAutoCardRpcHandlerContext extends BackendRpcHandlerContext {
  readonly autoCard: BackendAutoCardRpcRuntime;
}

export type BackendAutoCardRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendAutoCardRpcHandlerContext
>;

const BACKEND_AUTOCARD_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendAutoCardRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendAutoCardRpcHandlerContext
  >;
} = {
  'autocard.decision.resolve': {
    method: 'autocard.decision.resolve',
    family: 'autocard',
    handle(params, context): Promise<BackendAutoCardDecisionResolveResult> | BackendAutoCardDecisionResolveResult {
      return context.autoCard.database.resolveAutoCardDecision(
        readRequiredNamedParams<BackendAutoCardDecisionResolveRequest>(
          params,
          'autocard.decision.resolve requires named params',
        ),
      );
    },
  },
  'autocard.execute': {
    method: 'autocard.execute',
    family: 'autocard',
    async handle(params, context): Promise<BackendAutoCardExecuteResult> {
      const named = readRequiredNamedParams<BackendAutoCardExecuteRequest>(
        params,
        'autocard.execute requires named params with envelope',
      );
      if (!named.envelope || typeof named.envelope !== 'object') {
        throw new Error('INVALID_REQUEST: autocard.execute requires named params with envelope');
      }
      if (typeof context.autoCard.executeAutoCard !== 'function') {
        context.autoCard.database.recordAutoCardExecuteOutcome({
          status: 'unavailable',
        });
        throw new Error('SrsBackendWorker autocard.execute unavailable: execute callback is not configured');
      }
      try {
        const result = await context.autoCard.executeAutoCard(named);
        context.autoCard.database.recordAutoCardExecuteOutcome({
          status: result.executed ? 'created' : result.skipped > 0 ? 'skipped' : 'no-op',
          created: result.created,
          skipped: result.skipped,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        context.autoCard.database.recordAutoCardExecuteOutcome({
          status: message.startsWith('BACKEND_UNAVAILABLE:') ? 'unavailable' : 'failed',
        });
        throw error;
      }
    },
  },
};

export const BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS: readonly BackendAutoCardRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_AUTOCARD_RPC_METHODS.map((method) => ({
      ...BACKEND_AUTOCARD_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendAutoCardRpcAdapter',
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
