import { BACKEND_RPC_VERSION, type BackendRpcRequest } from '../packages/contracts/src/backend-rpc';
import { BackendKernel } from './bootstrap/BackendKernel';

const kernel = BackendKernel.createWithoutBridge();

function isBackendRpcRequest(value: unknown): value is BackendRpcRequest {
  return typeof value === 'object'
    && value !== null
    && (value as BackendRpcRequest).jsonrpc === BACKEND_RPC_VERSION
    && typeof (value as BackendRpcRequest).method === 'string'
    && (typeof (value as BackendRpcRequest).id === 'number' || typeof (value as BackendRpcRequest).id === 'string');
}

async function handleMessage(event: MessageEvent<unknown>): Promise<void> {
  const payload = event.data;
  if (!isBackendRpcRequest(payload)) {
    return;
  }

  const response = await kernel.handle(payload);
  self.postMessage(response);
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event) => {
    void handleMessage(event);
  });
}

export { BackendKernel };
