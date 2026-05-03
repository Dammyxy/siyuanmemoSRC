const KERNEL_TRANSACTION_DEQUEUE_METHOD = 'kernel.transaction.dequeue';

export function shouldLogRelayCommandSubmitted(method: string): boolean {
  return method !== KERNEL_TRANSACTION_DEQUEUE_METHOD;
}

export function getRelayCompletionExtraDiagnostics(
  method: string,
  result: unknown,
): Record<string, unknown> | null {
  if (method !== KERNEL_TRANSACTION_DEQUEUE_METHOD) {
    return {};
  }
  const dequeue = readKernelTransactionDequeueResult(result);
  if (dequeue && dequeue.actionCount === 0) {
    return null;
  }
  return dequeue ? { ...dequeue } : {};
}

function readKernelTransactionDequeueResult(
  result: unknown,
): { actionCount: number; remaining?: number } | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const record = result as { actions?: unknown; remaining?: unknown };
  if (!Array.isArray(record.actions)) {
    return null;
  }
  return {
    actionCount: record.actions.length,
    ...(typeof record.remaining === 'number' ? { remaining: record.remaining } : {}),
  };
}
