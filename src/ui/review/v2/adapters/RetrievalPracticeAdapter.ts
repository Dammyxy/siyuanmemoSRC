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

    const remaining = Number.isFinite(Number((stats as any)?.size))
      ? Math.max(0, Number((stats as any)?.size) || 0)
      : Number.isFinite(Number((stats as any)?.remaining))
        ? Math.max(0, Number((stats as any)?.remaining) || 0)
        : Number.isFinite(Number((stats as any)?.total)) && Number.isFinite(Number((stats as any)?.current))
          ? Math.max(0, (Number((stats as any)?.total) || 0) - (Number((stats as any)?.current) || 0))
          : 0;
    const current = remaining;
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

    // 从 stats 获取新卡/复习卡计数
    const newCards = (stats as any)?.newCards || 0;
    const reviewCards = (stats as any)?.reviewCards || 0;

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
