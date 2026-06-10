import type {
  PrivateApiAuditQueryRequest,
  PrivateApiAuditQueryResult,
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendPrivateApiClientFacet {
  privateAuditQuery(request: PrivateApiAuditQueryRequest): Promise<PrivateApiAuditQueryResult>;
  privateRead(request: PrivateApiReadRequest): Promise<PrivateApiReadResult>;
  privateCommand(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult>;
}

export class BackendPrivateApiRpcClient implements BackendPrivateApiClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  privateAuditQuery(request: PrivateApiAuditQueryRequest): Promise<PrivateApiAuditQueryResult> {
    return this.rpcCaller.call<PrivateApiAuditQueryResult>('private.audit.query', request);
  }

  privateRead(request: PrivateApiReadRequest): Promise<PrivateApiReadResult> {
    return this.rpcCaller.call<PrivateApiReadResult>(request.method, request);
  }

  privateCommand(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    return this.rpcCaller.call<PrivateApiMutationResult>(request.method, request);
  }
}
