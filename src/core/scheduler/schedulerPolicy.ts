import { CardType, type FSRSCard } from '@/types/card';

export type SchedulerType = 'fsrs-v6' | 'a-factor-v2';

const PREFERRED_SCHEDULER_BY_CARD_TYPE: Partial<Record<CardType | string, SchedulerType>> = {
  [CardType.Item]: 'fsrs-v6',
  [CardType.Descriptor]: 'fsrs-v6',
  [CardType.Topic]: 'a-factor-v2',
  [CardType.Concept]: 'a-factor-v2',
};

export function getPreferredSchedulerForCardType(cardType?: string): SchedulerType | null {
  if (!cardType) {
    return null;
  }

  return PREFERRED_SCHEDULER_BY_CARD_TYPE[cardType] ?? null;
}

export function resolveStoredSchedulerType(raw: unknown): SchedulerType | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === 'simple-fsrs' || normalized === 'fsrs' || normalized === 'fsrs-v6') {
    return 'fsrs-v6';
  }

  if (normalized === 'a-factor' || normalized === 'a-factor-v2') {
    return 'a-factor-v2';
  }

  return null;
}

export function resolveEffectiveSchedulerTypeForCard(
  card: Pick<FSRSCard, 'id' | 'type' | 'schedulerType'>,
  options: {
    defaultScheduler?: SchedulerType;
    schedulerOverrides?: Map<string, SchedulerType>;
    strict?: boolean;
  } = {},
): SchedulerType {
  const storedScheduler = resolveStoredSchedulerType(card.schedulerType);
  const preferredScheduler = getPreferredSchedulerForCardType(card.type);
  if (preferredScheduler) {
    return preferredScheduler;
  }

  const override = options.schedulerOverrides?.get(card.id);
  if (override) {
    return override;
  }

  if (storedScheduler) {
    return storedScheduler;
  }

  return options.defaultScheduler ?? 'fsrs-v6';
}

export function isFsrsReviewCardType(cardType?: string): boolean {
  return getPreferredSchedulerForCardType(cardType) === 'fsrs-v6';
}
