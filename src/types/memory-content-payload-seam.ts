import type { BrowserCard, BrowserCardMeta, BrowserCardType } from './browser';
import {
  STATE_LABELS,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
} from './browser';
import { CardState, type CardType, type FSRSCard } from './card';
import type { QueueSnapshotRow } from './queue-browser';

export type QueueCardFirstReviewMode = 'created-or-last' | 'last-review';
export type SourceContentExistence = 'present' | 'missing' | 'unknown';

export interface MemoryItemSnapshot {
  id: string;
  fsrsCardId: string;
  blockId: string;
  state: CardState;
  due: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: number | null;
  interval: number;
  firstReview: number | null;
  priority: number;
  suspended: boolean;
  cardType?: CardType;
  aFactor?: number;
  queueIndex?: number;
}

export interface SourceContentProjection {
  blockId: string;
  deckId: string;
  rootId: string;
  content: string;
  fullContent: string;
  tags: string[];
  note: string;
  blockType?: string | null;
  existence: SourceContentExistence;
}

export type BrowserRowProjection = Omit<BrowserCard, 'note' | 'meta'>;

export interface MemoryItemSnapshotOptions {
  firstReviewMode?: QueueCardFirstReviewMode;
  queueIndex?: number;
  now?: number;
  suspended?: boolean;
  cardType?: CardType;
  aFactor?: number;
}

export interface SourceContentProjectionOverrides {
  blockId?: string;
  deckId?: string;
  rootId?: string;
  fullContent?: string;
  content?: string;
  tags?: string[];
  note?: string;
  blockType?: string | null;
  existence?: SourceContentExistence;
}

export interface SourceContentProjectionInput extends SourceContentProjectionOverrides {
  blockId: string;
}

export interface BrowserCardPayloadOptions {
  meta?: BrowserCardMeta | Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function resolveCardContent(card: FSRSCard): string {
  const meta = card.meta || {};
  return (
    readString(meta.content) ||
    readString(meta.imageOcclusionPrompt) ||
    readString(meta.title)
  );
}

function resolveFirstReview(
  card: FSRSCard,
  lastReview: number | null,
  mode: QueueCardFirstReviewMode,
): number | null {
  if (mode === 'last-review') {
    return lastReview;
  }

  if (card.reps > 0) {
    return card.createdAt || lastReview;
  }

  return null;
}

function isSuspendedMemoryItem(card: FSRSCard): boolean {
  return card.state === CardState.Suspended || card.meta?.suspended === true;
}

function resolveSourceExistence(
  fullContent: string,
  blockType: string | null | undefined,
): SourceContentExistence {
  if (blockType === 'missing') {
    return 'missing';
  }
  return fullContent ? 'present' : 'unknown';
}

export function buildMemoryItemSnapshot(
  card: FSRSCard,
  options: MemoryItemSnapshotOptions = {},
): MemoryItemSnapshot {
  const now = options.now ?? Date.now();
  const lastReview = card.lastReview || null;
  const elapsedDays = lastReview
    ? Math.floor((now - lastReview) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    id: card.riffCardId || card.id,
    fsrsCardId: card.id,
    blockId: card.blockId,
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability: calculateRetrievability(card.stability, elapsedDays),
    reps: card.reps,
    lapses: card.lapses,
    elapsedDays,
    scheduledDays: card.scheduledDays,
    lastReview,
    interval: card.scheduledDays,
    firstReview: resolveFirstReview(
      card,
      lastReview,
      options.firstReviewMode ?? 'last-review',
    ),
    priority: card.priority ?? 50,
    suspended: options.suspended ?? isSuspendedMemoryItem(card),
    cardType: options.cardType ?? card.type,
    aFactor: options.aFactor ?? card.aFactor,
    queueIndex: options.queueIndex,
  };
}

export function buildSourceContentProjectionFromCard(
  card: FSRSCard,
  overrides: SourceContentProjectionOverrides = {},
): SourceContentProjection {
  const meta = card.meta || {};
  return buildSourceContentProjection({
    blockId: overrides.blockId ?? card.blockId,
    deckId: overrides.deckId ?? readString(meta.deckId),
    rootId: overrides.rootId ?? readString(meta.rootId),
    fullContent: overrides.fullContent ?? resolveCardContent(card),
    content: overrides.content,
    tags: overrides.tags ?? [...(card.tags || [])],
    note: overrides.note ?? readString(meta.note),
    blockType: (overrides.blockType ?? readString(meta.blockType)) || null,
    existence: overrides.existence,
  });
}

export function buildSourceContentProjection(
  input: SourceContentProjectionInput,
): SourceContentProjection {
  const blockType = input.blockType ?? null;
  const fullContent = input.fullContent ?? '';

  return {
    blockId: input.blockId,
    deckId: input.deckId ?? '',
    rootId: input.rootId ?? '',
    content: input.content ?? truncateContent(fullContent),
    fullContent,
    tags: input.tags ?? [],
    note: input.note ?? '',
    blockType,
    existence: input.existence ?? resolveSourceExistence(fullContent, blockType),
  };
}

export function buildSourceContentProjectionFromQueueRow(
  row: QueueSnapshotRow,
  overrides: SourceContentProjectionOverrides = {},
): SourceContentProjection {
  const blockType = overrides.blockType ?? row.blockType ?? null;
  const fullContent = overrides.fullContent ?? row.fullContent ?? '';

  return {
    blockId: overrides.blockId ?? row.blockId,
    deckId: overrides.deckId ?? row.deckId,
    rootId: overrides.rootId ?? row.rootId,
    content: overrides.content ?? row.content,
    fullContent,
    tags: overrides.tags ?? [...(row.tags || [])],
    note: overrides.note ?? '',
    blockType,
    existence: overrides.existence ?? resolveSourceExistence(fullContent, blockType),
  };
}

export function buildBrowserRowProjection(
  memory: MemoryItemSnapshot,
  source: SourceContentProjection,
): BrowserRowProjection {
  const due = new Date(memory.due);
  const lastReview = memory.lastReview ? new Date(memory.lastReview) : null;
  const firstReview = memory.firstReview ? new Date(memory.firstReview) : null;

  return {
    id: memory.id,
    fsrsCardId: memory.fsrsCardId,
    blockId: source.blockId || memory.blockId,
    deckId: source.deckId,
    content: source.content,
    fullContent: source.fullContent,
    rootId: source.rootId,
    state: memory.state,
    stateLabel: STATE_LABELS[memory.state] || '未知',
    due,
    dueFormatted: formatDueDate(due),
    stability: memory.stability,
    difficulty: memory.difficulty,
    retrievability: memory.retrievability,
    reps: memory.reps,
    lapses: memory.lapses,
    elapsedDays: memory.elapsedDays,
    scheduledDays: memory.scheduledDays,
    lastReview,
    lastReviewFormatted: formatHistoryDate(lastReview),
    interval: memory.interval,
    firstReview,
    firstReviewFormatted: formatHistoryDate(firstReview),
    priority: memory.priority,
    suspended: memory.suspended,
    tags: [...source.tags],
    queueIndex: memory.queueIndex,
    cardType: memory.cardType as BrowserCardType | undefined,
    aFactor: memory.aFactor,
  };
}

export function buildBrowserCardFromPayload(
  memory: MemoryItemSnapshot,
  source: SourceContentProjection,
  options: BrowserCardPayloadOptions = {},
): BrowserCard {
  const inheritedMeta = options.meta || {};
  const meta: BrowserCardMeta = {
    ...inheritedMeta,
    content: source.fullContent,
    deckId: source.deckId,
    rootId: source.rootId,
    note: source.note,
    blockType: source.blockType ?? undefined,
  };
  const card: BrowserCard = {
    ...buildBrowserRowProjection(memory, source),
    note: source.note,
    meta,
  };

  if (source.existence === 'missing' || source.blockType === 'missing') {
    (card as BrowserCard & { blockType?: string }).blockType = 'missing';
  }

  return card;
}

export function buildQueueSnapshotRowFromPayload(
  memory: MemoryItemSnapshot,
  source: SourceContentProjection,
): QueueSnapshotRow {
  return {
    id: memory.id,
    fsrsCardId: memory.fsrsCardId,
    blockId: source.blockId || memory.blockId,
    deckId: source.deckId,
    rootId: source.rootId,
    content: source.content,
    fullContent: source.fullContent,
    state: memory.state,
    due: memory.due,
    stability: memory.stability,
    difficulty: memory.difficulty,
    retrievability: memory.retrievability,
    reps: memory.reps,
    lapses: memory.lapses,
    elapsedDays: memory.elapsedDays,
    scheduledDays: memory.scheduledDays,
    lastReview: memory.lastReview,
    interval: memory.interval,
    firstReview: memory.firstReview,
    priority: memory.priority,
    suspended: memory.suspended,
    cardType: memory.cardType,
    aFactor: memory.aFactor,
    queueIndex: memory.queueIndex,
    tags: [...source.tags],
    blockType: source.blockType,
  };
}
