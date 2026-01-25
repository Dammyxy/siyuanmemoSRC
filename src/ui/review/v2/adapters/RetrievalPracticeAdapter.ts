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
  private initialTotal = 0;

  constructor(options?: { i18n?: Record<string, string> }) {
    this.i18n = options?.i18n;
  }

  async toUIState(queue: any, item: QueueItem | null, context: AdapterContext): Promise<ReviewUIState> {
    const uiConfig: QueueUIConfig = typeof queue?.getUIConfig === 'function'
      ? queue.getUIConfig(item)
      : { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true };

    const stats: QueueStats = typeof queue?.getStats === 'function'
      ? await queue.getStats()
      : { size: 0, label: '', extra: '' };

    const remaining = Math.max(0, Number(stats.size) || 0);
    if (!this.initialTotal && remaining > 0) this.initialTotal = remaining;
    if (remaining === 0) this.initialTotal = 0;

    const total = this.initialTotal || remaining;
    const current = remaining;
    const label = toLabel(t(this.i18n, 'reviewTitle', 'FSRS 复习'), toLabel(String(stats.label || ''), String(stats.extra || '')));

    const menu = Array.isArray((uiConfig as any)?.menuCommands) ? (uiConfig as any).menuCommands : [];

    const grades = uiConfig.showRatingButtons ? [
      { label: t(this.i18n, 'again', '忘记'), value: 1, color: 'var(--b3-theme-error)', kb: '1' },
      { label: t(this.i18n, 'hard', '困难'), value: 2, color: 'var(--b3-theme-warning)', kb: '2' },
      { label: t(this.i18n, 'good', '一般'), value: 3, color: 'var(--b3-theme-primary)', kb: '3' },
      { label: t(this.i18n, 'easy', '简单'), value: 4, color: 'var(--b3-theme-success)', kb: '4' },
    ] : [];

    if (!item) {
      return {
        header: {
          stats: {
            current: 0,
            total: 0,
            label,
            queueName: 'retrieval-practice',
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
        meta: { transition: 'none' },
      };
    }

    return {
      header: {
        stats: {
          current,
          total,
          label,
          queueName: 'retrieval-practice',
        },
        breadcrumbs: [],
      },
      content: {
        type: 'protyle',
        data: String((item as any)?.blockID || ''),
        id: String((item as any)?.blockID || (item as any)?.cardID || 'card'),
      },
      actions: {
        showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
        grades: uiConfig.showRatingButtons ? (context.showAnswer ? grades : []) : [],
        menu,
        toolbar: [],
      },
      meta: { transition: 'none' },
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
