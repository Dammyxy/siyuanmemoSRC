import type { ReviewUIState } from './types';

type ReviewCardMeta = ReviewUIState['actions']['cardMeta'] | null | undefined;

export function isTopicLikeCard(cardMeta: ReviewCardMeta): boolean {
  return cardMeta?.type === 'topic'
    || cardMeta?.cardType === 'topic'
    || cardMeta?.type === 'concept'
    || cardMeta?.cardType === 'concept';
}
