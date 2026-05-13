import type { CardTypeFilter } from '../types';
import { getAvailableCardTypeFilters } from '../types';
import {
  isNeuralBrowserQueue,
  normalizeBrowserQueueId as normalizeSharedBrowserQueueId,
} from '@/types/browser-queue-identity';

const FALLBACK_CARD_TYPE: CardTypeFilter = 'all';
const NEURAL_DEFAULT_CARD_TYPE: CardTypeFilter = 'concept-only';

type QueueIdLike = string | null | undefined;

export interface QueueCardTypeTransitionInput {
  fromQueueId: QueueIdLike;
  toQueueId: QueueIdLike;
  currentCardType: CardTypeFilter;
  previousNonNeuralCardType: CardTypeFilter | null;
}

export interface QueueCardTypeTransitionResult {
  nextCardType: CardTypeFilter;
  nextPreviousNonNeuralCardType: CardTypeFilter | null;
}

export function normalizeBrowserQueueId(queueId: QueueIdLike): string | null {
  return normalizeSharedBrowserQueueId(queueId);
}

function isNeuralCardType(cardType: CardTypeFilter): boolean {
  return cardType === 'concept-only';
}

export function isNeuralQueueId(queueId: QueueIdLike): boolean {
  return isNeuralBrowserQueue(queueId);
}

export function normalizeCardTypeForQueue(
  queueId: QueueIdLike,
  cardType: CardTypeFilter,
  fallback: CardTypeFilter = FALLBACK_CARD_TYPE,
): CardTypeFilter {
  const normalizedQueueId = normalizeBrowserQueueId(queueId);
  const allowed = new Set(
    getAvailableCardTypeFilters(normalizedQueueId).map((option) => option.value),
  );

  return allowed.has(cardType) ? cardType : fallback;
}

export function resolveQueueCardTypeOnSwitch(
  input: QueueCardTypeTransitionInput,
): QueueCardTypeTransitionResult {
  const fromNeural = isNeuralQueueId(input.fromQueueId);
  const toNeural = isNeuralQueueId(input.toQueueId);

  if (!fromNeural && toNeural) {
    return {
      nextCardType: NEURAL_DEFAULT_CARD_TYPE,
      nextPreviousNonNeuralCardType: normalizeCardTypeForQueue(
        input.fromQueueId,
        input.currentCardType,
        FALLBACK_CARD_TYPE,
      ),
    };
  }

  if (fromNeural && !toNeural) {
    const restoreCandidate = input.previousNonNeuralCardType ?? FALLBACK_CARD_TYPE;
    return {
      nextCardType: normalizeCardTypeForQueue(
        input.toQueueId,
        restoreCandidate,
        FALLBACK_CARD_TYPE,
      ),
      nextPreviousNonNeuralCardType: input.previousNonNeuralCardType,
    };
  }

  if (fromNeural && toNeural) {
    return {
      nextCardType: isNeuralCardType(input.currentCardType)
        ? input.currentCardType
        : NEURAL_DEFAULT_CARD_TYPE,
      nextPreviousNonNeuralCardType: input.previousNonNeuralCardType,
    };
  }

  return {
    nextCardType: normalizeCardTypeForQueue(
      input.toQueueId,
      input.currentCardType,
      FALLBACK_CARD_TYPE,
    ),
    nextPreviousNonNeuralCardType: input.previousNonNeuralCardType,
  };
}
