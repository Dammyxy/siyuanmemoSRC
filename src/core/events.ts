export type FsrsReviewMode =
  | 'standard'
  | 'queue'
  | 'block'
  | 'retrieval-practice'
  | 'final-drill'
  | 'filter-group'
  | 'neural-wandering'
  | 'leech';

export type FsrsEventName =
  | 'REVIEW_SESSION_STARTED'
  | 'REVIEW_SESSION_ENDED'
  | 'CARD_RATED'
  | 'CARD_SKIPPED'
  | 'REVOKE_RATING';

export interface FsrsEventBus {
  emit(eventName: FsrsEventName, payload?: any): Promise<void> | void;
}
