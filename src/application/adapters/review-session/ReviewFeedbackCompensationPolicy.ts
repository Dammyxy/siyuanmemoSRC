export type ReviewFeedbackCompensationAction =
  | 'discard-failed-history-entry'
  | 'restore-queue-rollback-snapshots'
  | 'restore-card-snapshot'
  | 'restore-session-exclusions'
  | 'restore-current-item'
  | 'reset-volatile-advance-state'
  | 'invalidate-cache';

export interface ReviewFeedbackCompensationInput {
  hasFailedHistoryEntry: boolean;
  hasTransaction: boolean;
  hasCardSnapshot: boolean;
}

export class ReviewFeedbackCompensationPolicy {
  plan(input: ReviewFeedbackCompensationInput): ReviewFeedbackCompensationAction[] {
    const actions: ReviewFeedbackCompensationAction[] = [];
    if (input.hasFailedHistoryEntry) {
      actions.push('discard-failed-history-entry');
    }
    if (input.hasTransaction) {
      actions.push('restore-queue-rollback-snapshots');
      if (input.hasCardSnapshot) {
        actions.push('restore-card-snapshot');
      }
      actions.push('restore-session-exclusions');
    }
    actions.push('reset-volatile-advance-state');
    actions.push('restore-current-item');
    actions.push('invalidate-cache');
    return actions;
  }
}
