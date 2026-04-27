import { CardState, CardType, type FSRSCard } from '@/types/card';

const DEFAULT_PRIORITY = 50;

export interface SrsV2QueuePolicyOptions {
  now: number;
  dayEnd: number;
  newCardsPerDay: number;
  reviewsPerDay: number;
  priorityRandomness: number;
  stableSalt: string;
}

export interface SrsV2QueueBuildInput extends SrsV2QueuePolicyOptions {
  baseCards: FSRSCard[];
  manualCards: FSRSCard[];
  isBlacklisted: (card: FSRSCard) => boolean;
  isDismissed: (card: FSRSCard) => boolean;
  warnInvalidBlockId?: (cards: FSRSCard[]) => void;
}

export class SrsV2QueuePolicy {
  static buildRetrievalPracticeQueue(input: SrsV2QueueBuildInput): FSRSCard[] {
    const { baseCards, manualCards, warnInvalidBlockId } = input;
    const filteredBase = filterVisible(baseCards, input);
    const existingIds = new Set(filteredBase.map((card) => card.id));
    const manualOutstanding = filterVisible(manualCards, input)
      .filter((card) => !existingIds.has(card.id));

    warnInvalidBlockId?.([...filteredBase, ...manualOutstanding]);

    const formal = selectFormalMemoryCards(filteredBase, input);
    return [...formal, ...sortByDuePriorityStable(manualOutstanding, input)];
  }

  static buildIncrementalLearningQueue(input: SrsV2QueueBuildInput): FSRSCard[] {
    const { baseCards, manualCards, warnInvalidBlockId } = input;
    const filteredBase = filterVisible(baseCards, input);
    const existingIds = new Set(filteredBase.map((card) => card.id));
    const manualOutstanding = filterVisible(manualCards, input)
      .filter((card) => !existingIds.has(card.id));

    warnInvalidBlockId?.([...filteredBase, ...manualOutstanding]);

    const formalCandidates = filteredBase.filter(isFormalMemoryCard);
    const rotationCandidates = filteredBase.filter((card) => !isFormalMemoryCard(card));
    const formal = selectFormalMemoryCards(formalCandidates, input);
    const rotation = selectRotationCards(rotationCandidates, input);

    return [
      ...formal,
      ...rotation,
      ...sortByDuePriorityStable(manualOutstanding, input),
    ];
  }
}

function filterVisible(cards: FSRSCard[], input: SrsV2QueueBuildInput): FSRSCard[] {
  return cards.filter((card) => !input.isBlacklisted(card) && !input.isDismissed(card));
}

function selectFormalMemoryCards(cards: FSRSCard[], input: SrsV2QueuePolicyOptions): FSRSCard[] {
  const learning = cards.filter((card) =>
    (card.state === CardState.Learning || card.state === CardState.Relearning)
    && Number(card.due) <= input.now
  );
  const reviews = cards.filter((card) =>
    card.state === CardState.Review
    && Number(card.due) <= input.dayEnd
  );
  const newCards = cards.filter((card) =>
    isNewCard(card)
    && Number(card.due) <= input.dayEnd
  );

  const cappedReviews = input.reviewsPerDay > 0
    ? sortByDuePriorityStable(reviews, input).slice(0, input.reviewsPerDay)
    : sortByDuePriorityStable(reviews, input);
  const cappedNewCards = input.newCardsPerDay > 0
    ? sortByDuePriorityStable(newCards, input).slice(0, input.newCardsPerDay)
    : [];

  return [
    ...sortByDuePriorityStable(learning, input),
    ...cappedReviews,
    ...cappedNewCards,
  ];
}

function selectRotationCards(cards: FSRSCard[], input: SrsV2QueuePolicyOptions): FSRSCard[] {
  return sortByDuePriorityStable(
    cards.filter((card) => Number(card.due) <= input.dayEnd),
    input,
  );
}

function isFormalMemoryCard(card: FSRSCard): boolean {
  return card.type === CardType.Item || card.type === CardType.Descriptor;
}

function isNewCard(card: FSRSCard): boolean {
  if (card.state === CardState.New) {
    return true;
  }

  return Number(card.reps) === 0
    && card.state !== CardState.Learning
    && card.state !== CardState.Relearning
    && card.state !== CardState.Review;
}

function sortByDuePriorityStable(cards: FSRSCard[], input: SrsV2QueuePolicyOptions): FSRSCard[] {
  return [...cards].sort((left, right) => {
    const dueDiff = toFiniteNumber(left.due, input.dayEnd) - toFiniteNumber(right.due, input.dayEnd);
    if (dueDiff !== 0) {
      return dueDiff;
    }

    const priorityDiff = normalizePriority(left.priority) - normalizePriority(right.priority);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const noiseDiff = stableNoiseFromId(left.id, input.stableSalt) - stableNoiseFromId(right.id, input.stableSalt);
    if (Math.abs(noiseDiff) > 1e-12) {
      return noiseDiff * Math.max(0, input.priorityRandomness);
    }

    return String(left.id || '').localeCompare(String(right.id || ''));
  });
}

function normalizePriority(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PRIORITY;
  }
  return Math.max(0, Math.min(100, numeric));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stableNoiseFromId(id: string, salt: string): number {
  const seededId = `${salt}::${id || ''}`;
  let hash = 2166136261;
  for (let index = 0; index < seededId.length; index += 1) {
    hash ^= seededId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
