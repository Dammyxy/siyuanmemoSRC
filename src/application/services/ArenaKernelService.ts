import type { FSRSParameters } from '@/types/settings';
import type { SchedulerType } from '@/core/scheduler';
import { Rating, type FSRSCard } from '@/types/card';
import type { SrsTransparencyEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import { resolveSchedulerTypeLabel, resolveSrsArenaContestantLabel } from '@/application/helpers/srsDisplayLabels';
import {
  buildLearningCurveEvidence,
  mapReviewEventFactsToLearningCurveHistory,
  type LearningCurveEvidenceResult,
} from '@/core/scheduler/learningCurveEvidence';
import { mapReviewLogV2ToReviewEventFact } from '@/core/scheduler/reviewEventFact';
import { buildSchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import { TSFSRSScheduler } from '@/core/scheduler/strategies/TSFSRSScheduler';
import type {
  ArenaContestantContract,
  ArenaContestantPrediction as CoreArenaContestantPrediction,
  SchedulingChoice,
  SrsV2AlgorithmFamily,
  SrsV2SchedulingContext,
} from '@/core/scheduler/srs-v2';
import { buildMemoryAnchoredCard, resolveReviewDate } from '@/core/scheduler/srs-v2/time';
import { createLogger } from '@/utils/logger';
import {
  buildSrsArenaPoolKey,
  type AIArenaEventType,
  type AIArenaScenarioId,
  type AIArenaSelection,
  type AIStrategyPackDefinition,
  type ArenaChallengeTrigger,
  type ArenaDomain,
  type ArenaManagerState,
  type ArenaManagerViewModel,
  type ArenaOutcomeLabel,
  type ArenaPoolDescriptor,
  type ArenaScoreEntry,
  type ArenaScoreSnapshot,
  type ArenaSettings,
  type ArenaTargetKind,
  type ArenaMatchRecord,
  type SrsArenaLearningEvidenceDiagnostic,
  type SrsArenaContestantId,
  type SrsArenaContestantPrediction,
  type SrsArenaRecommendation,
} from '@/types/arena';
import { ArenaStoreService } from '@/application/services/ArenaStoreService';

const logger = createLogger('ArenaKernelService');
const DAY_MS = 24 * 60 * 60 * 1000;

type ArenaKernelDeps = {
  getArenaSettings: () => ArenaSettings;
  updateArenaSettings: (updater: (current: ArenaSettings) => ArenaSettings) => Promise<void>;
  getFsrsParams: () => FSRSParameters;
  arenaStore: ArenaStoreService;
  random?: () => number;
  evidenceReader?: SrsTransparencyEvidenceReader | null;
};

type AIPackEventInput = {
  selection: AIArenaSelection | null;
  eventType: AIArenaEventType;
  sessionId?: string | null;
  qualityLabel?: ArenaOutcomeLabel | null;
  cardIds?: string[];
  metadata?: Record<string, unknown>;
};

type SrsArenaRecommendationOptions = {
  ratingBasis?: Rating | number | null;
  schedulingContext?: SrsV2SchedulingContext | null;
};

type NormalizedSrsArenaPredictionContext = {
  ratingBasis: Rating;
  reviewDate: Date;
  reviewTime: number;
  schedulingContext: SrsV2SchedulingContext;
  schedulingContextLabel: string;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toIntervalDays(due: number, now: number): number {
  return Math.max(0, (Number(due) - now) / DAY_MS);
}

function toArenaAlgorithm(_contestantId: SrsArenaContestantId): SrsV2AlgorithmFamily | string {
  return 'memory-fsrs';
}

function nextCalibrationScore(entry: ArenaScoreEntry, predicted: number, actual: boolean): number {
  const previousSamples = Math.max(0, Number(entry.sampleCount) || 0);
  const previousRms = entry.score < 0 ? Math.abs(entry.score) : 0;
  const error = (actual ? 1 : 0) - clamp(predicted, 0, 1);
  const nextMse = ((previousRms * previousRms) * previousSamples + error * error) / (previousSamples + 1);
  return -Math.sqrt(nextMse);
}

function normalizeTargetKind(card: FSRSCard | null | undefined): Extract<ArenaTargetKind, 'item' | 'descriptor'> | null {
  const type = String(card?.type || '').trim();
  if (type === 'item') {
    return 'item';
  }
  if (type === 'descriptor') {
    return 'descriptor';
  }
  return null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toSrsArenaLearningEvidenceDiagnostic(
  evidence: LearningCurveEvidenceResult,
): SrsArenaLearningEvidenceDiagnostic {
  return {
    status: toSrsArenaLearningEvidenceStatus(evidence.status),
    advisory: true,
    snapshotKey: evidence.snapshotKey,
    cardId: evidence.cardId,
    sampleSize: evidence.sampleSize,
    usableSampleSize: evidence.usableSampleSize,
    observedRecallRate: evidence.observedRecallRate,
    expectedRetention: evidence.expectedRetention,
    calibrationGap: evidence.calibrationGap,
    confidence: evidence.confidence,
    driftDirection: evidence.driftDirection,
    exclusions: { ...evidence.exclusions },
    diagnostics: evidence.diagnostics.slice(),
    suggestions: evidence.suggestions.map((suggestion) => ({
      advisory: true,
      kind: suggestion.kind,
      confidence: suggestion.confidence,
      reasons: suggestion.reasons.slice(),
    })),
  };
}

function toSrsArenaLearningEvidenceStatus(status: LearningCurveEvidenceResult['status']): SrsArenaLearningEvidenceDiagnostic['status'] {
  switch (status) {
    case 'insufficient-data':
      return 'insufficient-history';
    case 'low-quality-data':
      return 'low-quality-history';
    case 'ready':
    default:
      return 'ready';
  }
}

export class ArenaKernelService {
  constructor(private readonly deps: ArenaKernelDeps) {}

  canRecordSrsReviewWithoutSiyuanFileWrite(): boolean {
    return this.deps.arenaStore.canRecordSrsReviewWithoutSiyuanFileWrite();
  }

  getArenaSettings(): ArenaSettings {
    return this.deps.getArenaSettings();
  }

  isEnabled(): boolean {
    return this.getArenaSettings().enabled === true;
  }

  async updateManagerState(patch: Partial<ArenaManagerState>): Promise<void> {
    void patch;
  }

  async pinStrategyPack(packId: string): Promise<void> {
    void packId;
  }

  async retireStrategyPack(packId: string): Promise<void> {
    void packId;
  }

  async reactivateStrategyPack(packId: string): Promise<void> {
    void packId;
  }

  async cloneStrategyPack(
    packId: string,
    input?: {
      title?: string;
      promptSuffix?: string;
    },
  ): Promise<AIStrategyPackDefinition | null> {
    void packId;
    void input;
    return null;
  }

  async generateChallengePack(poolKey: string): Promise<AIStrategyPackDefinition | null> {
    void poolKey;
    return null;
  }

  async selectAIPack(input: {
    surface: ArenaPoolDescriptor['surface'];
    scenarioId: AIArenaScenarioId | null | undefined;
    targetKind: ArenaTargetKind | null | undefined;
    skillId?: string | null;
    tabId?: string | null;
    sessionId?: string | null;
  }): Promise<AIArenaSelection | null> {
    void input;
    return null;
  }

  async recordAIEvent(input: AIPackEventInput): Promise<void> {
    void input;
  }

  async buildSrsRecommendation(
    card: FSRSCard,
    currentSchedulerType: SchedulerType | null | undefined,
    now = Date.now(),
    options: SrsArenaRecommendationOptions = {},
  ): Promise<SrsArenaRecommendation | null> {
    const targetKind = normalizeTargetKind(card);
    const settings = this.getArenaSettings();
    if (!settings.srs.enabled || !targetKind || !settings.srs.targetKinds.includes(targetKind)) {
      return null;
    }
    const predictionContext = this.normalizeSrsArenaPredictionContext(now, options);
    const poolKey = buildSrsArenaPoolKey(targetKind);
    const snapshot = await this.ensureSrsScoreSnapshot(poolKey, settings.srs.contestantIds);
    const weights = this.computeScoreWeights(snapshot.entries);
    const currentSchedulerLabel = resolveSchedulerTypeLabel(currentSchedulerType);
    const contestants = this.buildSrsPredictions(card, settings.srs.contestantIds, snapshot.entries, weights, predictionContext);
    const weightedIntervalDays = contestants.reduce((sum, contestant) => sum + contestant.intervalDays * contestant.weight, 0);
    const weightedDue = predictionContext.reviewTime + weightedIntervalDays * DAY_MS;
    const currentSchedulerPrediction = contestants.find((entry) => entry.contestantId === 'fsrs-v6');
    const currentSchedulerIntervalDays = currentSchedulerPrediction?.intervalDays || weightedIntervalDays;
    const discrepancyRatio = currentSchedulerIntervalDays > 0
      ? Math.abs(weightedIntervalDays - currentSchedulerIntervalDays) / Math.max(1, currentSchedulerIntervalDays)
      : 0;
    const discrepancyDays = Math.abs(weightedIntervalDays - currentSchedulerIntervalDays);
    const leadingContestantId = contestants.slice().sort((left, right) => right.score - left.score)[0]?.contestantId || null;
    const leadingLabel = leadingContestantId ? resolveSrsArenaContestantLabel(leadingContestantId) : currentSchedulerLabel;
    const sampleCount = snapshot.entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.sampleCount) || 0), 0);
    const minimumReviewsMet = sampleCount >= settings.srs.minimumReviewsForConfidence;
    const writeEnabled = settings.srs.advisoryOnly === false && minimumReviewsMet;
    const learningCurveEvidence = await this.buildSrsLearningEvidenceDiagnostic(
      card,
      now,
      predictionContext.schedulingContext,
    );
    return {
      poolKey,
      targetKind,
      leadingContestantId,
      ratingBasis: predictionContext.ratingBasis,
      schedulingContextLabel: predictionContext.schedulingContextLabel,
      weightedIntervalDays,
      weightedDue,
      currentSchedulerIntervalDays,
      discrepancyRatio,
      shouldHighlight: discrepancyRatio >= settings.srs.divergenceThresholdRatio && discrepancyDays >= 1,
      writeEnabled,
      minimumReviewsMet,
      learningCurveEvidence,
      summary: `Arena 当前更偏向 ${leadingLabel}，按${this.resolveRatingLabel(predictionContext.ratingBasis)}综合建议 ${weightedIntervalDays.toFixed(1)} 天；当前正式调度 ${currentSchedulerLabel} 约 ${currentSchedulerIntervalDays.toFixed(1)} 天。`,
      contestants,
    };
  }

  private async buildSrsLearningEvidenceDiagnostic(
    card: FSRSCard,
    now: number,
    schedulingContext?: SrsV2SchedulingContext | null,
  ): Promise<SrsArenaLearningEvidenceDiagnostic> {
    const snapshot = buildSchedulerStateSnapshot(card, {
      now,
      source: 'diagnostic',
      reviewTime: schedulingContext?.reviewTime ?? null,
      memoryStateAsOf: schedulingContext?.memoryStateAsOf ?? null,
    });
    const unavailable = (diagnostics: string[]): SrsArenaLearningEvidenceDiagnostic => ({
      status: 'unavailable',
      advisory: true,
      snapshotKey: snapshot.snapshotKey,
      cardId: snapshot.cardId,
      sampleSize: 0,
      usableSampleSize: 0,
      observedRecallRate: null,
      expectedRetention: null,
      calibrationGap: null,
      confidence: 0,
      driftDirection: 'unknown',
      exclusions: {
        nonFormal: 0,
        lowQuality: 0,
        missingSchedulerIdentity: 0,
        missingMemoryState: 0,
      },
      diagnostics,
      suggestions: [],
    });

    if (!this.deps.evidenceReader) {
      return unavailable(['evidence-reader-unavailable']);
    }

    try {
      const logs = await this.deps.evidenceReader.readRecentReviewLogs({
        cardId: card.id,
        now,
      });
      const mapped = mapReviewEventFactsToLearningCurveHistory(logs.map(mapReviewLogV2ToReviewEventFact));
      return toSrsArenaLearningEvidenceDiagnostic(buildLearningCurveEvidence(
        snapshot,
        mapped.history,
        { now, exclusions: mapped.exclusions },
      ));
    } catch {
      return unavailable(['evidence-history-unavailable']);
    }
  }

  async recordSrsReview(input: {
    card: FSRSCard;
    rating: number;
    currentSchedulerType: SchedulerType | null | undefined;
    schedulingContext?: SrsV2SchedulingContext | null;
  }): Promise<SrsArenaRecommendation | null> {
    const card = input.card;
    const rating = Math.max(1, Math.min(4, Math.floor(Number(input.rating) || 0))) as Rating;
    const targetKind = normalizeTargetKind(card);
    const settings = this.getArenaSettings();
    if (!settings.srs.enabled || !targetKind || !settings.srs.targetKinds.includes(targetKind)) {
      return null;
    }
    const now = Date.now();
    const poolKey = buildSrsArenaPoolKey(targetKind);
    const recommendation = await this.buildSrsRecommendation(card, input.currentSchedulerType, now, {
      ratingBasis: rating,
      schedulingContext: input.schedulingContext,
    });
    const snapshot = await this.ensureSrsScoreSnapshot(poolKey, settings.srs.contestantIds);
    const pass = rating >= Rating.Good;
    const attemptId = createId('srs-attempt');
    const weights = this.computeScoreWeights(snapshot.entries);
    const predictionContext = this.normalizeSrsArenaPredictionContext(now, {
      ratingBasis: rating,
      schedulingContext: input.schedulingContext,
    });
    const predictions = recommendation?.contestants
      || this.buildSrsPredictions(card, settings.srs.contestantIds, snapshot.entries, weights, predictionContext);
    const predictionsById = new Map(predictions.map((prediction) => [prediction.contestantId, prediction] as const));
    const predictionBatch = {
      poolKey,
      attemptId,
      cardId: card.id,
      createdAt: now,
      predictions,
    };
    const updatedEntries = snapshot.entries.map((entry) => {
      const prediction = predictionsById.get(entry.contestantId as SrsArenaContestantId)
        || this.buildSingleSrsPrediction(card, entry.contestantId as SrsArenaContestantId, entry, weights[entry.contestantId] || 0, predictionContext);
      return {
        ...entry,
        score: nextCalibrationScore(entry, prediction.predictedPassProbability, pass),
        sampleCount: entry.sampleCount + 1,
        lastEventAt: now,
      };
    });
    const winner = updatedEntries
      .map((entry) => {
        const prediction = predictionsById.get(entry.contestantId as SrsArenaContestantId)
          || this.buildSingleSrsPrediction(card, entry.contestantId as SrsArenaContestantId, entry, 0, predictionContext);
        const error = Math.abs((pass ? 1 : 0) - prediction.predictedPassProbability);
        return { entry, error };
      })
      .sort((left, right) => left.error - right.error)[0];
    if (winner) {
      winner.entry.winCount += 1;
      updatedEntries
        .filter((entry) => entry.contestantId !== winner.entry.contestantId)
        .forEach((entry) => {
          entry.lossCount += 1;
        });
    }
    const scoreSnapshot = {
      id: createId('arena-score'),
      domain: 'srs',
      poolKey,
      createdAt: now,
      entries: updatedEntries,
    } satisfies ArenaScoreSnapshot;
    const outcomes = predictions.map((prediction) => ({
        poolKey,
        attemptId,
        cardId: card.id,
        contestantId: prediction.contestantId,
        predictedRecall: prediction.predictedPassProbability,
        actualRecall: pass,
        rating,
        reviewedAt: now,
        payload: {
          attemptId,
          intervalDays: prediction.intervalDays,
          ratingBasis: recommendation?.ratingBasis || rating,
          schedulingContextLabel: recommendation?.schedulingContextLabel || '',
          discrepancyRatio: recommendation?.discrepancyRatio || 0,
          weightedIntervalDays: recommendation?.weightedIntervalDays || 0,
        },
    }));
    const match = {
      id: createId('arena-match'),
      domain: 'srs',
      poolKey,
      createdAt: now,
      targetKind,
      srs: {
        cardId: card.id,
        rating,
        pass,
        weightedIntervalDays: recommendation?.weightedIntervalDays || 0,
        currentSchedulerIntervalDays: recommendation?.currentSchedulerIntervalDays || 0,
        discrepancyRatio: recommendation?.discrepancyRatio || 0,
        leadingContestantId: recommendation?.leadingContestantId || null,
        contestantErrors: Object.fromEntries(updatedEntries.map((entry) => {
          const prediction = predictionsById.get(entry.contestantId as SrsArenaContestantId)
            || this.buildSingleSrsPrediction(card, entry.contestantId as SrsArenaContestantId, entry, 0, predictionContext);
          return [entry.contestantId, Math.abs((pass ? 1 : 0) - prediction.predictedPassProbability)];
        })),
      },
    } satisfies ArenaMatchRecord;
    await this.deps.arenaStore.recordSrsReviewBatch({
      predictions: predictionBatch,
      scoreSnapshot,
      outcomes,
      match,
    });
    await this.applyAttributedReviewFeedback(card.id, pass, rating);
    return recommendation;
  }

  async buildManagerView(): Promise<ArenaManagerViewModel> {
    const settings = this.getArenaSettings();
    const recentSrsMatches = await this.deps.arenaStore.listMatches({ domain: 'srs', limit: 40 });
    const scoreSnapshots = await this.deps.arenaStore.listScoreSnapshots();

    const srsPoolKeys = new Set<string>([
      ...settings.srs.targetKinds.map((targetKind) => buildSrsArenaPoolKey(targetKind)),
      ...recentSrsMatches.map((match) => match.poolKey),
      ...scoreSnapshots.filter((snapshot) => snapshot.domain === 'srs').map((snapshot) => snapshot.poolKey),
    ]);

    const srsScoreSnapshots: ArenaScoreSnapshot[] = [];
    const srsPools = await Promise.all(Array.from(srsPoolKeys).map(async (poolKey) => {
      const snapshot = await this.ensureSrsScoreSnapshot(poolKey, settings.srs.contestantIds);
      srsScoreSnapshots.push(snapshot);
      const [, targetKind] = poolKey.split('::');
      return {
        pool: {
          key: poolKey,
          targetKind: targetKind === 'descriptor' ? 'descriptor' : 'item',
        },
        topEntries: snapshot.entries.slice().sort((left, right) => right.score - left.score),
        totalEntries: snapshot.entries.length,
        latestMatchAt: recentSrsMatches.find((match) => match.poolKey === poolKey)?.createdAt || null,
        challenge: null,
      };
    }));
    const srsScoresByKey = new Map<string, ArenaScoreSnapshot>();
    for (const snapshot of scoreSnapshots.filter((entry) => entry.domain === 'srs')) {
      srsScoresByKey.set(snapshot.poolKey, snapshot);
    }
    for (const snapshot of srsScoreSnapshots) {
      srsScoresByKey.set(snapshot.poolKey, snapshot);
    }

    return {
      generatedAt: Date.now(),
      manager: settings.manager,
      ai: {
        pools: [],
        recentMatches: [],
        strategyPacks: [],
      },
      srs: {
        pools: srsPools.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        recentMatches: recentSrsMatches,
        scores: Array.from(srsScoresByKey.values()).sort((left, right) => right.createdAt - left.createdAt),
      },
    };
  }

  private async ensureSrsScoreSnapshot(
    poolKey: string,
    contestantIds: SrsArenaContestantId[],
  ): Promise<ArenaScoreSnapshot> {
    const latest = await this.deps.arenaStore.getLatestScoreSnapshot('srs', poolKey);
    const existingEntries = new Map((latest?.entries || []).map((entry) => [entry.contestantId, entry] as const));
    const entries: ArenaScoreEntry[] = contestantIds.map((contestantId) => ({
      contestantId,
      title: resolveSrsArenaContestantLabel(contestantId),
      weight: existingEntries.get(contestantId)?.weight || 1 / Math.max(1, contestantIds.length),
      score: existingEntries.get(contestantId)?.score || 0,
      sampleCount: existingEntries.get(contestantId)?.sampleCount || 0,
      winCount: existingEntries.get(contestantId)?.winCount || 0,
      lossCount: existingEntries.get(contestantId)?.lossCount || 0,
      lastEventAt: existingEntries.get(contestantId)?.lastEventAt || null,
    }));
    const snapshot: ArenaScoreSnapshot = {
      id: latest?.id || createId('arena-score'),
      domain: 'srs',
      poolKey,
      createdAt: latest?.createdAt || Date.now(),
      entries,
    };
    if (!latest || latest.entries.length !== entries.length) {
      await this.deps.arenaStore.replaceScoreSnapshot(snapshot);
    }
    return snapshot;
  }

  private computeScoreWeights(entries: ArenaScoreEntry[]): Record<string, number> {
    if (entries.length === 0) {
      return {};
    }
    const raw = entries.map((entry) => ({
      id: entry.contestantId,
      value: Math.max(0.15, 1 + entry.score / Math.max(1, entry.sampleCount || 1)),
    }));
    const total = raw.reduce((sum, entry) => sum + entry.value, 0) || 1;
    return Object.fromEntries(raw.map((entry) => [entry.id, entry.value / total]));
  }

  private normalizeSrsArenaPredictionContext(
    now: number,
    options: SrsArenaRecommendationOptions,
  ): NormalizedSrsArenaPredictionContext {
    const ratingBasis = this.normalizeRatingBasis(options.ratingBasis);
    const schedulingContext = {
      ...(options.schedulingContext || {}),
      reviewTime: options.schedulingContext?.reviewTime ?? now,
      source: options.schedulingContext?.source ?? 'arena',
    } satisfies SrsV2SchedulingContext;
    const reviewDate = resolveReviewDate(schedulingContext);
    return {
      ratingBasis,
      reviewDate,
      reviewTime: reviewDate.getTime(),
      schedulingContext,
      schedulingContextLabel: this.resolveSchedulingContextLabel(schedulingContext),
    };
  }

  private normalizeRatingBasis(value: Rating | number | null | undefined): Rating {
    const rating = Math.floor(Number(value));
    if (rating >= Rating.Again && rating <= Rating.Easy) {
      return rating as Rating;
    }
    return Rating.Good;
  }

  private resolveRatingLabel(rating: Rating): string {
    switch (rating) {
      case Rating.Again:
        return '重来';
      case Rating.Hard:
        return '困难';
      case Rating.Good:
        return '良好';
      case Rating.Easy:
      default:
        return '简单';
    }
  }

  private resolveSchedulingContextLabel(context: SrsV2SchedulingContext): string {
    if (context.memoryStateAsOf) {
      return '队列上下文（按到期日记忆锚点）';
    }
    if (context.isFiltered || context.customStudy) {
      return '筛选复习上下文';
    }
    if (context.queueType) {
      return '队列上下文';
    }
    return '默认上下文';
  }

  private buildSrsPredictions(
    card: FSRSCard,
    contestantIds: SrsArenaContestantId[],
    entries: ArenaScoreEntry[],
    weights: Record<string, number>,
    predictionContext: NormalizedSrsArenaPredictionContext,
  ): SrsArenaContestantPrediction[] {
    return contestantIds.map((contestantId) => {
      const entry = entries.find((candidate) => candidate.contestantId === contestantId) || {
        contestantId,
        title: resolveSrsArenaContestantLabel(contestantId),
        weight: 0,
        score: 0,
        sampleCount: 0,
        winCount: 0,
        lossCount: 0,
        lastEventAt: null,
      };
      return this.buildSingleSrsPrediction(card, contestantId, entry, weights[contestantId] || 0, predictionContext);
    });
  }

  private buildSingleSrsPrediction(
    card: FSRSCard,
    contestantId: SrsArenaContestantId,
    entry: ArenaScoreEntry,
    weight: number,
    predictionContext: NormalizedSrsArenaPredictionContext,
  ): SrsArenaContestantPrediction {
    const prediction = this.getSrsContestant(contestantId).predict(card, predictionContext.schedulingContext);
    const selectedChoice = prediction.choices.get(predictionContext.ratingBasis) || prediction.choices.get(Rating.Good);
    const retrievability = clamp(Number(prediction.attribution?.retrievability) || 0, 0, 1);
    return {
      contestantId,
      label: resolveSrsArenaContestantLabel(contestantId),
      score: entry.score,
      weight,
      confidence: prediction.confidence,
      retrievability,
      predictedPassProbability: retrievability,
      intervalDays: selectedChoice ? toIntervalDays(selectedChoice.due, predictionContext.reviewTime) : 0,
      due: selectedChoice ? selectedChoice.due : predictionContext.reviewTime,
      choices: this.serializeSrsArenaChoices(prediction.choices, predictionContext.reviewTime),
      explanation: prediction.explanation,
      attribution: prediction.attribution,
    };
  }

  private getSrsContestant(contestantId: SrsArenaContestantId): ArenaContestantContract {
    return {
      id: contestantId,
      predict: (card, context) => this.predictSrsContestant(card, contestantId, context),
    };
  }

  private predictSrsContestant(
    card: FSRSCard,
    contestantId: SrsArenaContestantId,
    context: SrsV2SchedulingContext,
  ): CoreArenaContestantPrediction {
    const nowDate = resolveReviewDate(context);
    const now = nowDate.getTime();
    const scheduler = this.getSrsScheduler(contestantId);
    const anchoredCard = buildMemoryAnchoredCard(card, nowDate, context);
    const preview = scheduler.preview(anchoredCard, nowDate);
    const choices = new Map<Rating, SchedulingChoice>();

    for (const [rating, choiceCard] of preview.entries()) {
      choices.set(rating, {
        rating,
        card: choiceCard,
        due: Number(choiceCard.due) || now,
        scheduledDays: Math.max(0, Number(choiceCard.scheduledDays) || 0),
        state: choiceCard.state,
        schedulerType: contestantId as SchedulerType,
        algorithm: toArenaAlgorithm(contestantId) as SrsV2AlgorithmFamily,
        generatedAt: now,
        intervalMs: Math.max(0, (Number(choiceCard.due) || now) - now),
        stability: Math.max(0, Number(choiceCard.stability) || 0),
        difficulty: Number(choiceCard.difficulty) || 0,
      });
    }

    const retrievability = clamp(scheduler.getRetrievability(anchoredCard, nowDate), 0, 1);
    return {
      contestantId,
      algorithm: toArenaAlgorithm(contestantId),
      schedulerType: contestantId,
      choices,
      confidence: clamp(retrievability, 0.05, 0.95),
      explanation: `${resolveSrsArenaContestantLabel(contestantId)} shadow prediction`,
      attribution: {
        retrievability,
        advisoryOnly: true,
        source: 'srs-arena-contestant-contract',
        parameterHash: 'settings.fsrs',
      },
    };
  }

  private serializeSrsArenaChoices(
    choices: Map<Rating, SchedulingChoice>,
    now: number,
  ): SrsArenaContestantPrediction['choices'] {
    return Array.from(choices.values()).map((choice) => ({
      rating: choice.rating,
      due: choice.due,
      intervalDays: toIntervalDays(choice.due, now),
      state: choice.state,
      stability: choice.stability,
      difficulty: choice.difficulty,
    }));
  }

  private getSrsScheduler(_contestantId: SrsArenaContestantId) {
    const params = this.deps.getFsrsParams();
    return new TSFSRSScheduler(params);
  }

  private async applyAttributedReviewFeedback(cardId: string, pass: boolean, rating: number): Promise<void> {
    void cardId;
    void pass;
    void rating;
  }
}
