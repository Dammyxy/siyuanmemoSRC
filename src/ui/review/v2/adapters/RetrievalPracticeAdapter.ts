import type { AdapterContext, IAdapter, ReviewUIState } from '../types';
import { getBlockBreadcrumb, getIconByType } from '../../../../core/siyuan/api.ts';
import type { QueueItem, QueueStats, QueueUIConfig } from '../../../../core/queue/types.ts';
import { isXiuyuanCard } from '@/core/xiuyuan/cardMeta';

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

/**
 * @deprecated 此 Adapter 已废弃，请使用 UnifiedReviewAdapter 代替
 * @see UnifiedReviewAdapter
 * @see createUnifiedReviewDialog
 */
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

    // 从 label 解析新卡和复习卡数量（格式：'2/5' 表示 2 新卡，5 复习卡）
    let statsNewCards = 0;
    let statsReviewCards = 0;
    let useParsedLabel = false;

    if (stats.label && typeof stats.label === 'string' && stats.label.includes('/')) {
      const parts = stats.label.split('/');
      if (parts.length === 2) {
        statsNewCards = Number(parts[0]) || 0;
        statsReviewCards = Number(parts[1]) || 0;
        useParsedLabel = true;
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

    // 如果没有从 label 解析出新卡/复习卡数量，使用 total 作为复习卡数量
    let newCards = statsNewCards;
    let reviewCards = statsReviewCards;
    if (!useParsedLabel) {
      // 提取练习等模式：没有新卡/复习卡区分，所有卡片都是复习卡
      newCards = 0;
      reviewCards = statsTotal || statsRemaining;
    }
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
      const toolbar = [
        { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
        { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', '编辑SRS数据') },
      ];
      console.log('[RetrievalPracticeAdapter] toUIState (no item) - toolbar:', toolbar);
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
          toolbar,
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
        },
        meta: {
          transition: 'none',
          canSkip: uiConfig.allowSkip,
        },
      };
    }

    const toolbar = [
      { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
      { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', '编辑SRS数据') },
      { icon: '#iconOpen', type: 'sticktab', ariaLabel: t(this.i18n, 'openBy', '打开为') },
    ];
    console.log('[RetrievalPracticeAdapter] toUIState (with item) - toolbar:', toolbar);

    return {
      header: {
        stats: {
          current,
          currentNewCards: useParsedLabel ? newCards - Math.max(0, newCards - statsReviewed) : 0,
          currentReviewCards: useParsedLabel
            ? reviewCards - Math.max(0, reviewCards - Math.max(0, statsReviewed - newCards))
            : statsRemaining,
          total: Math.max(newCards + reviewCards, 0),
          label,
          queueName,
          newCards,
          reviewCards,
        },
        breadcrumbs: [],
        toolbar,
      },
      content: {
        type: 'protyle',
        data: (() => {
          console.log('[RetrievalPracticeAdapter] Setting content.data:', {
            itemType: (item as any)?.type,
            isXiuyuan: isXiuyuanCard(item),
            blockID: (item as any)?.blockID,
            fieldMapping: isXiuyuanCard(item) ? item.meta.fieldMapping : undefined
          });
          
          // 🆕 描述符卡：使用 fieldMapping 中的 descriptor 字段
          if ((item as any)?.type === 'descriptor' && isXiuyuanCard(item)) {
            const descriptorId = item.meta.fieldMapping?.descriptor || String((item as any)?.blockID || '');
            console.log('[RetrievalPracticeAdapter] Descriptor card, using descriptor field:', descriptorId);
            return descriptorId;
          }
          // 其他卡片：使用 blockID
          return String((item as any)?.blockID || '');
        })(),
        id: (() => {
          console.log('[RetrievalPracticeAdapter] Setting content.id:', {
            itemType: (item as any)?.type,
            isXiuyuan: isXiuyuanCard(item),
            blockID: (item as any)?.blockID,
            fieldMapping: isXiuyuanCard(item) ? item.meta.fieldMapping : undefined
          });
          
          // 🆕 描述符卡：使用 fieldMapping 中的 descriptor 字段
          if ((item as any)?.type === 'descriptor' && isXiuyuanCard(item)) {
            const descriptorId = item.meta.fieldMapping?.descriptor || String((item as any)?.blockID || '');
            console.log('[RetrievalPracticeAdapter] Descriptor card, using descriptor field:', descriptorId);
            return descriptorId;
          }
          // 🆕 Xiuyuan 卡片：使用 frontBlockIDs 的第一个块
          if (isXiuyuanCard(item) && item.meta.frontBlockIDs.length > 0) {
            console.log('[RetrievalPracticeAdapter] Xiuyuan card, using frontBlockIDs[0]:', item.meta.frontBlockIDs[0]);
            return item.meta.frontBlockIDs[0];
          }
          return String((item as any)?.blockID || (item as any)?.cardID || 'card');
        })(),
        answerBlockID: (() => {
          // 🆕 Xiuyuan 卡片：使用 backBlockIDs 的第一个块
          if (isXiuyuanCard(item) && item.meta.backBlockIDs.length > 0) {
            return item.meta.backBlockIDs[0];
          }
          // 向后兼容：旧的 Xiuyuan 卡片
          return String((item as any)?.meta?.answerBlockID || '');
        })(),
        card: item as any,
      },
      actions: {
        showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
        grades: context.showAnswer ? grades : [],
        menu,
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
        remainingSize: statsRemaining || 0, // 🆕 剩余卡片数量
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
