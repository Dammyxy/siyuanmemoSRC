import type { AdapterContext, IAdapter, ReviewCardKind, ReviewUIState } from '../types';
import type { QueueStats, QueueUIConfig } from '../../../../core/queue/types.ts';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import { createReviewHeaderCounterBadge } from '../reviewHeaderCounterPresentation';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SubsetPracticeAdapter');

type RatingValue = 1 | 2 | 3 | 4;
type NextDuesMap = Partial<Record<RatingValue, string>>;

type SubsetReviewItem = {
  id?: string;
  cardID?: string;
  cardId?: string;
  blockID?: string;
  blockId?: string;
  deckID?: string;
  deckId?: string;
  lapses?: number;
  reps?: number;
  state?: number;
  lastReview?: number;
  priority?: number;
  type?: string;
  nextDues?: NextDuesMap;
  meta?: Record<string, unknown>;
};

type SubsetQueueLike = {
  getUIConfig?: (item: SubsetReviewItem | null) => QueueUIConfig;
  getStats?: () => Promise<QueueStats>;
};

type BreadcrumbRaw = {
  type?: string;
  subType?: string;
  name?: string;
  title?: string;
  content?: string;
  hPath?: string;
  id?: string;
};

type PluginLike = {
  getContext?: () => {
    getReviewService?: () => {
      getSiyuanApi?: () => Pick<ReviewSiyuanPort, 'getBlockBreadcrumb' | 'getIconByType'>;
    };
  };
};

const DEFAULT_UI_CONFIG: QueueUIConfig = {
  statsType: 'queue-size',
  showRatingButtons: true,
  allowSkip: true,
};

const DEFAULT_STATS: QueueStats = {
  size: 0,
  label: '',
};

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveQueue(queue: unknown): SubsetQueueLike {
  return isRecord(queue) ? (queue as SubsetQueueLike) : {};
}

function resolveSiyuanApiFromPlugin(plugin: unknown): Pick<ReviewSiyuanPort, 'getBlockBreadcrumb' | 'getIconByType'> | undefined {
  const typed = plugin as PluginLike | undefined;
  return typed?.getContext?.()?.getReviewService?.()?.getSiyuanApi?.();
}

function resolveBlockId(item: SubsetReviewItem | null): string {
  if (!item) return '';
  return String(item.blockID || item.blockId || '');
}

function resolveCardId(item: SubsetReviewItem | null): string {
  if (!item) return '';
  return String(item.cardID || item.cardId || item.id || '');
}

function resolveDeckId(item: SubsetReviewItem | null): string {
  if (!item) return '';
  return String(item.deckID || item.deckId || '');
}

function resolveAnswerBlockId(item: SubsetReviewItem | null): string {
  if (!item || !isRecord(item.meta)) {
    return '';
  }
  const raw = item.meta.answerBlockID;
  return raw == null ? '' : String(raw);
}

function getNextDue(item: SubsetReviewItem | null, rating: RatingValue): string {
  if (!item?.nextDues) {
    return '';
  }
  return String(item.nextDues[rating] || '');
}

function normalizeCardType(type: unknown): ReviewCardKind {
  const value = String(type || 'item');
  if (value === 'topic') return 'topic';
  if (value === 'concept') return 'concept';
  if (value === 'descriptor') return 'descriptor';
  if (value === 'cloze') return 'cloze';
  return 'item';
}

function normalizeBreadcrumb(raw: unknown): BreadcrumbRaw {
  if (!isRecord(raw)) {
    return {};
  }
  return {
    type: typeof raw.type === 'string' ? raw.type : '',
    subType: typeof raw.subType === 'string' ? raw.subType : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    hPath: typeof raw.hPath === 'string' ? raw.hPath : '',
    id: typeof raw.id === 'string' ? raw.id : '',
  };
}

export class SubsetPracticeAdapter implements IAdapter<SubsetReviewItem> {
  private readonly i18n?: Record<string, string>;
  private readonly siyuanApi?: Pick<ReviewSiyuanPort, 'getBlockBreadcrumb' | 'getIconByType'>;
  private label: string;
  private queueName: string;

  constructor(options?: {
    i18n?: Record<string, string>;
    label?: string;
    queueName?: string;
    plugin?: unknown;
    siyuanApi?: Pick<ReviewSiyuanPort, 'getBlockBreadcrumb' | 'getIconByType'>;
  }) {
    this.i18n = options?.i18n;
    this.siyuanApi = options?.siyuanApi || resolveSiyuanApiFromPlugin(options?.plugin);
    this.label = String(options?.label || t(this.i18n, 'reviewSubsetTitle', '\u5b50\u96c6\u590d\u4e60'));
    this.queueName = String(options?.queueName || 'subset-practice');
  }

  setLabel(label: string): void {
    this.label = String(label || this.label);
  }

  async toUIState(queue: unknown, item: SubsetReviewItem | null, context: AdapterContext): Promise<ReviewUIState> {
    const queueLike = resolveQueue(queue);
    const uiConfig = typeof queueLike.getUIConfig === 'function'
      ? queueLike.getUIConfig(item)
      : DEFAULT_UI_CONFIG;

    const stats = typeof queueLike.getStats === 'function'
      ? await queueLike.getStats()
      : DEFAULT_STATS;

    const remaining = Math.max(0, Number(stats.size) || 0);
    const initial = Number.isFinite(Number(context.session?.initialTotal))
      ? Number(context.session?.initialTotal)
      : 0;
    const total = Math.max(initial, remaining);
    const current = remaining;
    const menu = Array.isArray(uiConfig.menuCommands) ? uiConfig.menuCommands : [];
    const remainingLabel = t(this.i18n, 'headerRemaining', '\u5269\u4f59');
    const priorityLabel = t(this.i18n, 'headerPriority', 'Priority');

    const grades = uiConfig.showRatingButtons ? [
      { label: t(this.i18n, 'cardRatingAgain', '\u91cd\u6765'), value: 1, color: 'var(--b3-theme-error)', kb: '1', emoji: '\uD83D\uDE48', nextDue: getNextDue(item, 1) },
      { label: t(this.i18n, 'cardRatingHard', '\u56f0\u96be'), value: 2, color: 'var(--b3-theme-warning)', kb: '2', emoji: '\uD83D\uDE2C', nextDue: getNextDue(item, 2) },
      { label: t(this.i18n, 'cardRatingGood', '\u826f\u597d'), value: 3, color: 'var(--b3-theme-info)', kb: '3', emoji: '\uD83D\uDE0A', nextDue: getNextDue(item, 3) },
      { label: t(this.i18n, 'cardRatingEasy', '\u7b80\u5355'), value: 4, color: 'var(--b3-theme-success)', kb: '4', emoji: '\uD83C\uDF08', nextDue: getNextDue(item, 4) },
    ] : [];

    if (!item) {
      return {
        header: {
          stats: {
            current: 0,
            total: 0,
            label: this.label,
            queueName: this.queueName,
          },
          counterSummary: null,
          counterBadges: [
            createReviewHeaderCounterBadge({
              id: 'remaining',
              label: remainingLabel,
              kind: 'ratio',
              tone: 'neutral',
              remaining: 0,
              total: 0,
            }),
          ],
          priorityBadge: {
            label: 'P',
            value: '-',
            priority: null,
            ariaLabel: `${priorityLabel} -`,
          },
          breadcrumbs: [],
          toolbar: [
            { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
            { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
          ],
        },
        content: {
          type: 'html',
          data: `<div class="ft__secondary" style="padding: 16px; text-align: center;">${t(this.i18n, 'completeToday', '\u4eca\u65e5\u590d\u4e60\u5df2\u5b8c\u6210')}</div>`,
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

    const blockID = resolveBlockId(item);
    const cardID = resolveCardId(item);
    const cardType = normalizeCardType(item.type);
    const answerBlockID = resolveAnswerBlockId(item);

    logger.debug('[SubsetPracticeAdapter] toUIState', {
      blockID,
      cardID,
      hasMeta: !!item.meta,
      answerBlockID,
    });

    return {
      header: {
        stats: {
          current,
          total,
          label: this.label,
          queueName: this.queueName,
        },
        counterSummary: null,
        counterBadges: [
          createReviewHeaderCounterBadge({
            id: 'remaining',
            label: remainingLabel,
            kind: 'ratio',
            tone: 'neutral',
            remaining: current,
            total,
          }),
        ],
        priorityBadge: {
          label: 'P',
          value: Number.isFinite(Number(item.priority)) ? String(item.priority) : '-',
          priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : null,
          ariaLabel: Number.isFinite(Number(item.priority))
            ? `${priorityLabel} ${Number(item.priority)}`
            : `${priorityLabel} -`,
        },
        breadcrumbs: [],
        toolbar: [
          { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
          { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
          { icon: '#iconOpen', type: 'sticktab', ariaLabel: t(this.i18n, 'openBy', 'Open By') },
        ],
      },
      content: {
        type: 'protyle',
        data: blockID,
        id: blockID || cardID || 'card',
        answerBlockID,
      },
      actions: {
        showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
        grades: uiConfig.showRatingButtons ? (context.showAnswer ? grades : []) : [],
        menu,
        cardMeta: {
          lapses: item.lapses,
          reps: item.reps,
          state: item.state,
          lastReview: item.lastReview,
          cardID,
          blockID,
          deckID: resolveDeckId(item),
          isReviewCard: (item.state ?? 0) !== 0,
          type: cardType,
          cardType,
        },
      },
      meta: {
        transition: 'none',
        canSkip: uiConfig.allowSkip,
        hasHiddenContent: Boolean(uiConfig.hiddenContentTypes?.length),
        remainingSize: remaining,
      },
    };
  }

  async fetchAuxiliaryData(item: SubsetReviewItem | null): Promise<Partial<ReviewUIState>> {
    const api = this.siyuanApi;
    if (!api) {
      throw new Error('SubsetPracticeAdapter requires review siyuan api');
    }

    const blockID = resolveBlockId(item);
    if (!blockID) {
      return {};
    }

    const rawBreadcrumbs = await api.getBlockBreadcrumb(blockID);
    const breadcrumbs = Array.isArray(rawBreadcrumbs)
      ? rawBreadcrumbs
          .map(normalizeBreadcrumb)
          .map((node) => ({
            icon: `#${api.getIconByType(node.type || '', node.subType)}`,
            text: String(node.name || node.title || node.content || node.hPath || ''),
            id: String(node.id || ''),
          }))
          .filter((node) => node.text)
      : [];

    return {
      header: { breadcrumbs } as unknown as ReviewUIState['header'],
    };
  }
}
