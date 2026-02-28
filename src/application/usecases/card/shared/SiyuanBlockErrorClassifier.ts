export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || '');
}

export function isIgnorableMissingBlockError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('tree not found')
    || message.includes('not found entity')
    || message.includes('block not found');
}
