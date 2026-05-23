import type {
  ReviewSessionActionError,
  ReviewSessionRetryAction,
} from './reviewSessionController';
import {
  resolveReviewWriterUnavailableRecovery,
  type ReviewWriterUnavailableRecoveryInput,
  type ReviewWriterUnavailableRecoveryNotice,
} from './reviewWriterUnavailableRecovery';

export type ReviewWriterRecoveryAction = ReviewSessionRetryAction;

type ReviewWriterRecoveryToastType = 'warning' | 'error' | 'info';

export type ReviewWriterRecoveryRuntimeDeps = {
  t: NonNullable<ReviewWriterUnavailableRecoveryInput['t']>;
  getAction: () => ReviewWriterRecoveryAction | null;
  setAction: (action: ReviewWriterRecoveryAction | null) => void;
  setNotice: (notice: ReviewWriterUnavailableRecoveryNotice | null) => void;
  notifyReviewMessage: (message: string, timeout?: number, type?: ReviewWriterRecoveryToastType) => void;
  grade: (rating: number) => Promise<void> | void;
  skip: () => Promise<void> | void;
  executeCommand: (commandId: string) => Promise<void> | void;
  reload: () => Promise<void> | void;
};

export function createReviewWriterRecoveryRuntime(deps: ReviewWriterRecoveryRuntimeDeps) {
  function showRecovery(input: {
    reason: ReviewWriterUnavailableRecoveryInput['reason'];
    error: unknown;
    action?: ReviewWriterRecoveryAction | null;
  }): boolean {
    const notice = resolveReviewWriterUnavailableRecovery({
      reason: input.reason,
      error: input.error,
      t: deps.t,
    });

    if (notice.kind === 'generic-error') {
      return false;
    }

    deps.setNotice(notice);
    deps.setAction(input.action ?? null);
    deps.notifyReviewMessage(`${notice.title}: ${notice.message}`, 5000, 'warning');
    return true;
  }

  function showActionError(payload: ReviewSessionActionError): boolean {
    return showRecovery({
      reason: payload.reason,
      error: payload.error,
      action: payload.action ?? null,
    });
  }

  function dismiss(): void {
    deps.setNotice(null);
  }

  async function retry(): Promise<void> {
    const action = deps.getAction();
    if (!action) {
      return;
    }

    deps.setNotice(null);
    if (action.type === 'grade') {
      await deps.grade(action.rating);
      return;
    }
    if (action.type === 'skip') {
      await deps.skip();
      return;
    }
    await deps.executeCommand(action.commandId);
  }

  async function reloadSurface(): Promise<void> {
    deps.setNotice(null);
    await deps.reload();
  }

  return {
    dismiss,
    reloadSurface,
    retry,
    showActionError,
    showRecovery,
  };
}
