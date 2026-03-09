import { CardState, type FSRSCard } from '@/types/card';

type DismissStateOptions = {
  touchUpdatedAt?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnProperty(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function hasExplicitDismissedMeta(card: FSRSCard): boolean {
  return isRecord(card.meta) && hasOwnProperty(card.meta, 'suspended');
}

export function isCardDismissed(card: FSRSCard): boolean {
  if (card.state === CardState.Suspended) {
    return true;
  }

  if (!isRecord(card.meta)) {
    return false;
  }

  return card.meta.suspended === true;
}

export function applyDismissState(
  card: FSRSCard,
  dismissed: boolean,
  options: DismissStateOptions = {},
): FSRSCard {
  const nextMeta = isRecord(card.meta) ? { ...card.meta } : {};
  if (dismissed) {
    nextMeta.suspended = true;
  } else {
    delete nextMeta.suspended;
  }

  const nextCard: FSRSCard = {
    ...card,
    meta: nextMeta,
  };

  if (options.touchUpdatedAt !== false) {
    nextCard.updatedAt = Date.now();
  }

  return nextCard;
}
