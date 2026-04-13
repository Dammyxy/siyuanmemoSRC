import type { SchedulerRouter, SchedulerType } from '@/core/scheduler';
import type { CardEditorSnapshot } from '@/application/services/CardEditorApplicationService';
import { formatNextDue } from '@/application/helpers/formatNextDue';
import { CardState, Rating, type FSRSCard } from '@/types/card';

type Translator = (key: string, fallback: string) => string;
type SchedulerRouterLike = Pick<SchedulerRouter, 'getSchedulerType' | 'preview'>;
type GradePreviewTone = 'again' | 'hard' | 'good' | 'easy';

export interface SrsTransparencyFact {
  label: string;
  value: string;
  mono?: boolean;
}

export interface SrsTransparencyGradePreview {
  rating: Rating;
  tone: GradePreviewTone;
  label: string;
  nextDue: string;
  dueAt: string;
  explanation: string;
}

export interface SrsTransparencyViewModel {
  schedulerType: SchedulerType;
  schedulerLabel: string;
  summary: string;
  gradePreviews: SrsTransparencyGradePreview[];
  stateFacts: SrsTransparencyFact[];
  algorithmFacts: SrsTransparencyFact[];
}

type BuildOptions = {
  now?: number;
  t: Translator;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const GRADE_ORDER: readonly Rating[] = [
  Rating.Again,
  Rating.Hard,
  Rating.Good,
  Rating.Easy,
];

export class SrsTransparencyApplicationService {
  constructor(private readonly schedulerRouter: SchedulerRouterLike) {}

  build(snapshot: CardEditorSnapshot, options: BuildOptions): SrsTransparencyViewModel {
    const { card, blockInfo } = snapshot;
    const { t } = options;
    const now = options.now ?? Date.now();
    const schedulerType = this.schedulerRouter.getSchedulerType(card);
    const previews = this.schedulerRouter.preview(card);

    return {
      schedulerType,
      schedulerLabel: resolveSchedulerLabel(schedulerType, t),
      summary: resolveSchedulerSummary(schedulerType, t),
      gradePreviews: GRADE_ORDER.map((rating) => {
        const previewCard = previews.get(rating) ?? card;
        return {
          rating,
          tone: resolvePreviewTone(rating),
          label: resolveRatingLabel(rating, t),
          nextDue: formatNextDue((previewCard.due || now) - now),
          dueAt: formatDateTime(previewCard.due, t('pending', 'Pending')),
          explanation: resolveRatingExplanation(rating, t),
        };
      }),
      stateFacts: [
        { label: t('state', '状态'), value: formatState(card.state, t) },
        { label: t('reps', '复习次数'), value: formatNumber(card.reps) },
        { label: t('lapses', '遗忘次数'), value: formatNumber(card.lapses) },
        { label: t('stability', '记忆强度'), value: formatDays(card.stability, t) },
        { label: t('difficulty', '难度'), value: formatNumber(card.difficulty, 2) },
        { label: t('scheduledDays', '安排间隔'), value: formatDays(card.scheduledDays, t) },
        { label: t('lastReview', '上次复习'), value: formatDateTime(card.lastReview, t('pending', 'Pending')) },
        {
          label: t('updatedAt', '更新时间'),
          value: formatDateTime(blockInfo.updatedAt ?? card.updatedAt, t('pending', 'Pending')),
        },
      ],
      algorithmFacts: buildAlgorithmFacts(card, schedulerType, t),
    };
  }
}

function buildAlgorithmFacts(
  card: FSRSCard,
  schedulerType: SchedulerType,
  t: Translator,
): SrsTransparencyFact[] {
  if (schedulerType === 'sm15') {
    const meta = card.schedulerMeta?.sm15;
    return [
      { label: t('schedulerType', '调度器'), value: resolveSchedulerLabel(schedulerType, t) },
      { label: t('oFactor', 'O-Factor'), value: formatNumber(meta?.of, 2) },
      { label: t('optimalInterval', '最优间隔'), value: formatDaysFromMilliseconds(meta?.optimumInterval, t) },
      { label: t('afHistory', 'AF 历史'), value: formatHistorySummary(meta?.afs, t) },
    ];
  }

  if (schedulerType === 'a-factor-v2') {
    const meta = card.schedulerMeta?.topic;
    return [
      { label: t('schedulerType', '调度器'), value: resolveSchedulerLabel(schedulerType, t) },
      { label: t('aFactor', 'A-Factor'), value: formatNumber(card.aFactor, 2) },
      { label: t('oFactor', 'O-Factor'), value: formatNumber(meta?.of, 2) },
      { label: t('optimalInterval', '最优间隔'), value: formatDays(meta?.optimalInterval, t) },
      { label: t('afHistory', 'AF 历史'), value: formatHistorySummary(meta?.afs, t) },
    ];
  }

  return [
    { label: t('schedulerType', '调度器'), value: resolveSchedulerLabel(schedulerType, t) },
    { label: t('algorithmBasis', '调度依据'), value: t('fsrsTransparencyBasis', '根据稳定度与难度预测间隔扩张，并对不同评分给出不同增长幅度。') },
  ];
}

function resolveSchedulerLabel(schedulerType: SchedulerType, t: Translator): string {
  switch (schedulerType) {
    case 'sm15':
      return t('schedulerSm15', 'SM-15');
    case 'a-factor-v2':
      return t('schedulerAFactorV2', 'A-Factor v2');
    case 'fsrs-v6':
    default:
      return t('schedulerFsrsV6', 'FSRS v6');
  }
}

function resolveSchedulerSummary(schedulerType: SchedulerType, t: Translator): string {
  switch (schedulerType) {
    case 'sm15':
      return t('sm15TransparencySummary', 'SM-15 会结合 O-Factor、最优间隔和 AF 历史来决定下一次安排，适合需要更显式调度参数的卡片。');
    case 'a-factor-v2':
      return t('aFactorTransparencySummary', 'A-Factor v2 以 A-Factor 为核心调节间隔扩张，更适合 Topic 或 Concept 一类需要渐进节奏的卡片。');
    case 'fsrs-v6':
    default:
      return t('fsrsTransparencySummary', 'FSRS v6 会根据当前稳定度和难度预测遗忘速度，再为四个评分给出不同的下次复习区间。');
  }
}

function resolveRatingLabel(rating: Rating, t: Translator): string {
  switch (rating) {
    case Rating.Again:
      return t('cardRatingAgain', 'Again');
    case Rating.Hard:
      return t('cardRatingHard', 'Hard');
    case Rating.Good:
      return t('cardRatingGood', 'Good');
    case Rating.Easy:
    default:
      return t('cardRatingEasy', 'Easy');
  }
}

function resolveRatingExplanation(rating: Rating, t: Translator): string {
  switch (rating) {
    case Rating.Again:
      return t('srsTransparencyAgainExplain', '收紧到最短可接受间隔，优先避免再次遗忘。');
    case Rating.Hard:
      return t('srsTransparencyHardExplain', '保守延长，并留出更多巩固次数。');
    case Rating.Good:
      return t('srsTransparencyGoodExplain', '按当前算法的默认增长推进。');
    case Rating.Easy:
    default:
      return t('srsTransparencyEasyExplain', '如果回忆轻松，就放大下一次间隔。');
  }
}

function resolvePreviewTone(rating: Rating): GradePreviewTone {
  switch (rating) {
    case Rating.Again:
      return 'again';
    case Rating.Hard:
      return 'hard';
    case Rating.Good:
      return 'good';
    case Rating.Easy:
    default:
      return 'easy';
  }
}

function formatState(state: CardState, t: Translator): string {
  switch (state) {
    case CardState.New:
      return t('newCard', '新卡');
    case CardState.Learning:
      return t('learning', '学习中');
    case CardState.Review:
      return t('reviewCard', '复习卡');
    case CardState.Relearning:
      return t('relearning', '重学');
    case CardState.Suspended:
      return t('suspended', '暂停');
    default:
      return t('unknown', '未知');
  }
}

function formatDateTime(timestamp?: number | null, fallback = '-'): string {
  return !timestamp || !Number.isFinite(timestamp) || timestamp <= 0
    ? fallback
    : new Date(timestamp).toLocaleString();
}

function formatDays(value?: number | null, t?: Translator): string {
  return value == null || !Number.isFinite(value)
    ? '-'
    : `${Number(value).toFixed(1)} ${t?.('days', 'days') || 'days'}`;
}

function formatDaysFromMilliseconds(value?: number | null, t?: Translator): string {
  return value == null || !Number.isFinite(value)
    ? '-'
    : formatDays(value / DAY_MS, t);
}

function formatNumber(value?: number | null, digits?: number): string {
  return value == null || !Number.isFinite(value)
    ? '-'
    : (digits == null ? String(value) : Number(value).toFixed(digits));
}

function formatHistorySummary(history: number[] | undefined, t: Translator): string {
  if (!Array.isArray(history) || history.length === 0) {
    return '-';
  }

  const latest = history[history.length - 1];
  return t(
    'afHistorySummary',
    `${history.length} entries, latest ${formatNumber(latest, 2)}`,
  )
    .replace('{count}', String(history.length))
    .replace('{latest}', formatNumber(latest, 2));
}
