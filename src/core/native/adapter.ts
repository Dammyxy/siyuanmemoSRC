/**
 * 原生复习界面适配器
 * 将队列数据转换为思源源生复习界面所需的 ICard 格式
 */

import type { ICard, ICardData } from '@/global';
import { riff } from '@/core/siyuan';
import type { QueueItem } from '@/core/queue';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NativeReviewAdapter');

type NativeQueueItem = QueueItem & {
  cardID?: string;
  blockID?: string;
  deckID?: string;
  meta?: Record<string, unknown>;
};

type NativeQueueCard = {
  id?: string;
  blockId?: string;
  blockID?: string;
  deckId?: string;
  deckID?: string;
  meta?: Record<string, unknown>;
};

type NativeQueuePort = {
  getAllCards?: () => Promise<NativeQueueCard[]>;
  getAllItems?: () => NativeQueueItem[];
};

function normalizeQueueCard(card: NativeQueueCard): NativeQueueItem {
  const cardId = String(card.id || card.blockId || card.blockID || '');
  const blockId = String(card.blockId || card.blockID || card.id || '');
  return {
    cardID: cardId,
    blockID: blockId,
    deckID: String(card.deckId || card.deckID || riff.BUILTIN_DECK_ID),
    meta: card.meta,
  } as NativeQueueItem;
}

async function resolveQueueItems(queue: NativeQueuePort): Promise<NativeQueueItem[]> {
  if (typeof queue.getAllCards === 'function') {
    const cards = await queue.getAllCards();
    return cards.map(normalizeQueueCard);
  }

  if (typeof queue.getAllItems === 'function') {
    throw new Error('Native review adapter requires queue.getAllCards(); legacy getAllItems() path was removed');
  }

  return [];
}

/**
 * 队列项到原生卡片的转换接口
 * 轻量级适配器：只负责数据转换，不包含业务逻辑
 */
export interface INativeReviewAdapter {
  /**
   * 将队列项转换为 ICard 格式
   */
  toNativeCards(items: NativeQueueItem[]): ICard[];

  /**
   * 生成原生界面所需的卡片数据
   */
  getCardData(): Promise<ICardData>;

  /**
   * 获取队列名称（用于显示）
   */
  getQueueName(): string;

  /**
   * 获取队列类型（all/doc/notebook）
   */
  getCardType(): 'all' | 'doc' | 'notebook';
}

/**
 * FSRS 数据转换为 nextDues 格式
 */
function calculateNextDues(_item: NativeQueueItem): ICard['nextDues'] {
  // 默认间隔：1m, 5m, 10m, 1d (6天后)
  const oneMinute = 1 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  const nextDues: ICard['nextDues'] = {
    1: `${oneMinute}ms`,        // 1 分钟
    2: `${5 * oneMinute}ms`,    // 5 分钟
    3: `${10 * oneMinute}ms`,   // 10 分钟
    4: `${6 * oneDay}ms`,       // 6 天
  };

  return nextDues;
}

/**
 * 提取练习队列的原生适配器
 */
export class ExtractionNativeAdapter implements INativeReviewAdapter {
  constructor(private queue: NativeQueuePort) {}

  toNativeCards(items: NativeQueueItem[]): ICard[] {
    return items.map((item) => ({
      deckID: item.deckID || riff.BUILTIN_DECK_ID,
      cardID: item.cardID || item.blockID,
      blockID: item.blockID,
      nextDues: calculateNextDues(item),
      lapses: 0,
      lastReview: -62135596800000, // 1970年（表示从未复习）
      reps: 0,
      state: 0, // 0=新卡
      meta: item.meta, // 🆕 传递 meta（包含 answerBlockID 等）
    } as ICard & { meta?: Record<string, unknown> }));
  }

  async getCardData(): Promise<ICardData> {
    const items = await resolveQueueItems(this.queue);
    const cards = this.toNativeCards(items);

    return {
      cards,
      unreviewedCount: items.length,
      unreviewedNewCardCount: items.length,
      unreviewedOldCardCount: 0,
    };
  }

  getQueueName(): string {
    return '提取练习';
  }

  getCardType(): 'all' {
    return 'all';
  }
}

/**
 * 刻意练习队列的原生适配器
 */
export class FinalDrillNativeAdapter implements INativeReviewAdapter {
  constructor(private queue: NativeQueuePort) {}

  toNativeCards(items: NativeQueueItem[]): ICard[] {
    return items.map((item) => ({
      deckID: item.deckID || riff.BUILTIN_DECK_ID,
      cardID: item.cardID || item.blockID,
      blockID: item.blockID,
      nextDues: calculateNextDues(item),
      lapses: 0,
      lastReview: -62135596800000,
      reps: 0,
      state: 0,
      meta: item.meta, // 🆕 传递 meta
    } as ICard & { meta?: Record<string, unknown> }));
  }

  async getCardData(): Promise<ICardData> {
    const items = await resolveQueueItems(this.queue);
    const cards = this.toNativeCards(items);

    return {
      cards,
      unreviewedCount: items.length,
      unreviewedNewCardCount: items.length,
      unreviewedOldCardCount: 0,
    };
  }

  getQueueName(): string {
    return '刻意练习';
  }

  getCardType(): 'all' {
    return 'all';
  }
}

/**
 * 筛选练习队列的原生适配器
 */
export class FilterGroupNativeAdapter implements INativeReviewAdapter {
  constructor(private queue: NativeQueuePort) {}

  toNativeCards(items: NativeQueueItem[]): ICard[] {
    return items.map((item) => ({
      deckID: item.deckID || riff.BUILTIN_DECK_ID,
      cardID: item.cardID || item.blockID,
      blockID: item.blockID,
      nextDues: calculateNextDues(item),
      lapses: 0,
      lastReview: -62135596800000,
      reps: 0,
      state: 0,
      meta: item.meta, // 🆕 传递 meta
    } as ICard & { meta?: Record<string, unknown> }));
  }

  async getCardData(): Promise<ICardData> {
    const items = await resolveQueueItems(this.queue);
    const cards = this.toNativeCards(items);

    return {
      cards,
      unreviewedCount: items.length,
      unreviewedNewCardCount: items.length,
      unreviewedOldCardCount: 0,
    };
  }

  getQueueName(): string {
    return '筛选练习';
  }

  getCardType(): 'all' {
    return 'all';
  }
}
