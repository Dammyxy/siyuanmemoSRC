import type {
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendSemanticClientFacet {
  semanticCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult>;
  semanticSessionRead(request: BackendSemanticSessionReadRequest): Promise<BackendSemanticSessionReadResult>;
  semanticSidebarRead(request: BackendSemanticSidebarReadRequest): Promise<BackendSemanticSidebarReadResult>;
  semanticBrowserRead(request: BackendSemanticBrowserReadRequest): Promise<BackendSemanticBrowserReadResult>;
}

export class BackendSemanticRpcClient implements BackendSemanticClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  semanticCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    return this.rpcCaller.call<BackendSemanticCommandResult>(request.method, request);
  }

  semanticSessionRead(request: BackendSemanticSessionReadRequest): Promise<BackendSemanticSessionReadResult> {
    return this.rpcCaller.call<BackendSemanticSessionReadResult>(request.method, request);
  }

  semanticSidebarRead(request: BackendSemanticSidebarReadRequest): Promise<BackendSemanticSidebarReadResult> {
    return this.rpcCaller.call<BackendSemanticSidebarReadResult>(request.method, request);
  }

  semanticBrowserRead(request: BackendSemanticBrowserReadRequest): Promise<BackendSemanticBrowserReadResult> {
    return this.rpcCaller.call<BackendSemanticBrowserReadResult>(request.method, request);
  }
}
