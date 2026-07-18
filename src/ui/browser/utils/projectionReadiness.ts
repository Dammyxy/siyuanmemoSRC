import type {
  FetchRowsOptions,
  FetchRowsResult,
  ICardDataSource,
} from '../datasource/types';
const PROJECTION_NOT_READY_CODE = 'QUEUE_PROJECTION_NOT_READY';
const PROJECTION_NOT_READY_RETRY_DELAYS_MS = [150, 300, 600, 1200] as const;

export function isQueueProjectionNotReadyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === PROJECTION_NOT_READY_CODE) {
    return true;
  }
  return typeof candidate.message === 'string'
    && candidate.message.startsWith(`${PROJECTION_NOT_READY_CODE}:`);
}

function isTransientProjectionReadinessError(error: unknown): boolean {
  return isQueueProjectionNotReadyError(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchRowsWithProjectionReadinessRetry(
  dataSource: ICardDataSource,
  options: FetchRowsOptions,
  shouldContinue: () => boolean,
): Promise<FetchRowsResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await dataSource.fetchRows(options);
    } catch (error) {
      const retryDelay = PROJECTION_NOT_READY_RETRY_DELAYS_MS[attempt];
      if (!isTransientProjectionReadinessError(error) || retryDelay == null || !shouldContinue()) {
        throw error;
      }
      await delay(retryDelay);
    }
  }
}
