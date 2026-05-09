export function formatUnknownDependencyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDependencyUnavailableError(
  code: string,
  operation: string,
  error: unknown,
): Error {
  const unavailable = new Error(`${code}: ${operation}: ${formatUnknownDependencyError(error)}`);
  (unavailable as Error & { cause?: unknown }).cause = error;
  return unavailable;
}
