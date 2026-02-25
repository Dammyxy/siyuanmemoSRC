/**
 * FSRS Retrieval Provider
 *
 * @deprecated Legacy Provider layer.
 * New code should use RetrievalPracticeQueue directly.
 */

import * as riff from '../../siyuan/riff.ts';
import { sql } from '../../siyuan/api.ts';
import { ATTR_PRIORITY } from '../../siyuan/block.ts';
import { computeProtectionStats, clampPriority, DEFAULT_PRIORITY } from '../../queue/abstraction/IPriority.ts';
import { normalizeBlockId, normalizeDeckId, normalizeRiffCardId } from '../../queue/abstraction/QueueCardRef.ts';
import type { CardReadPort, CardWritePort, ReviewLogWritePort } from '../../storage/ports.ts';
import type { QueueItem } from '../../queue/types.ts';
import type { QueueProvider } from '../QueueProvider.ts';
import type { QueueStats } from '../types.ts';
import { createLogger } from '../../../utils/logger.ts';

const logger = createLogger('FSRSRetrievalProvider');

type Rating = 1 | 2 | 3 | 4;
type LegacyQueueItem = QueueItem & {
  cardID: string;
  blockID: string;
  deckID: string;
  cardId?: string;
  blockId?: string;
  deckId?: string;
};

type FSRSRetrievalStoragePort = CardReadPort & CardWritePort & ReviewLogWritePort;

type RiffApi = {
  getRiffDueCards: typeof riff.getRiffDueCards;
  reviewRiffCard: typeof riff.reviewRiffCard;
  skipReviewRiffCard: typeof riff.skipReviewRiffCard;
};

type PriorityAttributeRow = {
  block_id?: unknown;
  blockId?: unknown;
  value?: unknown;
};

function isObjectRecord(value: unknown): value is Record<string | number, unknown> {
  return typeof value === 'object' && value !== null;
}

function toOptionalNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeRating(rating: number): Rating {
  const normalized = Math.max(1, Math.min(4, Math.floor(rating)));
  return normalized as Rating;
}

function resolveItemCardId(item: LegacyQueueItem): string {
  return String(item.cardID || item.cardId || item.id || '');
}

function normalizeNextDues(input: unknown): Record<1 | 2 | 3 | 4, string> {
  const raw = isObjectRecord(input) && isObjectRecord(input.nextDues) ? input.nextDues : null;
  if (!raw) return { 1: '', 2: '', 3: '', 4: '' };

  const byNumber = {
    1: String(raw[1] ?? raw['1'] ?? ''),
    2: String(raw[2] ?? raw['2'] ?? ''),
    3: String(raw[3] ?? raw['3'] ?? ''),
    4: String(raw[4] ?? raw['4'] ?? ''),
  };
  if (byNumber[1] || byNumber[2] || byNumber[3] || byNumber[4]) {
    return byNumber;
  }

  return {
    1: String(raw.again ?? ''),
    2: String(raw.hard ?? ''),
    3: String(raw.good ?? ''),
    4: String(raw.easy ?? ''),
  };
}

function normalizeDueCard(raw: unknown, fallbackDeckID: string): LegacyQueueItem | null {
  const cardID = normalizeRiffCardId(raw);
  const blockID = normalizeBlockId(raw);
  const deckID = normalizeDeckId(raw, fallbackDeckID);
  if (!cardID || !blockID) return null;

  const record = isObjectRecord(raw) ? raw : {};
  return {
    id: cardID,
    blockId: blockID,
    deckId: deckID,
    cardID,
    blockID,
    deckID,
    priority: DEFAULT_PRIORITY,
    nextDues: normalizeNextDues(raw),
    state: toOptionalNumber(record.state),
    lapses: toOptionalNumber(record.lapses),
    reps: toOptionalNumber(record.reps),
  };
}

function normalizePriorityRows(rows: unknown): PriorityAttributeRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is PriorityAttributeRow => isObjectRecord(row));
}

export class FSRSRetrievalProvider implements QueueProvider<LegacyQueueItem> {
  readonly id = 'fsrs-retrieval';
  readonly displayName: string;

  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly storage?: FSRSRetrievalStoragePort;
  private loaded = false;

  private items: LegacyQueueItem[] = [];
  private rawByCardId = new Map<string, riff.RiffReviewCard>();
  private blockIdByCardId = new Map<string, string>();
  private itemByCardId = new Map<string, LegacyQueueItem>();

  private unreviewedNew = 0;
  private unreviewedOld = 0;
  private unreviewedTotal = 0;
  private protectionExtra = '';

  constructor(options?: { deckID?: string; displayName?: string; api?: Partial<RiffApi>; storage?: FSRSRetrievalStoragePort }) {
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.displayName = String(options?.displayName || 'FSRS 复习');
    this.storage = options?.storage;
    this.api = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
  }

  async getDueCards(options?: { forceReload?: boolean }): Promise<LegacyQueueItem[]> {
    logger.debug('getDueCards START', {
      loaded: this.loaded,
      itemsCount: this.items.length,
      forceReload: options?.forceReload,
    });

    if (options?.forceReload) {
      logger.debug('Force reload requested');
      this.loaded = false;
    }

    await this.ensureLoaded();
    logger.debug('getDueCards DONE', { count: this.items.length });
    return [...this.items];
  }

  async getStats(_options?: Record<string, unknown>): Promise<QueueStats> {
    await this.ensureLoaded();
    const remaining = Math.max(0, Number(this.unreviewedTotal) || 0);
    const label = `${Math.max(0, Number(this.unreviewedNew) || 0)}/${Math.max(0, Number(this.unreviewedOld) || 0)}`;
    return {
      current: 0,
      total: remaining,
      remaining,
      reviewed: 0,
      label,
      extra: this.protectionExtra,
    };
  }

  async reviewCard(cardId: string, rating: number, reviewedCards?: LegacyQueueItem[]): Promise<void> {
    logger.debug('reviewCard called', {
      cardId,
      rating,
      itemsCount: this.items.length,
    });

    await this.ensureLoaded();
    const id = String(cardId || '');
    if (!id) return;

    const index = this.items.findIndex((item) => String(item.cardID) === id);
    if (index === -1) {
      logger.error('Card not found in list', { cardId: id });
      return;
    }

    const item = this.items[index];
    const deckID = item.deckID || this.deckID;
    const payload = this.buildReviewedPayload(reviewedCards);
    const normalizedRating = normalizeRating(rating);
    const reviewTime = Date.now();

    await this.api.reviewRiffCard(deckID, id, normalizedRating, payload);

    if (this.storage) {
      try {
        await this.storage.addReviewLog({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          cardId: id,
          rating: normalizedRating,
          state: item.state || 0,
          scheduledDays: 0,
          elapsedDays: 0,
          review: reviewTime,
          reviewTime: 0,
          isDrill: false,
          stability: 0,
          difficulty: 0,
        });
      } catch (error) {
        logger.error('Failed to add review log', error);
      }
    }

    this.afterConsumed(id);
    logger.debug('Card reviewed', { remaining: this.items.length });
  }

  async skipReviewCard(cardId: string): Promise<void> {
    logger.debug('skipReviewCard called', { cardId });

    await this.ensureLoaded();
    const id = String(cardId || '');
    if (!id) return;

    const index = this.items.findIndex((item) => String(item.cardID) === id);
    if (index === -1) {
      logger.error('Card not found in list', { cardId: id });
      return;
    }

    const item = this.items[index];
    const deckID = item.deckID || this.deckID;

    await this.api.skipReviewRiffCard(deckID, id);
    this.afterConsumed(id);
    logger.debug('Card skipped', { remaining: this.items.length });
  }

  async setPriority(cardId: string, priority: number): Promise<void> {
    await this.ensureLoaded();
    const id = String(cardId || '');
    const blockID = this.blockIdByCardId.get(id);
    if (!blockID) return;
    if (!this.storage) {
      logger.warn('setPriority skipped: storage is not available');
      return;
    }

    const normalizedPriority = clampPriority(priority, DEFAULT_PRIORITY);
    const card = this.storage.getCard(id);
    if (!card) return;

    card.priority = normalizedPriority;
    this.storage.setCard(card);
    await this.storage.saveCards();
  }

  private afterConsumed(cardId: string): void {
    this.unreviewedTotal = Math.max(0, (Number(this.unreviewedTotal) || 0) - 1);
    const state = Number(this.itemByCardId.get(cardId)?.state);
    if (state === 0) {
      this.unreviewedNew = Math.max(0, (Number(this.unreviewedNew) || 0) - 1);
    } else {
      this.unreviewedOld = Math.max(0, (Number(this.unreviewedOld) || 0) - 1);
    }

    this.items = this.items.filter((item) => String(item.cardID) !== cardId);
    this.rawByCardId.delete(cardId);
    this.blockIdByCardId.delete(cardId);
    this.itemByCardId.delete(cardId);
  }

  private buildReviewedPayload(reviewedCards?: LegacyQueueItem[]): riff.RiffReviewCard[] {
    const out: riff.RiffReviewCard[] = [];
    const list = Array.isArray(reviewedCards) ? reviewedCards : [];
    for (const item of list) {
      const cardId = resolveItemCardId(item);
      if (!cardId) continue;
      const raw = this.rawByCardId.get(cardId);
      if (raw) out.push(raw);
    }
    return out;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    const data = await this.api.getRiffDueCards(this.deckID);
    const cards = Array.isArray(data?.cards) ? data.cards : [];
    this.unreviewedTotal = Number(data?.unreviewedCount) || cards.length || 0;
    this.unreviewedNew = Number(data?.unreviewedNewCardCount) || 0;
    this.unreviewedOld = Number(data?.unreviewedOldCardCount) || 0;

    const rawOut: riff.RiffReviewCard[] = [];
    const itemOut: LegacyQueueItem[] = [];
    for (const card of cards) {
      const item = normalizeDueCard(card, this.deckID);
      if (!item) continue;
      rawOut.push(card);
      itemOut.push(item);
    }

    const blockIds = itemOut.map((item) => String(item.blockID)).filter(Boolean);
    const priorityMap = await defaultGetPrioritiesByBlockIDs(blockIds).catch(() => new Map<string, number>());
    const paired = itemOut.map((item, index) => ({
      item,
      raw: rawOut[index],
      priority: clampPriority(priorityMap.get(item.blockID), DEFAULT_PRIORITY),
    }));
    paired.sort((left, right) => left.priority - right.priority);

    const finalItems = paired.map(({ item, priority }) => ({
      ...item,
      priority,
      meta: { ...(item.meta || {}), priority },
    }));
    this.items = finalItems;

    for (let index = 0; index < paired.length; index++) {
      const item = finalItems[index];
      const raw = paired[index].raw;
      const cardId = String(item.cardID);
      this.rawByCardId.set(cardId, raw);
      this.blockIdByCardId.set(cardId, String(item.blockID));
      this.itemByCardId.set(cardId, item);
    }

    const protection = computeProtectionStats(paired.map(({ priority }) => priority));
    this.protectionExtra = protection.total > 0
      ? `HP ${protection.highPriority}/${protection.total} ${(protection.coverage * 100).toFixed(0)}%`
      : '';
  }
}

function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

async function defaultGetPrioritiesByBlockIDs(blockIDs: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set((blockIDs || []).map((id) => String(id || '')).filter(Boolean)));
  const out = new Map<string, number>();
  if (ids.length === 0) return out;

  for (let index = 0; index < ids.length; index += 200) {
    const batch = ids.slice(index, index + 200);
    const inList = batch.map((id) => `'${escapeSql(id)}'`).join(',');
    const stmt = `SELECT block_id, value FROM attributes WHERE name = '${ATTR_PRIORITY}' AND block_id IN (${inList})`;
    const rows = await sql(stmt).catch((): unknown[] => []);

    for (const row of normalizePriorityRows(rows)) {
      const blockId = String(row.block_id ?? row.blockId ?? '');
      if (!blockId) continue;
      out.set(blockId, clampPriority(row.value, DEFAULT_PRIORITY));
    }
  }

  return out;
}
