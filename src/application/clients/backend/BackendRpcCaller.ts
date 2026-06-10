import type {
  BackendRpcMethod,
  BackendRpcRequest,
  BackendRpcResponse,
  BackendRpcSuccess,
} from '../../../../packages/contracts/src/backend-rpc';
import { BACKEND_RPC_VERSION } from '../../../../packages/contracts/src/backend-rpc';

export interface SrsBackendTransport {
  request(request: BackendRpcRequest): Promise<BackendRpcResponse>;
}

export class BackendRpcCaller {
  private requestId = 0;

  constructor(private readonly transport: SrsBackendTransport) {}

  async call<TResult>(method: BackendRpcMethod, params?: unknown): Promise<TResult> {
    const request: BackendRpcRequest = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: ++this.requestId,
      method,
      params: params == null ? [] : [params],
    };
    const response = await this.transport.request(request);
    if ('error' in response) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return (response as BackendRpcSuccess<TResult>).result;
  }
}
