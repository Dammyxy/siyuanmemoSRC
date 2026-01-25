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

    const total = Math.max(0, Number(progress.total) || 0);
    const answered = Math.max(0, Number(progress.answered) || 0);
    const current = item ? Math.min(total || answered + 1, answered + 1) : total;

    const resume = typeof queue?.getResumePrompt === 'function'
      ? queue.getResumePrompt()
      : null;

    const grades = uiConfig.showRatingButtons ? [
      { label: t(this.i18n, 'again', '忘记'), value: 1, color: 'var(--b3-theme-error)', kb: '1' },
      { label: t(this.i18n, 'hard', '困难'), value: 2, color: 'var(--b3-theme-warning)', kb: '2' },
      { label: t(this.i18n, 'good', '一般'), value: 3, color: 'var(--b3-theme-primary)', kb: '3' },
      { label: t(this.i18n, 'easy', '简单'), value: 4, color: 'var(--b3-theme-success)', kb: '4' },
    ] : [];
    const menu = Array.isArray((uiConfig as any)?.menuCommands) ? (uiConfig as any).menuCommands : [];

    if (!item) {
      return {
        header: {
          stats: {
            current,
            total,
            label: t(this.i18n, 'queueDeliberate', '最终冲刺'),
            queueName: 'final-drill',
          },
          breadcrumbs: [],
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
          resumePrompt: resume || undefined,
          drillStats: {
            correct: Math.max(0, Number(progress.correct) || 0),
            total,
            duration: toSeconds(Number(progress.durationMs) || 0),
          },
        },
      };
    }

    return {
      header: {
        stats: {
          current,
          total,
          label: t(this.i18n, 'queueDeliberate', '最终冲刺'),
          queueName: 'final-drill',
        },
        breadcrumbs: [],
      },
      content: {
        type: 'protyle',
        data: String((item as any)?.blockID || ''),
        id: String((item as any)?.blockID || (item as any)?.cardID || 'card'),
      },
      actions: {
        showAnswer: !context.showAnswer,
        grades: context.showAnswer ? grades : [],
        menu,
        toolbar: [],
      },
      meta: {
        transition: 'none',
        resumePrompt: resume || undefined,
        drillStats: {
          correct: Math.max(0, Number(progress.correct) || 0),
          total,
          duration: toSeconds(Number(progress.durationMs) || 0),
        },
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
