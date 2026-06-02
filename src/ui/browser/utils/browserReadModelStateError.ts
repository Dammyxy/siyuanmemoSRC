import type { BrowserReadModelReadState } from '@/application/queries/browser/browser-read-model';
import type { BrowserGridRowsLifecycleStatus } from '../BrowserGridFirstRowsLifecycle';

export type BrowserReadModelNonReadyState = Exclude<BrowserReadModelReadState, 'ready'>;

export class BrowserReadModelStateError extends Error {
  readonly browserReadModelState: BrowserReadModelNonReadyState;
  readonly reason: string;

  constructor(state: BrowserReadModelNonReadyState, reason: string) {
    super(`BROWSER_READ_MODEL_${state.toUpperCase()}: ${reason}`);
    this.name = 'BrowserReadModelStateError';
    this.browserReadModelState = state;
    this.reason = reason;
  }
}

export function isBrowserReadModelStateError(error: unknown): error is BrowserReadModelStateError {
  return error instanceof BrowserReadModelStateError
    || (
      Boolean(error)
      && typeof error === 'object'
      && (
        (error as { browserReadModelState?: unknown }).browserReadModelState === 'preparing'
        || (error as { browserReadModelState?: unknown }).browserReadModelState === 'repair-required'
        || (error as { browserReadModelState?: unknown }).browserReadModelState === 'unavailable'
      )
    );
}

export function toBrowserGridRowsLifecycleStatus(
  state: BrowserReadModelNonReadyState,
): BrowserGridRowsLifecycleStatus {
  switch (state) {
    case 'preparing':
      return 'read-model-preparing';
    case 'repair-required':
      return 'read-model-repair-required';
    case 'unavailable':
      return 'read-model-unavailable';
  }
}
