import {
  QueueItemUnavailableError,
  type QueueFeedback,
} from '@/core/queue/abstraction/Strategy';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';
import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamItem,
  BackendNeuralRoamStartFromFocusRequest,
} from '../../../../../packages/contracts/src/backend-rpc';
import type { NeuralRoamAdvanceOutcomePolicy } from './NeuralRoamAdvanceOutcomePolicy';
import type { ReviewCurrentItemCommand } from './ReviewCurrentItemCommand';
import type { ReviewSessionCursor } from './ReviewSessionCursor';

export type NeuralRoamAdvanceNextOutcome =
  | { kind: 'next'; card: FSRSCard; source: 'next' | 'pending'; status: BackendNeuralRoamAdvanceResult['status'] }
  | { kind: 'exhausted'; source: 'next' | 'pending'; status: BackendNeuralRoamAdvanceResult['status'] };

export type NeuralRoamAdvanceFeedbackOutcome =
  | { kind: 'advanced'; status: BackendNeuralRoamAdvanceResult['status']; nextCardId: string | null }
  | { kind: 'session-only'; action: QueueFeedback['action']; customActionId: string | null };

export interface NeuralRoamAdvanceCoordinatorDependencies {
  cursor: ReviewSessionCursor;
  currentItem: ReviewCurrentItemCommand;
  outcomePolicy: NeuralRoamAdvanceOutcomePolicy;
  submitAdvance: (request: BackendNeuralRoamAdvanceRequest) => Promise<BackendNeuralRoamAdvanceResult>;
  syncFromBackendState: (result: BackendNeuralRoamAdvanceResult) => Promise<void>;
  applyUnavailableItem: (card: FSRSCard) => void;
  pushHistory: (item: FSRSCard, transaction: null) => void;
  addNextDues: (card: FSRSCard) => Promise<FSRSCard>;
}

export class NeuralRoamAdvanceCoordinator {
  private pendingNext: FSRSCard | null = null;
  private pendingNextReady = false;
  private pendingStartFromFocus: BackendNeuralRoamStartFromFocusRequest | null = null;

  constructor(private readonly deps: NeuralRoamAdvanceCoordinatorDependencies) {}

  reset(): void {
    this.pendingNext = null;
    this.pendingNextReady = false;
    this.pendingStartFromFocus = null;
  }

  startFromFocusOnNextAdvance(request: BackendNeuralRoamStartFromFocusRequest | null | undefined): void {
    const blockId = String(request?.blockId || '').trim();
    if (!blockId) {
      this.pendingStartFromFocus = null;
      return;
    }

    this.pendingStartFromFocus = {
      blockId,
      seedBlockId: String(request?.seedBlockId || '').trim() || blockId,
      sourceReviewCardId: String(request?.sourceReviewCardId || '').trim() || null,
      conceptBlockId: String(request?.conceptBlockId || '').trim() || null,
      previousEngineMode: request?.previousEngineMode ?? null,
      includeFocusAsFirst: request?.includeFocusAsFirst !== false,
      resetHistory: request?.resetHistory === true,
      startNewSession: request?.startNewSession === true,
      entrySessionKind: request?.entrySessionKind ?? null,
    };
    this.deps.currentItem.clear();
    this.pendingNext = null;
    this.pendingNextReady = false;
    this.deps.cursor.clearForward();
  }

  async next(): Promise<NeuralRoamAdvanceNextOutcome | null> {
    if (this.pendingNextReady) {
      const pending = this.pendingNext;
      this.pendingNext = null;
      this.pendingNextReady = false;
      if (!pending) {
        this.deps.currentItem.clear();
        return { kind: 'exhausted', source: 'pending', status: 'exhausted' };
      }
      const cardWithNextDues = await this.deps.addNextDues(pending);
      this.deps.currentItem.select(cardWithNextDues);
      return { kind: 'next', card: cardWithNextDues, source: 'pending', status: 'advanced' };
    }

    const startFromFocus = this.pendingStartFromFocus;
    this.pendingStartFromFocus = null;
    const result = await this.deps.submitAdvance({
      queueType: 'neural-roam',
      sessionId: null,
      currentItem: this.deps.currentItem.current ? this.toAdvanceItem(this.deps.currentItem.current) : null,
      feedback: null,
      startFromFocus,
    });
    return this.consumeAdvanceResult(result, 'next');
  }

  async handleFeedback(
    activeItem: FSRSCard,
    feedback: QueueFeedback,
  ): Promise<NeuralRoamAdvanceFeedbackOutcome> {
    if (feedback.action !== 'rate' && feedback.action !== 'skip') {
      this.deps.pushHistory(activeItem, null);
      this.pendingNext = null;
      this.pendingNextReady = false;
      this.deps.currentItem.clear();
      return {
        kind: 'session-only',
        action: feedback.action,
        customActionId: feedback.customActionId ?? null,
      };
    }

    const result = await this.deps.submitAdvance({
      queueType: 'neural-roam',
      sessionId: null,
      currentItem: this.toAdvanceItem(activeItem),
      feedback: {
        action: feedback.action,
        rating: feedback.action === 'rate' ? feedback.rating : undefined,
        customActionId: feedback.customActionId ?? null,
      },
      reviewedAt: Date.now(),
    });

    const outcome = this.deps.outcomePolicy.consume(result);
    if (outcome.kind === 'item-unavailable' || outcome.kind === 'unavailable') {
      if (outcome.kind === 'item-unavailable') {
        this.deps.applyUnavailableItem(activeItem);
        throw new QueueItemUnavailableError(
          `Queue item is no longer available: ${activeItem.id}`,
          {
            cardId: activeItem.id,
            blockId: activeItem.blockId,
            queueType: QueueType.NeuralRoam,
          },
        );
      }
      throw new Error(
        `NEURAL_ROAM_ADVANCE_UNAVAILABLE: ${outcome.reason}: ${outcome.message}`,
      );
    }

    await this.deps.syncFromBackendState(result);
    this.deps.pushHistory(activeItem, null);
    this.deps.cursor.clearForward();
    this.deps.cursor.clearPendingRotation();
    this.deps.currentItem.clear();
    this.pendingNext = result.nextItem ? this.fromAdvanceItem(result.nextItem) : null;
    this.pendingNextReady = true;
    this.deps.cursor.counterSnapshot = toCounterSnapshot(result);

    return {
      kind: 'advanced',
      status: result.status,
      nextCardId: result.nextItem?.cardId ?? null,
    };
  }

  private async consumeAdvanceResult(
    result: BackendNeuralRoamAdvanceResult,
    source: 'next' | 'pending',
  ): Promise<NeuralRoamAdvanceNextOutcome | null> {
    this.deps.cursor.counterSnapshot = toCounterSnapshot(result);
    const outcome = this.deps.outcomePolicy.consume(result);
    if (outcome.kind === 'exhausted') {
      await this.deps.syncFromBackendState(result);
      this.deps.currentItem.clear();
      return { kind: 'exhausted', source, status: result.status };
    }
    if (outcome.kind !== 'next' || !result.nextItem) {
      throw new Error(
        `NEURAL_ROAM_ADVANCE_UNAVAILABLE: ${outcome.kind === 'unavailable' ? outcome.reason : outcome.reason || result.status}: ${outcome.kind === 'unavailable' ? outcome.message : result.message || 'advance failed'}`,
      );
    }

    await this.deps.syncFromBackendState(result);
    const nextCard = this.fromAdvanceItem(result.nextItem);
    const cardWithNextDues = await this.deps.addNextDues(nextCard);
    this.deps.currentItem.select(cardWithNextDues);
    return { kind: 'next', card: cardWithNextDues, source, status: result.status };
  }

  private toAdvanceItem(card: FSRSCard): BackendNeuralRoamItem {
    const payload = cloneCard(card);
    const meta = isRecord(payload.meta) ? payload.meta : {};
    const neuralContext = isRecord(meta.neuralContext) ? meta.neuralContext : null;
    return {
      id: String(payload.id || payload.blockId || '').trim(),
      cardId: String(payload.id || payload.blockId || '').trim(),
      blockId: String(payload.blockId || payload.id || '').trim(),
      deckId: typeof (payload as { deckId?: unknown }).deckId === 'string'
        ? String((payload as { deckId?: string }).deckId)
        : null,
      due: Number.isFinite(Number(payload.due)) ? Number(payload.due) : null,
      type: String(payload.type || '').trim() || null,
      meta,
      sourceKind: neuralContext?.isFlashcard === true ? 'associated-review' : 'virtual',
      payload: payload as unknown as Record<string, unknown>,
    };
  }

  private fromAdvanceItem(item: BackendNeuralRoamItem): FSRSCard {
    if (item.payload && this.isFsrsCardLike(item.payload)) {
      return cloneCard(item.payload as unknown as FSRSCard);
    }

    const now = Date.now();
    const id = String(item.cardId || item.id || item.blockId || '').trim();
    const blockId = String(item.blockId || item.cardId || item.id || '').trim();
    return {
      id: id || blockId,
      xiuyuanID: blockId || id,
      blockId: blockId || id,
      due: Number.isFinite(Number(item.due)) ? Number(item.due) : now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: now,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: normalizeAdvanceItemCardType(item.type),
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: item.meta && typeof item.meta === 'object' ? { ...item.meta } : {},
    };
  }

  private isFsrsCardLike(value: Record<string, unknown>): boolean {
    return typeof value.id === 'string'
      && typeof value.blockId === 'string'
      && typeof value.due === 'number';
  }
}

function toCounterSnapshot(result: BackendNeuralRoamAdvanceResult): QueueCounterSnapshot {
  return {
    version: Date.now(),
    remaining: Math.max(0, Math.floor(Number(result.counters.remaining || 0))),
    due: Math.max(0, Math.floor(Number(result.counters.due || 0))),
    total: Math.max(0, Math.floor(Number(result.counters.total || 0))),
    buckets: {
      all: Math.max(0, Math.floor(Number(result.counters.total || 0))),
      item: Math.max(0, Math.floor(Number(result.counters.pendingAssociatedReview || 0))),
      descriptor: 0,
      topic: Math.max(0, Math.floor(Number(result.counters.sourceNodes || 0))),
      concept: 0,
    },
    source: 'hot',
  };
}

function normalizeAdvanceItemCardType(value: unknown): CardType {
  switch (value) {
    case CardType.Item:
    case CardType.Topic:
    case CardType.Concept:
    case CardType.Descriptor:
    case CardType.Incremental:
    case CardType.Webpage:
      return value;
    default:
      return CardType.Topic;
  }
}

function cloneCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
