import { HIDE_CURRENT_IN_SCOPE_COMMAND_ID } from '@/core/queue/abstraction/customActionIds';
import { BACK_KEYS, resolveRatingByKey, SKIP_KEYS, SPACE_ENTER_KEYS, type ReviewRatingValue } from './reviewHotkeys';

export type ReviewKeyAction =
  | { type: 'grade'; rating: ReviewRatingValue }
  | { type: 'command'; commandId: string }
  | { type: 'reveal' }
  | { type: 'skip' }
  | { type: 'back' }
  | { type: 'none' };

function normalizeKey(value: string): string {
  return value.toLowerCase();
}

export function resolveReviewKeyAction(input: {
  key: string;
  answerShown: boolean;
  isTopicLike: boolean;
  topicLikeAction?: 'grade-good' | 'hide-current-in-scope';
}): ReviewKeyAction {
  const key = normalizeKey(input.key);

  if (SPACE_ENTER_KEYS.has(key)) {
    if (input.isTopicLike && input.topicLikeAction === 'hide-current-in-scope') {
      return {
        type: 'command',
        commandId: HIDE_CURRENT_IN_SCOPE_COMMAND_ID,
      };
    }
    if (input.answerShown || input.isTopicLike) {
      return { type: 'grade', rating: 3 };
    }
    return { type: 'reveal' };
  }

  const rating = resolveRatingByKey(key);
  if (rating != null) {
    if (!input.answerShown) {
      return { type: 'none' };
    }
    return { type: 'grade', rating };
  }

  if (SKIP_KEYS.has(key)) {
    return { type: 'skip' };
  }

  if (BACK_KEYS.has(key)) {
    return { type: 'back' };
  }

  return { type: 'none' };
}
