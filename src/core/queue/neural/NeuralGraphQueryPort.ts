import type {
  BackendNeuralGraphQueryOperation,
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
} from '../../../../packages/contracts/src/backend-rpc';

export type NeuralGraphQueryOperation = BackendNeuralGraphQueryOperation;
export type NeuralGraphQueryRequest = BackendNeuralGraphQueryRequest;
export type NeuralGraphQueryResult<TData = unknown> = BackendNeuralGraphQueryResult<TData>;

export interface NeuralGraphQueryPort {
  query<TData = unknown>(request: NeuralGraphQueryRequest): Promise<NeuralGraphQueryResult<TData>>;
}

export async function resolveNeuralGraphQuery<TData>(
  port: NeuralGraphQueryPort | undefined,
  request: NeuralGraphQueryRequest,
): Promise<NeuralGraphQueryResult<TData> | null> {
  if (!port) {
    return null;
  }
  return port.query<TData>(request);
}

export function neuralGraphQueryFailed(result: NeuralGraphQueryResult<unknown>): Error {
  return new Error(result.error || `Neural graph query failed: ${result.blockId}`);
}
