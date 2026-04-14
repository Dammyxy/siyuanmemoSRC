export const REVIEW_SET_PRIORITY_REQUEST_EVENT = 'siyuanmemo:review-set-priority-request';
export const REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT = 'siyuanmemo:review-suspend-current-card-request';
export const REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT = 'siyuanmemo:review-delete-current-card-request';

type ReviewCommandRequestEventName =
  | typeof REVIEW_SET_PRIORITY_REQUEST_EVENT
  | typeof REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT
  | typeof REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT;

export function dispatchReviewCommandRequest(eventName: ReviewCommandRequestEventName): boolean {
  const requestEvent = new CustomEvent(eventName, {
    bubbles: false,
    cancelable: true,
    detail: { source: 'command' },
  });
  window.dispatchEvent(requestEvent);
  return requestEvent.defaultPrevented;
}
