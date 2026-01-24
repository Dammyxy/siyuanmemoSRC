import * as riff from '../../siyuan/riff.ts';
import { NeuralQueueStorage } from '../neural/NeuralQueueStorage.ts';
import { QueryEngine } from '../neural/QueryEngine.ts';
import { WeightedWalkEngine } from '../neural/WeightedWalkEngine.ts';
import { AssociationType, type NeuralContext, type NeuralQueueConfig } from '../neural/types.ts';
import { GraphSequencer, type WeightedNeighbor as GraphWeightedNeighbor } from '../sequencers/GraphSequencer.ts';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types.ts';
import { sql } from '../../siyuan/api.ts';
import { ATTR_PRIORITY } from '../../siyuan/block.ts';
import { clampPriority, DEFAULT_PRIORITY, priorityFactor } from '../abstraction/IPriority.ts';

type RiffApi = {
  getRiffCardsByBlockIDs: typeof riff.getRiffCardsByBlockIDs;
  addRiffCards: typeof riff.addRiffCards;
  reviewRiffCard: typeof riff.reviewRiffCard;
  skipReviewRiffCard: typeof riff.skipReviewRiffCard;
};

type I18n = Record<string, string>;

type EdgeMeta = {
  associationType: AssociationType;
  reason: string;
};

function t(i18n: I18n | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function reasonFor(type: AssociationType): string {
  if (type === AssociationType.REF_LINK) return '双向链接';
  if (type === AssociationType.HIERARCHY) return '同文档';
  if (type === AssociationType.TAG) return '标签关联';
  if (type === AssociationType.SIBLING) return '兄弟块';
  return '未知关联';
}

function normalizeRiffCardId(block: any): string {
  return String(block?.riffCardID || block?.riffCardId || block?.riffCard?.id || '');
}

export class NeuralRoamQueue {
  private readonly deckID: string;
  private readonly i18n?: I18n;
  private readonly api: RiffApi;
  private readonly getPrioritiesByBlockIDs: (blockIDs: string[]) => Promise<Map<string, number>>;

  private readonly config: NeuralQueueConfig;
  private readonly queryEngine: QueryEngine;
  private readonly walkEngine: WeightedWalkEngine;

  private readonly cardIdCache = new Map<string, { cardID: string; deckID: string }>();
  private readonly priorityCache = new Map<string, number>();

  private readonly includeSeedAsFirst: boolean;
  private readonly seedBlockId: string | null;
  private pendingSeed: string | null;

  private readonly sequencer: GraphSequencer<string, QueueItem, EdgeMeta>;

  private steps = 0;

  constructor(options?: {
    deckID?: string;
    i18n?: I18n;
    seedBlockId?: string;
    includeSeedAsFirst?: boolean;
    api?: Partial<RiffApi>;
    getPrioritiesByBlockIDs?: (blockIDs: string[]) => Promise<Map<string, number>>;
    config?: Partial<NeuralQueueConfig>;
  }) {
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.i18n = options?.i18n;
    this.api = {
      getRiffCardsByBlockIDs: options?.api?.getRiffCardsByBlockIDs || riff.getRiffCardsByBlockIDs,
      addRiffCards: options?.api?.addRiffCards || riff.addRiffCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.getPrioritiesByBlockIDs = options?.getPrioritiesByBlockIDs || defaultGetPrioritiesByBlockIDs;

    const saved = NeuralQueueStorage.loadConfig();
    this.config = {
      ...saved,
      ...options?.config,
      weights: { ...saved.weights, ...(options?.config as any)?.weights },
      queryLimits: { ...saved.queryLimits, ...(options?.config as any)?.queryLimits },
      features: { ...saved.features, ...(options?.config as any)?.features },
      topicMode: { ...(saved as any).topicMode, ...(options?.config as any)?.topicMode },
    } as NeuralQueueConfig;

    this.queryEngine = new QueryEngine(this.config);
    this.walkEngine = new WeightedWalkEngine({
      [AssociationType.REF_LINK]: this.config.weights.refLink,
      [AssociationType.HIERARCHY]: this.config.weights.hierarchy,
      [AssociationType.TAG]: this.config.weights.tag,
      [AssociationType.SIBLING]: this.config.weights.sibling,
    });

    this.seedBlockId = options?.seedBlockId ? String(options.seedBlockId) : null;
    this.includeSeedAsFirst = Boolean(options?.includeSeedAsFirst);
    this.pendingSeed = this.includeSeedAsFirst ? this.seedBlockId : null;

    this.sequencer = new GraphSequencer<string, QueueItem, EdgeMeta>({
      seed: this.seedBlockId || null,
      getSeed: async () => {
        if (this.seedBlockId) return this.seedBlockId;
        return await this.queryEngine.fetchRandomCard();
      },
      getNodeKey: (node) => String(node || ''),
      getNeighbors: async (node) => {
        const neighbors = await this.queryEngine.fetchNeighbors(String(node || ''));
        const ids = Array.from(new Set((neighbors || []).map((x) => String((x as any)?.id || '')).filter(Boolean)));
        const priorityMap = await this.getPrioritiesByBlockIDs(ids).catch(() => new Map<string, number>());
        for (const [k, v] of priorityMap.entries()) this.priorityCache.set(k, v);
        const out: Array<GraphWeightedNeighbor<string, EdgeMeta>> = [];
        for (const n of neighbors || []) {
          const associationType = n.type as AssociationType;
          const base = this.walkEngine.getWeight(associationType);
          const p = clampPriority(this.priorityCache.get(String(n.id || '')), DEFAULT_PRIORITY);
          const weight = base * priorityFactor(p);
          out.push({
            node: String(n.id || ''),
            weight,
            edge: { associationType, reason: reasonFor(associationType) },
          });
        }
        return out;
      },
      toItem: async (node, ctx) => {
        return await this.nodeToItem(node, ctx.from, ctx.edge);
      },
    });
  }

  getUIConfig(currentItem: any | null): QueueUIConfig {
    const isFlashcard = Boolean((currentItem as any)?.meta?.neuralContext?.isFlashcard);
    if (!isFlashcard) {
      return {
        statsType: 'queue-size',
        showRatingButtons: false,
        allowSkip: true,
        customButtons: [{ id: 'continue', label: t(this.i18n, 'neuralContinue', '继续漫游') }],
      };
    }
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    return { size: this.steps, label: '' };
  }

  async next(): Promise<QueueItem | null> {
    if (this.pendingSeed) {
      const seed = this.pendingSeed;
      this.pendingSeed = null;
      const it = await this.nodeToItem(seed, null, null);
      if (it) {
        this.steps++;
        return it;
      }
    }
    const it = await this.sequencer.next();
    if (it) this.steps++;
    return it;
  }

  async onFeedback(
    currentItem: any | null,
    feedback: { action: 'rate' | 'skip' | 'custom'; rating?: 1 | 2 | 3 | 4; customActionId?: string; durationMs?: number },
  ): Promise<void> {
    const isFlashcard = Boolean((currentItem as any)?.meta?.neuralContext?.isFlashcard);
    const blockID = String(currentItem?.blockID || currentItem?.blockId || '');
    if (!blockID) return;

    if (feedback.action === 'custom') {
      return;
    }

    if (!isFlashcard) {
      return;
    }

    const info = await this.ensureRiffCardId(blockID);
    if (!info?.cardID) return;

    if (feedback.action === 'skip') {
      await this.api.skipReviewRiffCard(info.deckID || this.deckID, info.cardID);
      return;
    }

    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;
      await this.api.reviewRiffCard(info.deckID || this.deckID, info.cardID, rating);
      return;
    }
  }

  private async nodeToItem(nodeId: string, previousId: string | null, edge: EdgeMeta | null): Promise<QueueItem | null> {
    const id = String(nodeId || '');
    if (!id) return null;

    const cardData = await this.queryEngine.fetchCardData(id);
    if (!cardData) return null;

    const isFlashcard = Boolean(cardData.hasFlashcard);
    const neuralContext: NeuralContext = {
      previousCardId: previousId,
      associationType: edge?.associationType || AssociationType.HIERARCHY,
      reason: edge?.reason || '',
      blockType: cardData.blockType,
      isFlashcard,
    };

    let cardID = '';
    let deckID = this.deckID;
    if (isFlashcard) {
      const info = await this.ensureRiffCardId(id);
      if (info) {
        cardID = info.cardID;
        deckID = info.deckID || deckID;
      }
    }

    return {
      cardID,
      blockID: id,
      deckID,
      nextDues: { 1: '', 2: '', 3: '', 4: '' },
      meta: {
        neuralContext,
      },
    };
  }

  private async ensureRiffCardId(blockID: string): Promise<{ cardID: string; deckID: string } | null> {
    const bid = String(blockID || '');
    if (!bid) return null;
    const cached = this.cardIdCache.get(bid);
    if (cached) return cached;

    const blocks = await this.api.getRiffCardsByBlockIDs([bid]).catch(() => []);
    const cardID0 = normalizeRiffCardId((blocks as any[])?.[0]);
    const deckID0 = String((blocks as any[])?.[0]?.riffCard?.deckID || this.deckID);
    if (cardID0) {
      const v = { cardID: cardID0, deckID: deckID0 };
      this.cardIdCache.set(bid, v);
      return v;
    }

    await this.api.addRiffCards(this.deckID, [bid]).catch(() => {});
    const blocks2 = await this.api.getRiffCardsByBlockIDs([bid]).catch(() => []);
    const cardID1 = normalizeRiffCardId((blocks2 as any[])?.[0]);
    const deckID1 = String((blocks2 as any[])?.[0]?.riffCard?.deckID || this.deckID);
    if (!cardID1) return null;
    const v = { cardID: cardID1, deckID: deckID1 };
    this.cardIdCache.set(bid, v);
    return v;
  }
}

function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

async function defaultGetPrioritiesByBlockIDs(blockIDs: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set((blockIDs || []).map((x) => String(x || '')).filter(Boolean)));
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const inList = batch.map((id) => `'${escapeSql(id)}'`).join(',');
    const stmt = `SELECT block_id, value FROM attributes WHERE name = '${ATTR_PRIORITY}' AND block_id IN (${inList})`;
    const rows = await sql(stmt).catch(() => []);
    for (const r of rows as any[]) {
      const bid = String(r?.block_id || r?.blockId || '');
      if (!bid) continue;
      out.set(bid, clampPriority(r?.value, DEFAULT_PRIORITY));
    }
  }
  return out;
}
