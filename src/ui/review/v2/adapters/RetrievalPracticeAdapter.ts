import type { AdapterContext, IAdapter, ReviewUIState } from '../types';
import { getBlockBreadcrumb } from '../../../../core/siyuan/api.ts';
import type { QueueItem, QueueStats, QueueUIConfig } from '../../../../core/queue/types.ts';

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function toLabel(base: string, tail: string): string {
  const a = String(base || '').trim();
  const b = String(tail || '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

export class RetrievalPracticeAdapter implements IAdapter<QueueItem> {
  private readonly i18n?: Record<string, string>;
  private readonly label?: string;
  private readonly queueName?: string;

  constructor(options?: { i18n?: Record<string, string>; label?: string; queueName?: string }) {
    this.i18n = options?.i18n;
    this.label = options?.label;
    this.queueName = options?.queueName;
  }

  async toUIState(queue: any, item: QueueItem | null, context: AdapterContext): Promise<ReviewUIState> {
    const uiConfig: QueueUIConfig = typeof queue?.getUIConfig === 'function'
      ? queue.getUIConfig(item)
      : { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true };

    const stats: QueueStats = typeof queue?.getStats === 'function'
      ? await queue.getStats()
      : { size: 0, label: '', extra: '' };

    // 调试日志：查看 stats 的实际值
    console.log('[RetrievalPracticeAdapter] stats:', stats);

    // 从 label 解析新卡和复习卡数量（格式：'2/5' 表示 2 新卡，5 复习卡）
    let statsNewCards = 0;
    let statsReviewCards = 0;
    if (stats.label && typeof stats.label === 'string') {
      const parts = stats.label.split('/');
      if (parts.length === 2) {
        statsNewCards = Number(parts[0]) || 0;
        statsReviewCards = Number(parts[1]) || 0;
      }
    }

    // 获取当前剩余数量和已复习数量
    const statsRemaining = Number((stats as any)?.remaining) || 0;
    const statsTotal = Number((stats as any)?.total) || 0;
    const statsReviewed = Number((stats as any)?.reviewed) || 0;

    // 使用队列提供的 reviewed 字段
    const reviewed = statsReviewed;

    // 当前序号：已复习数量 + 1（从 1 开始）
    const current = reviewed + 1;

    const total = statsTotal;
    const newCards = statsNewCards;
    const reviewCards = statsReviewCards;

    console.log('[RetrievalPracticeAdapter] statsTotal:', statsTotal, 'statsRemaining:', statsRemaining, 'statsNewCards:', statsNewCards, 'statsReviewCards:', statsReviewCards, 'reviewed:', reviewed, 'current:', current);
    const baseLabel = String(this.label || t(this.i18n, 'reviewTitle', 'FSRS 复习'));
    const label = toLabel(baseLabel, toLabel(String(stats.label || ''), String(stats.extra || '')));
    const queueName = String(this.queueName || 'retrieval-practice');

    const menu = Array.isArray((uiConfig as any)?.menuCommands) ? (uiConfig as any).menuCommands : [];

    const grades = uiConfig.showRatingButtons ? [
      {
        label: t(this.i18n, 'cardRatingAgain', '重来'),
        value: 1,
        color: 'var(--b3-theme-error)',
        kb: '1',
        emoji: '🙈',
        nextDue: (item as any)?.nextDues?.[1] || '',
      },
      {
        label: t(this.i18n, 'cardRatingHard', '困难'),
        value: 2,
        color: 'var(--b3-theme-warning)',
        kb: '2',
        emoji: '😬',
        nextDue: (item as any)?.nextDues?.[2] || '',
      },
      {
        label: t(this.i18n, 'cardRatingGood', '良好'),
        value: 3,
        color: 'var(--b3-theme-info)',
        kb: '3',
        emoji: '😊',
        nextDue: (item as any)?.nextDues?.[3] || '',
      },
      {
        label: t(this.i18n, 'cardRatingEasy', '简单'),
        value: 4,
        color: 'var(--b3-theme-success)',
        kb: '4',
        emoji: '🌈',
        nextDue: (item as any)?.nextDues?.[4] || '',
      },
    ] : [];

    if (!item) {
      return {
        header: {
          stats: {
            current: 0,
            total: 0,
            label,
            queueName,
            newCards: 0,
            reviewCards: 0,
          },
          breadcrumbs: [],
          toolbar: [
            { icon: '#iconFilter', type: 'filter', ariaLabel: t(this.i18n, 'filter', '筛选') },
            { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
            { icon: '#iconMore', type: 'more', ariaLabel: t(this.i18n, 'more', '更多') },
          ],
        },
        content: {
          type: 'html',
          data: `<div class="ft__secondary" style="padding: 16px; text-align: center;">${t(this.i18n, 'completeToday', '今日复习已完成')}</div>`,
          id: 'done',
        },
        actions: {
          showAnswer: false,
          grades: [],
          menu,
          toolbar: [],
        },
        meta: {
          transition: 'none',
          canSkip: uiConfig.allowSkip,
        },
      };
    }

    return {
      header: {
        stats: {
          current,
          total: Math.max(newCards + reviewCards, 0),
          label,
          queueName,
          newCards,
          reviewCards,
        },
        breadcrumbs: [],
        toolbar: [
          { icon: '#iconFilter', type: 'filter', ariaLabel: t(this.i18n, 'filter', '筛选') },
          { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
          { icon: '#iconMore', type: 'more', ariaLabel: t(this.i18n, 'more', '更多') },
        ],
      },
      content: {
        type: 'protyle',
        data: String((item as any)?.blockID || ''),
        id: String((item as any)?.blockID || (item as any)?.cardID || 'card'),
      },
      actions: {
        showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
        grades: context.showAnswer ? grades : [],
        menu,
        toolbar: [],
        cardMeta: {
          lapses: item?.lapses,
          reps: item?.reps,
          state: item?.state,
          lastReview: item?.lastReview,
          cardID: item?.cardID,
          blockID: item?.blockID,
          deckID: item?.deckID,
          isReviewCard: (item?.state ?? 0) !== 0,
        },
      },
      meta: {
        transition: 'none',
        canSkip: uiConfig.allowSkip,
        hasHiddenContent: Boolean(uiConfig.hiddenContentTypes?.length),
      },
    };
  }

  async fetchAuxiliaryData(item: QueueItem | null): Promise<Partial<ReviewUIState>> {
    const blockID = String((item as any)?.blockID || '');
    if (!blockID) return {};
    const bc = await getBlockBreadcrumb(blockID);
    const breadcrumbs = Array.isArray(bc)
      ? bc.map((b: any) => ({
          icon: 'iconFile',
          text: String(b?.name || b?.title || b?.content || b?.hPath || ''),
          id: String(b?.id || ''),
        })).filter((b: any) => b.text)
      : [];
    return { header: { breadcrumbs } as any };
  }
}
