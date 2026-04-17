import type { FSRSCard } from '@/types/card';

const MIN_PRIORITY = 0;
const MAX_PRIORITY = 100;
const DEFAULT_PRIORITY = 50;

export type QueueOrderingMode = 'due-priority' | 'priority-due';

export interface QueueOrderingOptions {
  mode?: QueueOrderingMode;
  randomization?: number;
  stableSalt?: string;
}

function clampPriority(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PRIORITY;
  }
  return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, numeric));
}

function clampRandomization(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
}

function stableNoiseFromId(id: string, salt = ''): number {
  const seededId = `${salt}::${id}`;
  let hash = 2166136261;
  for (let index = 0; index < seededId.length; index += 1) {
    hash ^= seededId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const normalized = (hash >>> 0) / 0xffffffff;
  return normalized - 0.5;
}

function compareById(left: FSRSCard, right: FSRSCard): number {
  return String(left.id || '').localeCompare(String(right.id || ''));
}

export class PriorityQueueService {
  public static compareCards(
    left: FSRSCard,
    right: FSRSCard,
    options: QueueOrderingOptions = {},
  ): number {
    const mode = options.mode ?? 'due-priority';
    const randomization = clampRandomization(options.randomization);
    const stableSalt = typeof options.stableSalt === 'string' ? options.stableSalt : '';

    if (mode === 'priority-due') {
      const leftPriority = clampPriority(left.priority);
      const rightPriority = clampPriority(right.priority);

      const leftScore = leftPriority + stableNoiseFromId(String(left.id || ''), stableSalt) * randomization * 10;
      const rightScore = rightPriority + stableNoiseFromId(String(right.id || ''), stableSalt) * randomization * 10;
      const scoreDiff = leftScore - rightScore;
      if (Math.abs(scoreDiff) > 1e-9) {
        return scoreDiff;
      }

      const dueDiff = left.due - right.due;
      if (dueDiff !== 0) {
        return dueDiff;
      }

      return compareById(left, right);
    }

    const dueDiff = left.due - right.due;
    if (dueDiff !== 0) {
      return dueDiff;
    }

    const priorityDiff = clampPriority(left.priority) - clampPriority(right.priority);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return compareById(left, right);
  }

  public static sortByDueThenPriority(cards: FSRSCard[]): FSRSCard[] {
    return [...cards].sort((left, right) => this.compareCards(left, right, { mode: 'due-priority' }));
  }

  public static sortByPriorityThenDue(
    cards: FSRSCard[],
    options: { randomization?: number } = {}
  ): FSRSCard[] {
    return [...cards].sort((left, right) => this.compareCards(left, right, {
      mode: 'priority-due',
      randomization: options.randomization,
    }));
  }

  public static sortCards(cards: FSRSCard[], options: QueueOrderingOptions = {}): FSRSCard[] {
    return [...cards].sort((left, right) => this.compareCards(left, right, options));
  }

  public static positionToPriorityPercent(position: number, total: number): number {
    if (!Number.isFinite(total) || total <= 1) {
      return 0;
    }
    const normalizedPosition = Math.max(1, Math.min(total, Math.floor(position)));
    return ((normalizedPosition - 1) / (total - 1)) * 100;
  }

  public static priorityPercentToPosition(percent: number, total: number): number {
    if (!Number.isFinite(total) || total <= 1) {
      return 1;
    }
    const normalizedPercent = Math.max(0, Math.min(100, percent));
    return Math.max(1, Math.min(total, Math.round((normalizedPercent / 100) * (total - 1) + 1)));
  }

  public static placeCardAtPosition(cardIds: string[], cardId: string, position: number): string[] {
    const ids = [...cardIds];
    const targetId = String(cardId || '').trim();
    if (!targetId) {
      return ids;
    }

    const existingIndex = ids.findIndex((id) => String(id) === targetId);
    if (existingIndex >= 0) {
      ids.splice(existingIndex, 1);
    }

    const normalizedPosition = Math.max(1, Math.min(ids.length + 1, Math.floor(position)));
    ids.splice(normalizedPosition - 1, 0, targetId);
    return ids;
  }
}
