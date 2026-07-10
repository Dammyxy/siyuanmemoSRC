export type BoundCallback<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult;

export interface BindOnceCallbackPort<TArgs extends unknown[], TResult> {
  bind(callback: BoundCallback<TArgs, TResult>): void;
  invoke(...args: TArgs): TResult;
  isBound(): boolean;
  dispose(): void;
}

export function createBindOnceCallbackPort<TArgs extends unknown[], TResult>(
  name: string,
): BindOnceCallbackPort<TArgs, TResult> {
  let callback: BoundCallback<TArgs, TResult> | null = null;
  let disposed = false;

  return {
    bind(nextCallback) {
      if (disposed) {
        throw new Error(`RUNTIME_ACCESS_DISPOSED: ${name} callback port is disposed`);
      }
      if (callback) {
        throw new Error(`RUNTIME_ACCESS_ALREADY_BOUND: ${name} callback is already bound`);
      }
      callback = nextCallback;
    },
    invoke(...args) {
      if (disposed) {
        throw new Error(`RUNTIME_ACCESS_DISPOSED: ${name} callback port is disposed`);
      }
      if (!callback) {
        throw new Error(`RUNTIME_ACCESS_UNAVAILABLE: ${name} callback is not bound`);
      }
      return callback(...args);
    },
    isBound() {
      return callback !== null && !disposed;
    },
    dispose() {
      callback = null;
      disposed = true;
    },
  };
}
