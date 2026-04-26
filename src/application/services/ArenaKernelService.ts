import type { FSRSParameters } from '@/types/settings';
import type { SchedulerType } from '@/core/scheduler';
import { Rating, type FSRSCard } from '@/types/card';
import type { AIChatRegisteredSkillDescriptor } from '@/application/services/AIChatSkillRegistry';
import { resolveSchedulerTypeLabel, resolveSrsArenaContestantLabel } from '@/application/helpers/srsDisplayLabels';
import { SM15Scheduler } from '@/core/scheduler/strategies/SM15Scheduler';
import { SM2ReadOnlyScheduler } from '@/core/scheduler/strategies/SM2ReadOnlyScheduler';
import { TSFSRSScheduler } from '@/core/scheduler/strategies/TSFSRSScheduler';
import { createLogger } from '@/utils/logger';
import {
  buildArenaPoolKey,
  buildSrsArenaPoolKey,
  parseArenaPoolKey,
  type AIArenaEventType,
  type AIArenaScenarioId,
  type AIArenaSelection,
  type AIStrategyPackDefinition,
  type ArenaChallengeReason,
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
  type SrsArenaContestantId,
  type SrsArenaContestantPrediction,
  type SrsArenaRecommendation,
} from '@/types/arena';
import { ArenaStoreService } from '@/application/services/ArenaStoreService';

const logger = createLogger('ArenaKernelService');
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ArenaSkillRuntimeOverrides {
  selectedPackId: string | null;
  selectedPackTitle: string | null;
  composerPreset?: string;
  systemPromptTemplate?: string;
  defaultToolGroups?: string[];
  executionPolicies?: Record<string, string>;
  resultApprovalPolicies?: Record<string, string>;
  tabRunPrompts?: Partial<Record<string, string>>;
  tabFollowUpPrompts?: Partial<Record<string, string>>;
  challengeTrigger?: ArenaChallengeTrigger | null;
  challengers?: Array<{ id: string; title: string }>;
}

type ArenaKernelDeps = {
  getArenaSettings: () => ArenaSettings;
  updateArenaSettings: (updater: (current: ArenaSettings) => ArenaSettings) => Promise<void>;
  getFsrsParams: () => FSRSParameters;
  arenaStore: ArenaStoreService;
  random?: () => number;
};

type AIPackEventInput = {
  selection: AIArenaSelection | null;
  eventType: AIArenaEventType;
  sessionId?: string | null;
  qualityLabel?: ArenaOutcomeLabel | null;
  cardIds?: string[];
  metadata?: Record<string, unknown>;
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

function toQualityDelta(label: ArenaOutcomeLabel): number {
  switch (label) {
    case 'off-target':
      return -1;
    case 'needs-refactor':
      return -3;
    case 'strong':
      return 2;
    case 'usable':
    default:
      return 1.5;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ArenaKernelService {
  constructor(private readonly deps: ArenaKernelDeps) {}

  getArenaSettings(): ArenaSettings {
    return this.deps.getArenaSettings();
  }

  isEnabled(): boolean {
    return this.getArenaSettings().enabled === true;
  }

  async updateManagerState(patch: Partial<ArenaManagerState>): Promise<void> {
    await this.deps.updateArenaSettings((current) => ({
      ...current,
      manager: {
        ...current.manager,
        ...patch,
      },
    }));
  }

  async pinStrategyPack(packId: string): Promise<void> {
    await this.updateStrategyPack(packId, (pack) => ({ ...pack, state: 'pinned', updatedAt: Date.now() }));
  }

  async retireStrategyPack(packId: string): Promise<void> {
    await this.updateStrategyPack(packId, (pack) => ({ ...pack, state: 'retired', updatedAt: Date.now() }));
  }

  async reactivateStrategyPack(packId: string): Promise<void> {
    await this.updateStrategyPack(packId, (pack) => ({ ...pack, state: 'active', updatedAt: Date.now() }));
  }

  async cloneStrategyPack(
    packId: string,
    input?: {
      title?: string;
      promptSuffix?: string;
    },
  ): Promise<AIStrategyPackDefinition | null> {
    const settings = this.getArenaSettings();
    const base = settings.ai.strategyPacks.find((pack) => pack.id === normalizeString(packId));
    if (!base) {
      return null;
    }
    const clonePack: AIStrategyPackDefinition = {
      ...clone(base),
      id: createId('arena-pack'),
      title: normalizeString(input?.title) || `${base.title} Variant`,
      source: 'user',
      state: 'active',
      promptOverrides: {
        ...(base.promptOverrides || {}),
        appendSystemPrompt: [
          normalizeString(base.promptOverrides?.appendSystemPrompt),
          normalizeString(input?.promptSuffix),
        ].filter(Boolean).join('\n\n') || undefined,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sampleHint: '用户克隆策略包',
    };
    await this.deps.updateArenaSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        strategyPacks: [...current.ai.strategyPacks, clonePack],
      },
    }));
    return clonePack;
  }

  async generateChallengePack(poolKey: string): Promise<AIStrategyPackDefinition | null> {
    const pool = parseArenaPoolKey(poolKey);
    if (!pool) {
      return null;
    }
    const settings = this.getArenaSettings();
    const packs = this.listEligiblePacks(pool, settings);
    if (packs.length === 0) {
      return null;
    }
    const champion = await this.getLeadingPack(pool.key, packs);
    const negativeMatches = (await this.deps.arenaStore.listMatches({
      domain: 'ai',
      poolKey: pool.key,
      limit: 8,
    })).filter((match) => (match.ai?.scoreDelta || 0) < 0);
    const failureHints = negativeMatches
      .map((match) => normalizeString(match.ai?.metadata?.reason || match.ai?.metadata?.note || match.ai?.qualityLabel))
      .filter(Boolean)
      .slice(0, 4);
    return this.cloneStrategyPack(champion?.id || packs[0].id, {
      title: `${champion?.title || packs[0].title} Challenger`,
      promptSuffix: [
        '这是一个竞技场挑战者变体。',
        failureHints.length > 0
          ? `请显式避免这些失败模式：${failureHints.join('；')}`
          : '请在保留原策略优点的同时，进一步降低编辑成本并提升长期记忆友好度。',
      ].join('\n'),
    });
  }

  async selectAIPack(input: {
    surface: ArenaPoolDescriptor['surface'];
    scenarioId: AIArenaScenarioId | null | undefined;
    targetKind: ArenaTargetKind | null | undefined;
    skillId?: string | null;
    tabId?: string | null;
    sessionId?: string | null;
  }): Promise<AIArenaSelection | null> {
    const settings = this.getArenaSettings();
    const scenarioId = input.scenarioId;
    const targetKind = input.targetKind;
    if (
      !this.isEnabled()
      || !settings.ai.enabled
      || !scenarioId
      || !targetKind
      || !settings.ai.surfaces.includes(input.surface)
      || settings.ai.scenarios[scenarioId]?.enabled === false
    ) {
      return null;
    }

    const pool: ArenaPoolDescriptor = {
      key: buildArenaPoolKey({
        surface: input.surface,
        scenarioId,
        targetKind,
        skillId: input.skillId as ArenaPoolDescriptor['skillId'],
        tabId: input.tabId as ArenaPoolDescriptor['tabId'],
      }),
      surface: input.surface,
      scenarioId,
      targetKind,
      skillId: (normalizeString(input.skillId) || null) as ArenaPoolDescriptor['skillId'],
      tabId: (normalizeString(input.tabId) || null) as ArenaPoolDescriptor['tabId'],
    };

    const packs = this.listEligiblePacks(pool, settings);
    if (packs.length === 0) {
      return null;
    }

    const snapshot = await this.ensureAiScoreSnapshot(pool.key, packs);
    const candidateEntries = snapshot.entries.filter((entry) => packs.some((pack) => pack.id === entry.contestantId));
    const pinnedPacks = packs.filter((pack) => pack.state === 'pinned');
    const weights = this.computeAiWeights(candidateEntries, settings.ai.explorationRate, pinnedPacks.map((pack) => pack.id));
    const selectedPack = pinnedPacks[0] || this.pickByWeight(
      packs,
      (pack) => weights[pack.id] ?? 0,
    );
    const challengers = candidateEntries
      .filter((entry) => entry.contestantId !== selectedPack.id)
      .sort((left, right) => right.score - left.score)
      .slice(0, settings.ai.challenge.cloneVariantLimit)
      .map((entry) => packs.find((pack) => pack.id === entry.contestantId))
      .filter((pack): pack is AIStrategyPackDefinition => Boolean(pack));
    const trigger = await this.buildChallengeTrigger(pool, snapshot, selectedPack.id, challengers.map((pack) => pack.id));
    const selection: AIArenaSelection = {
      exposureId: createId('arena-exposure'),
      pool,
      pack: clone(selectedPack),
      challengers: challengers.map((pack) => clone(pack)),
      trigger,
      weights,
      selectedAt: Date.now(),
    };
    await this.deps.arenaStore.appendMatch({
      id: createId('arena-match'),
      domain: 'ai',
      poolKey: pool.key,
      createdAt: selection.selectedAt,
      surface: pool.surface,
      scenarioId: pool.scenarioId,
      targetKind: pool.targetKind,
      ai: {
        exposureId: selection.exposureId,
        sessionId: normalizeString(input.sessionId) || null,
        packId: selection.pack.id,
        challengerPackIds: selection.challengers.map((pack) => pack.id),
        skillId: pool.skillId,
        tabId: pool.tabId,
        eventType: 'exposure',
        scoreDelta: 0,
      },
    });
    return selection;
  }

  resolveSkillRuntimeOverrides(
    selection: AIArenaSelection | null,
    skill: AIChatRegisteredSkillDescriptor,
  ): ArenaSkillRuntimeOverrides {
    if (!selection) {
      return {
        selectedPackId: null,
        selectedPackTitle: null,
        challengeTrigger: null,
        challengers: [],
      };
    }
    const pack = selection.pack;
    const systemPromptTemplate = [
      normalizeString(pack.promptOverrides?.prependSystemPrompt),
      normalizeString(skill.systemPromptTemplate),
      normalizeString(pack.promptOverrides?.appendSystemPrompt),
    ].filter(Boolean).join('\n\n');
    return {
      selectedPackId: pack.id,
      selectedPackTitle: pack.title,
      composerPreset: normalizeString(pack.promptOverrides?.composerPreset) || undefined,
      systemPromptTemplate: systemPromptTemplate || skill.systemPromptTemplate,
      defaultToolGroups: pack.toolPolicyOverrides?.enabledToolGroups || skill.defaultToolGroups,
      executionPolicies: pack.toolPolicyOverrides?.executionPolicies as Record<string, string> | undefined,
      resultApprovalPolicies: pack.toolPolicyOverrides?.resultApprovalPolicies as Record<string, string> | undefined,
      tabRunPrompts: clone(pack.promptOverrides?.tabRunPrompts || {}),
      tabFollowUpPrompts: clone(pack.promptOverrides?.tabFollowUpPrompts || {}),
      challengeTrigger: selection.trigger || null,
      challengers: selection.challengers.map((challenger) => ({ id: challenger.id, title: challenger.title })),
    };
  }

  async recordAIEvent(input: AIPackEventInput): Promise<void> {
    if (!this.isEnabled() || !input.selection) {
      return;
    }
    const scoreDelta = this.resolveAIScoreDelta(input.eventType, input.qualityLabel);
    await this.deps.arenaStore.appendMatch({
      id: createId('arena-match'),
      domain: 'ai',
      poolKey: input.selection.pool.key,
      createdAt: Date.now(),
      surface: input.selection.pool.surface,
      scenarioId: input.selection.pool.scenarioId,
      targetKind: input.selection.pool.targetKind,
      ai: {
        exposureId: input.selection.exposureId,
        sessionId: normalizeString(input.sessionId) || null,
        packId: input.selection.pack.id,
        challengerPackIds: input.selection.challengers.map((pack) => pack.id),
        skillId: input.selection.pool.skillId,
        tabId: input.selection.pool.tabId,
        eventType: input.eventType,
        scoreDelta,
        qualityLabel: input.qualityLabel || null,
        cardIds: input.cardIds,
        metadata: input.metadata,
      },
    });
    if (scoreDelta !== 0) {
      await this.applyPackScoreDelta(input.selection.pool.key, input.selection.pack.id, input.selection.pack.title, scoreDelta);
    }
    if (input.cardIds && input.cardIds.length > 0 && (input.eventType === 'create' || input.eventType === 'accept')) {
      for (const cardId of input.cardIds.map((entry) => normalizeString(entry)).filter(Boolean)) {
        await this.deps.arenaStore.upsertAttribution({
          cardId,
          poolKey: input.selection.pool.key,
          surface: input.selection.pool.surface,
          scenarioId: input.selection.pool.scenarioId,
          targetKind: input.selection.pool.targetKind,
          sourcePackId: input.selection.pack.id,
          sourcePackTitle: input.selection.pack.title,
          exposureId: input.selection.exposureId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          reviewCount: 0,
          lastReviewAt: null,
          lastOutcome: null,
        });
      }
    }
  }

  async buildSrsRecommendation(
    card: FSRSCard,
    currentSchedulerType: SchedulerType | null | undefined,
    now = Date.now(),
  ): Promise<SrsArenaRecommendation | null> {
    const targetKind = normalizeTargetKind(card);
    const settings = this.getArenaSettings();
    if (!this.isEnabled() || !settings.srs.enabled || !targetKind || !settings.srs.targetKinds.includes(targetKind)) {
      return null;
    }
    const poolKey = buildSrsArenaPoolKey(targetKind);
    const params = this.deps.getFsrsParams();
    const snapshot = await this.ensureSrsScoreSnapshot(poolKey, settings.srs.contestantIds);
    const weights = this.computeScoreWeights(snapshot.entries);
    const currentSchedulerLabel = resolveSchedulerTypeLabel(currentSchedulerType);
    const contestants = this.buildSrsPredictions(card, settings.srs.contestantIds, snapshot.entries, weights, now);
    const weightedIntervalDays = contestants.reduce((sum, contestant) => sum + contestant.intervalDays * contestant.weight, 0);
    const weightedDue = now + weightedIntervalDays * DAY_MS;
    const currentSchedulerPrediction = currentSchedulerType === 'sm15'
      ? contestants.find((entry) => entry.contestantId === 'sm15')
      : contestants.find((entry) => entry.contestantId === 'fsrs-v6');
    const currentSchedulerIntervalDays = currentSchedulerPrediction?.intervalDays || weightedIntervalDays;
    const discrepancyRatio = currentSchedulerIntervalDays > 0
      ? Math.abs(weightedIntervalDays - currentSchedulerIntervalDays) / Math.max(1, currentSchedulerIntervalDays)
      : 0;
    const leadingContestantId = contestants.slice().sort((left, right) => right.score - left.score)[0]?.contestantId || null;
    const leadingLabel = leadingContestantId ? resolveSrsArenaContestantLabel(leadingContestantId) : currentSchedulerLabel;
    return {
      poolKey,
      targetKind,
      leadingContestantId,
      weightedIntervalDays,
      weightedDue,
      currentSchedulerIntervalDays,
      discrepancyRatio,
      shouldHighlight: discrepancyRatio >= settings.srs.divergenceThresholdRatio,
      summary: `Arena 当前更偏向 ${leadingLabel}，综合建议 ${weightedIntervalDays.toFixed(1)} 天；当前正式调度 ${currentSchedulerLabel} 约 ${currentSchedulerIntervalDays.toFixed(1)} 天。`,
      contestants,
    };
  }

  async recordSrsReview(input: {
    card: FSRSCard;
    rating: number;
    currentSchedulerType: SchedulerType | null | undefined;
  }): Promise<SrsArenaRecommendation | null> {
    const card = input.card;
    const rating = Math.max(1, Math.min(4, Math.floor(Number(input.rating) || 0))) as Rating;
    const targetKind = normalizeTargetKind(card);
    const settings = this.getArenaSettings();
    if (!this.isEnabled() || !settings.srs.enabled || !targetKind || !settings.srs.targetKinds.includes(targetKind)) {
      return null;
    }
    const now = Date.now();
    const poolKey = buildSrsArenaPoolKey(targetKind);
    const recommendation = await this.buildSrsRecommendation(card, input.currentSchedulerType, now);
    const snapshot = await this.ensureSrsScoreSnapshot(poolKey, settings.srs.contestantIds);
    const pass = rating >= Rating.Good;
    const updatedEntries = snapshot.entries.map((entry) => {
      const prediction = this.buildSingleSrsPrediction(card, entry.contestantId as SrsArenaContestantId, entry, this.computeScoreWeights(snapshot.entries)[entry.contestantId] || 0, now);
      const error = Math.abs((pass ? 1 : 0) - prediction.predictedPassProbability);
      return {
        ...entry,
        score: entry.score + (1 - error * 2),
        sampleCount: entry.sampleCount + 1,
        lastEventAt: now,
      };
    });
    const winner = updatedEntries
      .map((entry) => {
        const prediction = this.buildSingleSrsPrediction(card, entry.contestantId as SrsArenaContestantId, entry, 0, now);
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
    await this.deps.arenaStore.replaceScoreSnapshot({
      id: createId('arena-score'),
      domain: 'srs',
      poolKey,
      createdAt: now,
      entries: updatedEntries,
    });
    await this.deps.arenaStore.appendMatch({
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
          const prediction = this.buildSingleSrsPrediction(card, entry.contestantId as SrsArenaContestantId, entry, 0, now);
          return [entry.contestantId, Math.abs((pass ? 1 : 0) - prediction.predictedPassProbability)];
        })),
      },
    });
    await this.applyAttributedReviewFeedback(card.id, pass, rating);
    return recommendation;
  }

  async buildManagerView(): Promise<ArenaManagerViewModel> {
    const settings = this.getArenaSettings();
    const recentAiMatches = await this.deps.arenaStore.listMatches({ domain: 'ai', limit: 40 });
    const recentSrsMatches = await this.deps.arenaStore.listMatches({ domain: 'srs', limit: 40 });
    const scoreSnapshots = await this.deps.arenaStore.listScoreSnapshots();

    const aiPoolKeys = new Set<string>([
      ...recentAiMatches.map((match) => match.poolKey),
      ...scoreSnapshots.filter((snapshot) => snapshot.domain === 'ai').map((snapshot) => snapshot.poolKey),
    ]);
    const srsPoolKeys = new Set<string>([
      ...recentSrsMatches.map((match) => match.poolKey),
      ...scoreSnapshots.filter((snapshot) => snapshot.domain === 'srs').map((snapshot) => snapshot.poolKey),
    ]);

    const aiPools = await Promise.all(Array.from(aiPoolKeys).map(async (poolKey) => {
      const parsed = parseArenaPoolKey(poolKey);
      if (!parsed) {
        return null;
      }
      const packs = this.listEligiblePacks(parsed, settings);
      const snapshot = await this.ensureAiScoreSnapshot(poolKey, packs);
      const trigger = await this.buildChallengeTrigger(parsed, snapshot, snapshot.entries[0]?.contestantId || '', snapshot.entries.slice(1, 4).map((entry) => entry.contestantId));
      return {
        pool: parsed,
        topEntries: snapshot.entries.slice().sort((left, right) => right.score - left.score).slice(0, 5),
        totalEntries: snapshot.entries.length,
        latestMatchAt: recentAiMatches.find((match) => match.poolKey === poolKey)?.createdAt || null,
        challenge: trigger,
      };
    }));

    const srsPools = await Promise.all(Array.from(srsPoolKeys).map(async (poolKey) => {
      const snapshot = scoreSnapshots.find((entry) => entry.domain === 'srs' && entry.poolKey === poolKey)
        || await this.deps.arenaStore.getLatestScoreSnapshot('srs', poolKey);
      if (!snapshot) {
        return null;
      }
      const [, targetKind] = poolKey.split('::');
      return {
        pool: {
          key: poolKey,
          targetKind: targetKind === 'descriptor' ? 'descriptor' : 'item',
        },
        topEntries: snapshot.entries.slice().sort((left, right) => right.score - left.score).slice(0, 5),
        totalEntries: snapshot.entries.length,
        latestMatchAt: recentSrsMatches.find((match) => match.poolKey === poolKey)?.createdAt || null,
        challenge: null,
      };
    }));

    return {
      generatedAt: Date.now(),
      manager: settings.manager,
      ai: {
        pools: aiPools.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        recentMatches: recentAiMatches,
        strategyPacks: clone(settings.ai.strategyPacks),
      },
      srs: {
        pools: srsPools.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        recentMatches: recentSrsMatches,
        scores: scoreSnapshots.filter((entry) => entry.domain === 'srs'),
      },
    };
  }

  private async updateStrategyPack(
    packId: string,
    updater: (pack: AIStrategyPackDefinition) => AIStrategyPackDefinition,
  ): Promise<void> {
    const normalizedPackId = normalizeString(packId);
    if (!normalizedPackId) {
      return;
    }
    await this.deps.updateArenaSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        strategyPacks: current.ai.strategyPacks.map((pack) => (
          pack.id === normalizedPackId ? updater(clone(pack)) : pack
        )),
      },
    }));
  }

  private listEligiblePacks(pool: ArenaPoolDescriptor, settings: ArenaSettings): AIStrategyPackDefinition[] {
    return settings.ai.strategyPacks.filter((pack) => (
      pack.state !== 'retired'
      && pack.state !== 'disabled'
      && pack.eligibleScenarios.includes(pool.scenarioId)
      && (!pack.skillId || pack.skillId === pool.skillId)
      && (!pack.tabId || !pool.tabId || pack.tabId === pool.tabId)
    ));
  }

  private async getLeadingPack(poolKey: string, packs: AIStrategyPackDefinition[]): Promise<AIStrategyPackDefinition | null> {
    const snapshot = await this.ensureAiScoreSnapshot(poolKey, packs);
    const leader = snapshot.entries.slice().sort((left, right) => right.score - left.score)[0];
    return packs.find((pack) => pack.id === leader?.contestantId) || packs[0] || null;
  }

  private async ensureAiScoreSnapshot(poolKey: string, packs: AIStrategyPackDefinition[]): Promise<ArenaScoreSnapshot> {
    const latest = await this.deps.arenaStore.getLatestScoreSnapshot('ai', poolKey);
    const existingEntries = new Map((latest?.entries || []).map((entry) => [entry.contestantId, entry] as const));
    const entries: ArenaScoreEntry[] = packs.map((pack) => ({
      contestantId: pack.id,
      title: pack.title,
      weight: existingEntries.get(pack.id)?.weight || 1 / Math.max(1, packs.length),
      score: existingEntries.get(pack.id)?.score || 0,
      sampleCount: existingEntries.get(pack.id)?.sampleCount || 0,
      winCount: existingEntries.get(pack.id)?.winCount || 0,
      lossCount: existingEntries.get(pack.id)?.lossCount || 0,
      lastEventAt: existingEntries.get(pack.id)?.lastEventAt || null,
    }));
    const snapshot: ArenaScoreSnapshot = {
      id: latest?.id || createId('arena-score'),
      domain: 'ai',
      poolKey,
      createdAt: latest?.createdAt || Date.now(),
      entries,
    };
    if (!latest || latest.entries.length !== entries.length) {
      await this.deps.arenaStore.replaceScoreSnapshot(snapshot);
    }
    return snapshot;
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

  private computeAiWeights(
    entries: ArenaScoreEntry[],
    explorationRate: number,
    pinnedIds: string[],
  ): Record<string, number> {
    if (entries.length === 0) {
      return {};
    }
    if (pinnedIds.length > 0) {
      const weight = 1 / pinnedIds.length;
      return Object.fromEntries(pinnedIds.map((id) => [id, weight]));
    }
    const baseWeights = entries.map((entry) => {
      const exploitation = Math.max(0.12, 1 + entry.score);
      const exploration = entry.sampleCount < 3 ? explorationRate * (3 - entry.sampleCount + 1) : explorationRate;
      return {
        id: entry.contestantId,
        value: exploitation + exploration,
      };
    });
    const sum = baseWeights.reduce((acc, entry) => acc + entry.value, 0) || 1;
    return Object.fromEntries(baseWeights.map((entry) => [entry.id, entry.value / sum]));
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

  private pickByWeight<T>(items: T[], resolveWeight: (item: T) => number): T {
    const random = this.deps.random || Math.random;
    const weighted = items.map((item) => ({
      item,
      weight: Math.max(0, resolveWeight(item)),
    }));
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) {
      return items[0];
    }
    const target = random() * total;
    let cursor = 0;
    for (const entry of weighted) {
      cursor += entry.weight;
      if (target <= cursor) {
        return entry.item;
      }
    }
    return weighted[weighted.length - 1].item;
  }

  private async buildChallengeTrigger(
    pool: ArenaPoolDescriptor,
    snapshot: ArenaScoreSnapshot,
    selectedPackId: string,
    challengerPackIds: string[],
  ): Promise<ArenaChallengeTrigger | null> {
    const settings = this.getArenaSettings();
    const entries = snapshot.entries.slice().sort((left, right) => right.score - left.score);
    const top = entries[0];
    const second = entries[1];
    const reasons: ArenaChallengeReason[] = [];
    if (!top || top.sampleCount < settings.ai.challenge.minSamples) {
      reasons.push('low-confidence');
    }
    if (top && second && Math.abs(top.score - second.score) < settings.ai.challenge.scoreGapForConfidence) {
      reasons.push('high-disagreement');
    }
    const recentNegativeCount = (await this.deps.arenaStore.listMatches({
      domain: 'ai',
      poolKey: pool.key,
      limit: 6,
    })).filter((match) => (
      match.ai?.packId === selectedPackId
      && (match.ai?.scoreDelta || 0) < 0
      && match.ai?.eventType !== 'exposure'
    )).length;
    if (recentNegativeCount >= settings.ai.challenge.consecutiveNegativeThreshold) {
      reasons.push('repeated-dissatisfaction');
    }
    if (reasons.length === 0 || settings.ai.challenge.explicitTriggerEnabled === false) {
      return null;
    }
    return {
      triggered: true,
      reasons,
      challengerPackIds: challengerPackIds.slice(0, settings.ai.challenge.cloneVariantLimit),
      summary: `Arena 检测到${reasons.join('、')}，建议显式露出挑战者。`,
      detectedAt: Date.now(),
    };
  }

  private resolveAIScoreDelta(eventType: AIArenaEventType, qualityLabel?: ArenaOutcomeLabel | null): number {
    if (qualityLabel) {
      return eventType === 'judge' ? toQualityDelta(qualityLabel) * 0.35 : toQualityDelta(qualityLabel);
    }
    switch (eventType) {
      case 'accept':
        return 1.5;
      case 'create':
        return 2;
      case 'manual-bad':
        return -3;
      case 'edit':
        return -0.5;
      case 'rerun':
        return -1;
      case 'abandon':
        return -1.5;
      case 'judge':
        return 0.25;
      case 'exposure':
      default:
        return 0;
    }
  }

  private async applyPackScoreDelta(
    poolKey: string,
    packId: string,
    title: string,
    scoreDelta: number,
  ): Promise<void> {
    const pool = parseArenaPoolKey(poolKey);
    const settings = this.getArenaSettings();
    const packs = pool ? this.listEligiblePacks(pool, settings) : settings.ai.strategyPacks.filter((entry) => entry.id === packId);
    const snapshot = await this.ensureAiScoreSnapshot(poolKey, packs.length > 0 ? packs : [{
      id: packId,
      title,
      source: 'ai-generated',
      state: 'active',
      eligibleScenarios: [],
    }]);
    const entries = snapshot.entries.map((entry) => (
      entry.contestantId === packId
        ? {
          ...entry,
          title,
          score: entry.score + scoreDelta,
          sampleCount: entry.sampleCount + 1,
          winCount: entry.winCount + (scoreDelta > 0 ? 1 : 0),
          lossCount: entry.lossCount + (scoreDelta < 0 ? 1 : 0),
          lastEventAt: Date.now(),
        }
        : entry
    ));
    await this.deps.arenaStore.replaceScoreSnapshot({
      ...snapshot,
      id: createId('arena-score'),
      createdAt: Date.now(),
      entries,
    });
  }

  private buildSrsPredictions(
    card: FSRSCard,
    contestantIds: SrsArenaContestantId[],
    entries: ArenaScoreEntry[],
    weights: Record<string, number>,
    now: number,
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
      return this.buildSingleSrsPrediction(card, contestantId, entry, weights[contestantId] || 0, now);
    });
  }

  private buildSingleSrsPrediction(
    card: FSRSCard,
    contestantId: SrsArenaContestantId,
    entry: ArenaScoreEntry,
    weight: number,
    now: number,
  ): SrsArenaContestantPrediction {
    const nowDate = new Date(now);
    const scheduler = this.getSrsScheduler(contestantId);
    const preview = scheduler.preview(card, nowDate);
    const goodCard = preview.get(Rating.Good) || card;
    const retrievability = clamp(scheduler.getRetrievability(card, nowDate), 0, 1);
    return {
      contestantId,
      label: resolveSrsArenaContestantLabel(contestantId),
      score: entry.score,
      weight,
      retrievability,
      predictedPassProbability: retrievability,
      intervalDays: toIntervalDays(goodCard.due, now),
      due: Number(goodCard.due) || now,
    };
  }

  private getSrsScheduler(contestantId: SrsArenaContestantId) {
    const params = this.deps.getFsrsParams();
    switch (contestantId) {
      case 'sm15':
        return new SM15Scheduler(params);
      case 'sm2':
        return new SM2ReadOnlyScheduler(params);
      case 'fsrs-v6':
      default:
        return new TSFSRSScheduler(params);
    }
  }

  private async applyAttributedReviewFeedback(cardId: string, pass: boolean, rating: number): Promise<void> {
    const attribution = await this.deps.arenaStore.getAttribution(cardId);
    if (!attribution) {
      return;
    }
    const scoreDelta = pass
      ? (rating === Rating.Easy ? 1.1 : 0.8)
      : (rating === Rating.Again ? -1.4 : -0.9);
    await this.applyPackScoreDelta(
      attribution.poolKey,
      attribution.sourcePackId,
      attribution.sourcePackTitle,
      scoreDelta,
    );
    await this.deps.arenaStore.upsertAttribution({
      ...attribution,
      updatedAt: Date.now(),
      reviewCount: attribution.reviewCount + 1,
      lastReviewAt: Date.now(),
      lastOutcome: pass ? 'positive' : 'negative',
    });
    await this.deps.arenaStore.appendMatch({
      id: createId('arena-match'),
      domain: 'ai',
      poolKey: attribution.poolKey,
      createdAt: Date.now(),
      surface: attribution.surface,
      scenarioId: attribution.scenarioId,
      targetKind: attribution.targetKind,
      ai: {
        exposureId: attribution.exposureId,
        sessionId: null,
        packId: attribution.sourcePackId,
        challengerPackIds: [],
        skillId: null,
        tabId: null,
        eventType: 'judge',
        scoreDelta,
        metadata: {
          source: 'delayed-review-attribution',
          rating,
          cardId,
        },
      },
    });
  }
}
