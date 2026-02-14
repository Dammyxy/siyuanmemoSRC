import type { AdapterContext, IAdapter, ReviewUIState } from '../types';
import { getBlockBreadcrumb } from '../../../../core/siyuan/api.ts';
import type { QueueItem, QueueUIConfig } from '../../../../core/queue/types.ts';

function toSeconds(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 1000));
}

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

/**
 * @deprecated 此 Adapter 已废弃，请使用 UnifiedReviewAdapter 代替
 * @see UnifiedReviewAdapter
 * @see createUnifiedReviewDialog
 */
export class FinalDrillAdapter implements IAdapter<QueueItem> {
  private readonly i18n?: Record<string, string>;

  constructor(options?: { i18n?: Record<string, string> }) {
    this.i18n = options?.i18n;
  }

  async toUIState(queue: any, item: QueueItem | null, context: AdapterContext): Promise<ReviewUIState> {
    const uiConfig: QueueUIConfig = typeof queue?.getUIConfig === 'function'
      ? queue.getUIConfig(item)
      : { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };

    const progress = typeof queue?.getProgress === 'function'
      ? queue.getProgress()
      : { answered: 0, correct: 0, total: 0, durationMs: 0 };

    // ✅ 修复：使用实时剩余卡片数量，而不是 total
    const remaining = typeof queue?.getAllItems === 'function'
      ? queue.getAllItems().length
      : 0;
    const answered = Math.max(0, Number(progress.answered) || 0);
    const current = item ? answered + 1 : answered;

    const resume = typeof queue?.getResumePrompt === 'function'
      ? queue.getResumePrompt()
      : null;

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

    const menu = Array.isArray((uiConfig as any)?.menuCommands) ? (uiConfig as any).menuCommands : [];

    if (!item) {
      return {
        header: {
          stats: {
            current: 0,
            total: 0,  // ✅ 完成时显示 0/0
            label: t(this.i18n, 'queueDeliberate', '最终冲刺'),
            queueName: 'final-drill',
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
        },
        meta: {
          transition: 'none',
          resumePrompt: resume || undefined,
          drillStats: {
            correct: Math.max(0, Number(progress.correct) || 0),
            total: Math.max(0, Number(progress.total) || 0),  // ✅ 使用 progress.total（初始总数）
            duration: toSeconds(Number(progress.durationMs) || 0),
          },
          canSkip: uiConfig.allowSkip,
        },
      };
    }

    return {
      header: {
        stats: {
          current,
          total: remaining,  // ✅ 修复：显示剩余卡片数量
          label: t(this.i18n, 'queueDeliberate', '最终冲刺'),
          queueName: 'final-drill',
          newCards: remaining,  // ✅ 修复：显示剩余卡片数量
          reviewCards: 0,
          currentNewCards: remaining, // 🆕
          currentReviewCards: 0, // 🆕
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
        answerBlockID: String((item as any)?.meta?.answerBlockID || ''),
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
        resumePrompt: resume || undefined,
        drillStats: {
          correct: Math.max(0, Number(progress.correct) || 0),
          total: Math.max(0, Number(progress.total) || 0),  // ✅ 使用 progress.total（初始总数）
          duration: toSeconds(Number(progress.durationMs) || 0),
        },
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
      ? bc.map((b: any) => ({
          icon: 'iconFile',
          text: String(b?.name || b?.title || b?.content || b?.hPath || ''),
          id: String(b?.id || ''),
        })).filter((b: any) => b.text)
      : [];
    return { header: { breadcrumbs } as any };
  }
}
