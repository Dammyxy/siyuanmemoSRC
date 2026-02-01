import type { AdapterContext, IAdapter, ReviewUIState } from '../types';
import { getBlockBreadcrumb } from '../../../../core/siyuan/api.ts';
import type { QueueItem, QueueStats, QueueUIConfig } from '../../../../core/queue/types.ts';

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function shortId(id: string): string {
  const s = String(id || '');
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function reasonLabel(i18n: Record<string, string> | undefined, associationType: string): string {
  const tp = String(associationType || '');
  if (tp === 'ref_link') return t(i18n, 'neuralReasonRef', '双链');
  if (tp === 'hierarchy') return t(i18n, 'neuralReasonContext', '同文档');
  if (tp === 'tag') return t(i18n, 'neuralReasonTag', '标签');
  if (tp === 'sibling') return t(i18n, 'neuralReasonSibling', '兄弟块');
  return t(i18n, 'unknown', '未知');
}

export class NeuralRoamAdapter implements IAdapter<QueueItem> {
  private readonly i18n?: Record<string, string>;

  constructor(options?: { i18n?: Record<string, string> }) {
    this.i18n = options?.i18n;
  }

  async toUIState(queue: any, item: QueueItem | null, context: AdapterContext): Promise<ReviewUIState> {
    const uiConfig: QueueUIConfig = typeof queue?.getUIConfig === 'function'
      ? queue.getUIConfig(item)
      : { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };

    const stats: QueueStats = typeof queue?.getStats === 'function'
      ? await queue.getStats()
      : { size: 0, label: '' };

    const nc = (item as any)?.meta?.neuralContext || {};
    const isFlashcard = Boolean(nc?.isFlashcard);
    const isTopicMode = !isFlashcard;
    const assoc = String(nc?.associationType || '');
    const prev = String(nc?.previousCardId || '');

    const menu = Array.isArray((uiConfig as any)?.menuCommands) ? (uiConfig as any).menuCommands : [];
    const customButtons = Array.isArray((uiConfig as any)?.customButtons) ? (uiConfig as any).customButtons : [];
    const toolbar = customButtons.map((b: any) => ({
      icon: b?.icon,
      label: String(b?.label || ''),
      command: String(b?.actionId || ''),
    })).filter((b: any) => b.label && b.command);

    const grades = uiConfig.showRatingButtons ? [
      { label: t(this.i18n, 'cardRatingAgain', '重来'), value: 1, color: 'var(--b3-theme-error)', kb: '1', emoji: '🙈', nextDue: (item as any)?.nextDues?.[1] || '' },
      { label: t(this.i18n, 'cardRatingHard', '困难'), value: 2, color: 'var(--b3-theme-warning)', kb: '2', emoji: '😬', nextDue: (item as any)?.nextDues?.[2] || '' },
      { label: t(this.i18n, 'cardRatingGood', '良好'), value: 3, color: 'var(--b3-theme-info)', kb: '3', emoji: '😊', nextDue: (item as any)?.nextDues?.[3] || '' },
      { label: t(this.i18n, 'cardRatingEasy', '简单'), value: 4, color: 'var(--b3-theme-success)', kb: '4', emoji: '🌈', nextDue: (item as any)?.nextDues?.[4] || '' },
    ] : [];

    const overlay = (!isTopicMode && item)
      ? {
          component: 'NeuralRoamTopArea',
          layout: 'top' as const,
          props: {
            i18n: this.i18n,
            isTopicMode,
            reasonLabel: reasonLabel(this.i18n, assoc),
            fromShort: prev ? shortId(prev) : '',
          },
        }
      : undefined;

    const total = Math.max(0, Number(stats.size) || 0);
    const current = total;
    const newCards = isTopicMode ? total : 0;
    const reviewCards = isTopicMode ? 0 : total;

    if (!item) {
      return {
        header: {
          stats: {
            current,
            total,
            label: t(this.i18n, 'queueNeural', '神经漫游'),
            queueName: 'neural-roam',
            newCards: 0,
            reviewCards: 0,
          },
          breadcrumbs: [],
          toolbar: [
            { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', '全屏') },
            { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', '编辑SRS数据') },
          ],
        },
        content: {
          type: 'html',
          data: `<div class="ft__secondary" style="padding: 16px; text-align: center;">${t(this.i18n, 'loadingContent', '内容加载中...')}</div>`,
          id: 'empty',
        },
        actions: {
          showAnswer: false,
          grades: [],
          menu,
          toolbar,
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
          label: t(this.i18n, 'queueNeural', '神经漫游'),
          queueName: 'neural-roam',
          newCards,
          reviewCards,
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
        id: String((item as any)?.blockID || (item as any)?.cardID || 'block'),
        // Xiuyuan 模板卡片：从 meta 中获取答案块 ID
        answerBlockID: String((item as any)?.meta?.answerBlockID || ''),
        card: item as any,
      },
      overlay,
      actions: {
        showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
        grades: uiConfig.showRatingButtons ? (context.showAnswer ? grades : []) : [],
        menu,
        toolbar,
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
