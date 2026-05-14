import type { SchedulerRouter, SchedulerType } from '@/core/scheduler';
import type { SrsV2SchedulingContext } from '@/core/scheduler/srs-v2';
import {
  buildLearningCurveEvidence,
  mapReviewLogV2ToLearningCurveHistory,
  type LearningCurveEvidenceResult,
  type LearningCurveEvidenceSuggestion,
} from '@/core/scheduler/learningCurveEvidence';
import { buildSchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import type { ArenaKernelService } from '@/application/services/ArenaKernelService';
import type { CardEditorSnapshot } from '@/application/services/CardEditorApplicationService';
import type { SrsTransparencyEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import { formatNextDue } from '@/application/helpers/formatNextDue';
import {
  resolveSchedulerTypeLabel,
  resolveSrsArenaContestantLabel,
} from '@/application/helpers/srsDisplayLabels';
import { CardState, Rating, type FSRSCard } from '@/types/card';
import type { SrsArenaRecommendation } from '@/types/arena';

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
  learningCurveEvidence: SrsTransparencyLearningCurveEvidence | null;
  reviewPreviewContextLabel: string | null;
  arenaRecommendation: SrsArenaRecommendation | null;
  arenaHint: string | null;
}

export type SrsTransparencyLearningCurveEvidence =
  | LearningCurveEvidenceResult
  | {
      status: 'unavailable';
      advisory: true;
      snapshotKey: string;
      cardId: string;
      sampleSize: 0;
      usableSampleSize: 0;
      confidence: 0;
      driftDirection: 'unknown';
      diagnostics: string[];
      suggestions: [];
    };

type BuildOptions = {
  now?: number;
  schedulingContext?: SrsV2SchedulingContext | null;
  t: Translator;
};

const GRADE_ORDER: readonly Rating[] = [
  Rating.Again,
  Rating.Hard,
  Rating.Good,
  Rating.Easy,
];

export class SrsTransparencyApplicationService {
  constructor(
    private readonly schedulerRouter: SchedulerRouterLike,
    private readonly arenaKernel?: Pick<ArenaKernelService, 'buildSrsRecommendation'> | null,
    private readonly evidenceReader?: SrsTransparencyEvidenceReader | null,
  ) {}

  async build(snapshot: CardEditorSnapshot, options: BuildOptions): Promise<SrsTransparencyViewModel> {
    const { card, blockInfo } = snapshot;
    const { t } = options;
    const now = options.now ?? Date.now();
    const schedulerType = this.schedulerRouter.getSchedulerType(card);
    const previewContext = options.schedulingContext || undefined;
    const previewNow = resolvePreviewNow(now, previewContext);
    const previews = previewContext
      ? this.schedulerRouter.preview(card, previewContext)
      : this.schedulerRouter.preview(card);
    const arenaRecommendation = await this.arenaKernel?.buildSrsRecommendation?.(card, schedulerType, now, {
      schedulingContext: previewContext,
    }) || null;
    const learningCurveEvidence = await this.buildLearningCurveEvidence(card, now, previewContext);

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
          nextDue: formatNextDue((previewCard.due || previewNow) - previewNow),
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
      algorithmFacts: buildAlgorithmFacts(card, schedulerType, t, arenaRecommendation, learningCurveEvidence),
      learningCurveEvidence,
      reviewPreviewContextLabel: arenaRecommendation?.schedulingContextLabel || (previewContext ? t('queueSchedulingContext', '队列上下文') : null),
      arenaRecommendation,
      arenaHint: buildArenaHint(arenaRecommendation, t),
    };
  }

  private async buildLearningCurveEvidence(
    card: FSRSCard,
    now: number,
    previewContext?: SrsV2SchedulingContext,
  ): Promise<SrsTransparencyLearningCurveEvidence | null> {
    if (!this.evidenceReader) {
      return null;
    }

    const snapshot = buildSchedulerStateSnapshot(card, {
      now,
      source: 'diagnostic',
      reviewTime: previewContext?.reviewTime ?? null,
      memoryStateAsOf: previewContext?.memoryStateAsOf ?? null,
    });
    try {
      const logs = await this.evidenceReader.readRecentReviewLogs({
        cardId: card.id,
        now,
      });
      return buildLearningCurveEvidence(
        snapshot,
        mapReviewLogV2ToLearningCurveHistory(logs),
        { now },
      );
    } catch {
      return {
        status: 'unavailable',
        advisory: true,
        snapshotKey: snapshot.snapshotKey,
        cardId: snapshot.cardId,
        sampleSize: 0,
        usableSampleSize: 0,
        confidence: 0,
        driftDirection: 'unknown',
        diagnostics: ['evidence-history-unavailable'],
        suggestions: [],
      };
    }
  }
}

function buildAlgorithmFacts(
  card: FSRSCard,
  schedulerType: SchedulerType,
  t: Translator,
  arenaRecommendation: SrsArenaRecommendation | null,
  learningCurveEvidence: SrsTransparencyLearningCurveEvidence | null,
): SrsTransparencyFact[] {
  const arenaFacts: SrsTransparencyFact[] = arenaRecommendation
    ? [
      {
        label: t(
          'arenaWeightedIntervalWithRating',
          `Arena 预判间隔（${resolveRatingLabel(arenaRecommendation.ratingBasis as Rating, t)}）`,
        ),
        value: formatDays(arenaRecommendation.weightedIntervalDays, t),
      },
      { label: t('arenaLeadingContestant', 'Arena 当前领先'), value: resolveSrsArenaContestantLabel(arenaRecommendation.leadingContestantId) },
      { label: t('arenaSchedulingContext', 'Arena 调度上下文'), value: arenaRecommendation.schedulingContextLabel },
      { label: t('arenaDiscrepancy', '与正式调度偏差'), value: `${Math.round(arenaRecommendation.discrepancyRatio * 100)}%` },
    ]
    : [];
  if (schedulerType === 'a-factor-v2') {
    const meta = card.schedulerMeta?.topic;
    return [
      { label: t('schedulerType', '调度器'), value: resolveSchedulerLabel(schedulerType, t) },
      { label: t('aFactor', 'A-Factor'), value: formatNumber(card.aFactor, 2) },
      { label: t('oFactor', 'O-Factor'), value: formatNumber(meta?.of, 2) },
      { label: t('optimalInterval', '最优间隔'), value: formatDays(meta?.optimalInterval, t) },
      { label: t('afHistory', 'AF 历史'), value: formatHistorySummary(meta?.afs, t) },
      ...arenaFacts,
      ...buildLearningCurveEvidenceFacts(learningCurveEvidence, t),
    ];
  }

  return [
    { label: t('schedulerType', '调度器'), value: resolveSchedulerLabel(schedulerType, t) },
    { label: t('algorithmBasis', '调度依据'), value: t('fsrsTransparencyBasis', '根据稳定度与难度预测间隔扩张，并对不同评分给出不同增长幅度。') },
    ...arenaFacts,
    ...buildLearningCurveEvidenceFacts(learningCurveEvidence, t),
  ];
}

function buildLearningCurveEvidenceFacts(
  evidence: SrsTransparencyLearningCurveEvidence | null,
  t: Translator,
): SrsTransparencyFact[] {
  if (!evidence) {
    return [];
  }

  const label = t('learningCurveEvidence', '学习曲线');
  if (evidence.status === 'unavailable') {
    return [{ label, value: t('learningCurveEvidenceUnavailable', '历史不可用') }];
  }

  if (evidence.status === 'insufficient-data') {
    return [{
      label,
      value: t('learningCurveEvidenceInsufficient', `数据不足（${evidence.sampleSize} 样本）`)
        .replace('{sampleSize}', String(evidence.sampleSize)),
    }];
  }

  if (evidence.status === 'low-quality-data') {
    return [{
      label,
      value: t('learningCurveEvidenceLowQuality', `数据质量不足（${evidence.sampleSize} 样本）`)
        .replace('{sampleSize}', String(evidence.sampleSize)),
    }];
  }

  return [
    {
      label,
      value: t(
        'learningCurveEvidenceReady',
        `${resolveLearningCurveDriftLabel(evidence.driftDirection, t)}（${evidence.usableSampleSize} 样本，${formatPercent(evidence.confidence)} 置信）`,
      )
        .replace('{drift}', resolveLearningCurveDriftLabel(evidence.driftDirection, t))
        .replace('{usableSampleSize}', String(evidence.usableSampleSize))
        .replace('{confidence}', formatPercent(evidence.confidence)),
    },
    ...evidence.suggestions.slice(0, 1).map((suggestion) => ({
      label: t('learningCurveEvidenceSuggestion', '学习曲线建议'),
      value: formatLearningCurveSuggestion(suggestion, t),
    })),
  ];
}

function resolveLearningCurveDriftLabel(
  direction: SrsTransparencyLearningCurveEvidence['driftDirection'],
  t: Translator,
): string {
  switch (direction) {
    case 'weaker-than-expected':
      return t('learningCurveWeakerThanExpected', '偏弱');
    case 'stronger-than-expected':
      return t('learningCurveStrongerThanExpected', '偏强');
    case 'stable':
      return t('learningCurveStable', '稳定');
    case 'unknown':
    default:
      return t('learningCurveUnknown', '未知');
  }
}

function formatLearningCurveSuggestion(
  suggestion: LearningCurveEvidenceSuggestion,
  t: Translator,
): string {
  switch (suggestion.kind) {
    case 'review-sooner-advisory':
      return t('learningCurveReviewSoonerAdvisory', '建议提前复习（仅诊断）');
    case 'review-later-advisory':
      return t('learningCurveReviewLaterAdvisory', '建议延后复习（仅诊断）');
    default:
      return t('learningCurveAdvisoryOnly', '仅诊断');
  }
}

function buildArenaHint(
  arenaRecommendation: SrsArenaRecommendation | null,
  t: Translator,
): string | null {
  if (!arenaRecommendation || !arenaRecommendation.shouldHighlight) {
    return null;
  }
  return t(
    'srsArenaHint',
    `Arena 按{rating}综合建议约 {weighted}，与当前正式调度相差 {gap}。`,
  )
    .replace('{rating}', resolveRatingLabel(arenaRecommendation.ratingBasis as Rating, t))
    .replace('{weighted}', `${arenaRecommendation.weightedIntervalDays.toFixed(1)} ${t('days', 'days')}`)
    .replace('{gap}', `${Math.round(arenaRecommendation.discrepancyRatio * 100)}%`);
}

function resolvePreviewNow(now: number, context?: SrsV2SchedulingContext | null): number {
  const reviewTime = context?.reviewTime instanceof Date
    ? context.reviewTime.getTime()
    : Number(context?.reviewTime);
  return Number.isFinite(reviewTime) && reviewTime > 0 ? reviewTime : now;
}

function resolveSchedulerLabel(schedulerType: SchedulerType, t: Translator): string {
  switch (schedulerType) {
    case 'a-factor-v2':
      return t('schedulerAFactorV2', 'A-Factor v2');
    case 'fsrs-v6':
    default:
      return t('schedulerFsrsV6', 'FSRS v6');
  }
}

function resolveSchedulerSummary(schedulerType: SchedulerType, t: Translator): string {
  switch (schedulerType) {
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

function formatPercent(value?: number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0%';
  }
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
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
