import type { AdapterContext, IAdapter, ReviewUIState } from '../types';
import type { QueueItem, QueueStats, QueueUIConfig } from '../../../../core/queue/types.ts';
import { getBlockBreadcrumb, getIconByType } from '../../../../core/siyuan/api.ts';

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

export class SubsetPracticeAdapter implements IAdapter<QueueItem> {
  private readonly i18n?: Record<string, string>;
  private label: string;
  private queueName: string;

  constructor(options?: { i18n?: Record<string, string>; label?: string; queueName?: string }) {
    this.i18n = options?.i18n;
    this.label = String(options?.label || t(this.i18n, 'reviewSubsetTitle', '子集复习'));
    this.queueName = String(options?.queueName || 'subset-practice');
  }

  setLabel(label: string): void {
    this.label = String(label || this.label);
  }

  async toUIState(queue: any, item: QueueItem | null, context: AdapterContext): Promise<ReviewUIState> {
    const uiConfig: QueueUIConfig = typeof queue?.getUIConfig === 'function'
      ? queue.getUIConfig(item)
      : { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };

    const stats: QueueStats = typeof queue?.getStats === 'function'
      ? await queue.getStats()
      : { size: 0, label: '' };

    const remaining = Math.max(0, Number(stats.size) || 0);
    const initial = Number.isFinite(Number(context.session?.initialTotal)) ? Number(context.session?.initialTotal) : 0;
    const total = Math.max(initial || 0, remaining);
    const current = remaining;
    const menu = Array.isArray((uiConfig as any)?.menuCommands) ? (uiConfig as any).menuCommands : [];

    const grades = uiConfig.showRatingButtons ? [
      { label: t(this.i18n, 'cardRatingAgain', '重来'), value: 1, color: 'var(--b3-theme-error)', kb: '1', emoji: '🙈', nextDue: (item as any)?.nextDues?.[1] || '' },
      { label: t(this.i18n, 'cardRatingHard', '困难'), value: 2, color: 'var(--b3-theme-warning)', kb: '2', emoji: '😬', nextDue: (item as any)?.nextDues?.[2] || '' },
      { label: t(this.i18n, 'cardRatingGood', '良好'), value: 3, color: 'var(--b3-theme-info)', kb: '3', emoji: '😊', nextDue: (item as any)?.nextDues?.[3] || '' },
      { label: t(this.i18n, 'cardRatingEasy', '简单'), value: 4, color: 'var(--b3-theme-success)', kb: '4', emoji: '🌈', nextDue: (item as any)?.nextDues?.[4] || '' },
    ] : [];

    if (!item) {
      return {
        header: {
          stats: {
            current: 0,
            total: 0,
            label: this.label,
            queueName: this.queueName,
            newCards: 0,
            reviewCards: 0,
            currentNewCards: 0, // 🆕
            currentReviewCards: 0, // 🆕
          },
          breadcrumbs: [],
          toolbar: [
            { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
            { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', '编辑SRS数据') },
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
          total,
          label: this.label,
          queueName: this.queueName,
          newCards: total,
          reviewCards: 0,
          currentNewCards: current, // 🆕 当前新卡数量
          currentReviewCards: 0, // 🆕 当前复习卡数量（子集复习都是新卡）
        },
        breadcrumbs: [],
        toolbar: [
          { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
          { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', '编辑SRS数据') },
          { icon: '#iconOpen', type: 'sticktab', ariaLabel: t(this.i18n, 'openBy', '打开为') },
        ],
      },
      content: {
        type: 'protyle',
        data: String((item as any)?.blockID || ''),
        id: String((item as any)?.blockID || (item as any)?.cardID || 'card'),
        // Xiuyuan 模板卡片：从 meta 中获取答案块 ID
        answerBlockID: (() => {
          const answerBlockID = String((item as any)?.meta?.answerBlockID || '');
          console.log('[SubsetPracticeAdapter] toUIState - answerBlockID:', {
            itemBlockID: (item as any)?.blockID,
            itemCardID: (item as any)?.cardID,
            hasMeta: !!(item as any)?.meta,
            meta: (item as any)?.meta,
            answerBlockID,
          });
          return answerBlockID;
        })(),
        card: item as any,
      },
      actions: {
        showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
        grades: uiConfig.showRatingButtons ? (context.showAnswer ? grades : []) : [],
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
          type: (item as any)?.type || 'item', // 🆕 卡片类型
          cardType: (item as any)?.type || 'item', // 🆕 兼容字段
        },
      },
      meta: {
        transition: 'none',
        canSkip: uiConfig.allowSkip,
        hasHiddenContent: Boolean(uiConfig.hiddenContentTypes?.length),
        remainingSize: remaining || 0, // 🆕 剩余卡片数量
      },
    };
  }

  async fetchAuxiliaryData(item: QueueItem | null): Promise<Partial<ReviewUIState>> {
    const blockID = String((item as any)?.blockID || '');
    if (!blockID) return {};
    const bc = await getBlockBreadcrumb(blockID);
    const breadcrumbs = Array.isArray(bc)
      ? bc.map((b: any) => {
          const icon = getIconByType(b?.type, b?.subType);
          return {
            icon: `#${icon}`,
            text: String(b?.name || b?.title || b?.content || b?.hPath || ''),
            id: String(b?.id || ''),
          };
        }).filter((b: any) => b.text)
      : [];
    return { header: { breadcrumbs } as any };
  }
}
