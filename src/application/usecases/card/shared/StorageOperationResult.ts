type StorageOperationResult = {
  ok?: unknown;
  error?: unknown;
};

function isStorageOperationResult(value: unknown): value is StorageOperationResult {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

export function throwOnFailedStorageOperation(result: unknown, defaultMessage: string): void {
  if (!isStorageOperationResult(result) || result.ok !== false) {
    return;
  }

  const operationError = result.error;
  if (operationError instanceof Error) {
    throw operationError;
  }

  throw new Error(defaultMessage);
}
