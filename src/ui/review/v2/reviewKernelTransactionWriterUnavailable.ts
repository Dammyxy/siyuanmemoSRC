import type { KernelTransactionWriterUnavailableDetail } from '@/application/handlers/KernelTransactionWriterUnavailableEvent';
import type { ReviewSessionRetryAction } from './reviewSessionController';

export interface RecentKernelTransactionReviewAction {
  sessionId: string;
  action: ReviewSessionRetryAction;
  recordedAt: number;
  expiresAt: number;
}

export function createReviewKernelTransactionWriterActionTracker(
  sessionId: string,
  recentWindowMs: number,
): {
  record: (action: ReviewSessionRetryAction, now?: number) => void;
  getRecentAction: () => RecentKernelTransactionReviewAction | null;
  clear: () => void;
} {
  let recentAction: RecentKernelTransactionReviewAction | null = null;
  const windowMs = Math.max(1_000, Math.floor(recentWindowMs));
  return {
    record(action, now = Date.now()) {
      recentAction = {
        sessionId,
        action,
        recordedAt: now,
        expiresAt: now + windowMs,
      };
    },
    getRecentAction() {
      return recentAction;
    },
    clear() {
      recentAction = null;
    },
  };
}

export function resolveReviewActionForKernelTransactionWriterUnavailable(input: {
  detail: KernelTransactionWriterUnavailableDetail | null;
  currentSessionId: string;
  recentAction: RecentKernelTransactionReviewAction | null;
  now?: number;
}): ReviewSessionRetryAction | null {
  const detail = input.detail;
  if (!detail || detail.method !== 'kernel.transaction.dequeue') {
    return null;
  }
  if (!detail.message.toLowerCase().includes('writer relay timeout')) {
    return null;
  }
  const recentAction = input.recentAction;
  if (!recentAction || recentAction.sessionId !== input.currentSessionId) {
    return null;
  }
  const now = input.now ?? Date.now();
  if (now > recentAction.expiresAt) {
    return null;
  }
  return recentAction.action;
}
