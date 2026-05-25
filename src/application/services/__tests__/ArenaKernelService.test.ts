import { describe, expect, it, vi } from 'vitest';
import { ArenaKernelService } from '@/application/services/ArenaKernelService';
import type { ArenaStoreBatchInput, ArenaStoreService, SrsArenaReviewBatchInput } from '@/application/services/ArenaStoreService';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import type { SrsTransparencyEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import {
  DEFAULT_ARENA_SETTINGS,
  buildArenaPoolKey,
  type AIStrategyPackDefinition,
  type ArenaCardAttributionRecord,
  type ArenaMatchRecord,
  type ArenaScoreSnapshot,
  type ArenaSettings,
} from '@/types/arena';
import { DEFAULT_SETTINGS } from '@/types/settings';

const NOW = 1_700_000_000_000;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEnabledArenaSettings(): ArenaSettings {
  const settings = clone(DEFAULT_ARENA_SETTINGS);
  settings.enabled = true;
  return settings;
}

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? NOW + 7 * 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 6,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? NOW - 2 * 86_400_000,
    elapsedDays: overrides.elapsedDays ?? 2,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? NOW - 30 * 86_400_000,
    updatedAt: overrides.updatedAt ?? NOW,
    meta: overrides.meta ? { ...overrides.meta } : {},
    aFactor: overrides.aFactor,
    cardTypeMarker: overrides.cardTypeMarker,
    schedulerType: overrides.schedulerType,
    schedulerMeta: overrides.schedulerMeta,
  };
}

function reviewLogState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    due: NOW + 7 * 86_400_000,
    stability: 10,
    difficulty: 6,
    reps: 3,
    lapses: 1,
    state: CardState.Review,
    lastReview: NOW - 2 * 86_400_000,
    elapsedDays: 1,
    scheduledDays: 7,
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

function formalReviewLog(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `event-${index}`,
    cardId: 'card-1',
    attemptId: `attempt-${index}`,
    rating: Rating.Again,
    reviewedAt: NOW - index * 86_400_000,
    schedulerType: 'fsrs-v6',
    commitPolicy: 'write-schedule',
    queueMode: 'formal',
    before: reviewLogState(),
    after: reviewLogState({ reps: 4 }),
    ...overrides,
  };
}

function createPack(input: Partial<AIStrategyPackDefinition> & { id: string; title: string }): AIStrategyPackDefinition {
  return {
    id: input.id,
    title: input.title,
    source: input.source ?? 'user',
    state: input.state ?? 'active',
    eligibleScenarios: input.eligibleScenarios ?? ['candidate-card-generation'],
    skillId: input.skillId ?? null,
    tabId: input.tabId ?? null,
    promptOverrides: input.promptOverrides,
    toolPolicyOverrides: input.toolPolicyOverrides,
    createdAt: input.createdAt ?? 10,
    updatedAt: input.updatedAt ?? 10,
    sampleHint: input.sampleHint,
  };
}

function createMemoryArenaStore() {
  const data = {
    matches: [] as ArenaMatchRecord[],
    scores: [] as ArenaScoreSnapshot[],
    attributions: [] as ArenaCardAttributionRecord[],
  };
  const store = {
    data,
    async readStore() {
      return {
        schemaVersion: 1,
        matches: clone(data.matches),
        scores: clone(data.scores),
        attributions: clone(data.attributions),
      };
    },
    async listMatches(filters?: { domain?: 'ai' | 'srs'; poolKey?: string | null; limit?: number }) {
      return data.matches
        .filter((match) => (
          (!filters?.domain || match.domain === filters.domain)
          && (!filters?.poolKey || match.poolKey === filters.poolKey)
        ))
        .slice(0, filters?.limit ?? 50)
        .map((entry) => clone(entry));
    },
    async appendMatch(record: ArenaMatchRecord) {
      data.matches = [clone(record), ...data.matches.filter((entry) => entry.id !== record.id)];
    },
    async listScoreSnapshots(filters?: { domain?: 'ai' | 'srs'; poolKey?: string | null }) {
      return data.scores
        .filter((snapshot) => (
          (!filters?.domain || snapshot.domain === filters.domain)
          && (!filters?.poolKey || snapshot.poolKey === filters.poolKey)
        ))
        .map((entry) => clone(entry));
    },
    async getLatestScoreSnapshot(domain: 'ai' | 'srs', poolKey: string) {
      return clone(data.scores.find((snapshot) => snapshot.domain === domain && snapshot.poolKey === poolKey) || null);
    },
    async replaceScoreSnapshot(snapshot: ArenaScoreSnapshot) {
      data.scores = [
        clone(snapshot),
        ...data.scores.filter((entry) => !(entry.domain === snapshot.domain && entry.poolKey === snapshot.poolKey)),
      ];
    },
    async recordSrsReviewBatch(input: SrsArenaReviewBatchInput) {
      data.scores = [
        clone(input.scoreSnapshot),
        ...data.scores.filter((entry) => !(entry.domain === input.scoreSnapshot.domain && entry.poolKey === input.scoreSnapshot.poolKey)),
      ];
      data.matches = [clone(input.match), ...data.matches.filter((entry) => entry.id !== input.match.id)];
    },
    async commitBatch(input: ArenaStoreBatchInput) {
      for (const snapshot of input.scoreSnapshots || []) {
        data.scores = [
          clone(snapshot),
          ...data.scores.filter((entry) => !(entry.domain === snapshot.domain && entry.poolKey === snapshot.poolKey)),
        ];
      }
      for (const match of input.matches || []) {
        data.matches = [clone(match), ...data.matches.filter((entry) => entry.id !== match.id)];
      }
      for (const attribution of input.attributions || []) {
        data.attributions = [
          clone(attribution),
          ...data.attributions.filter((entry) => entry.cardId !== attribution.cardId),
        ];
      }
      data.scores.sort((left, right) => right.createdAt - left.createdAt);
      data.matches.sort((left, right) => right.createdAt - left.createdAt);
      data.attributions.sort((left, right) => right.updatedAt - left.updatedAt);
    },
    async getAttribution(cardId: string) {
      return clone(data.attributions.find((entry) => entry.cardId === cardId) || null);
    },
    async upsertAttribution(record: ArenaCardAttributionRecord) {
      data.attributions = [
        clone(record),
        ...data.attributions.filter((entry) => entry.cardId !== record.cardId),
      ];
    },
    async listAttributions(filters?: { sourcePackId?: string | null; poolKey?: string | null; limit?: number }) {
      return data.attributions
        .filter((entry) => (
          (!filters?.sourcePackId || entry.sourcePackId === filters.sourcePackId)
          && (!filters?.poolKey || entry.poolKey === filters.poolKey)
        ))
        .slice(0, filters?.limit ?? 120)
        .map((entry) => clone(entry));
    },
  };
  return store;
}

function createKernel(
  settings: ArenaSettings,
  store = createMemoryArenaStore(),
  random = vi.fn(() => 0),
  evidenceReader?: SrsTransparencyEvidenceReader | null,
) {
  let currentSettings = clone(settings);
  const service = new ArenaKernelService({
    getArenaSettings: () => currentSettings,
    updateArenaSettings: async (updater) => {
      currentSettings = updater(currentSettings);
    },
    getFsrsParams: () => clone(DEFAULT_SETTINGS.fsrs),
    arenaStore: store as unknown as ArenaStoreService,
    random,
    evidenceReader,
  });
  return {
    service,
    store,
    getSettings: () => currentSettings,
  };
}

describe('ArenaKernelService', () => {
  it('keeps default-disabled Arena from selecting packs or writing SRS data', async () => {
    const settings = clone(DEFAULT_ARENA_SETTINGS);
    const { service, store } = createKernel(settings);

    const selection = await service.selectAIPack({
      surface: 'standalone-dialog',
      scenarioId: 'candidate-card-generation',
      targetKind: 'note',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
    });
    const recommendation = await service.buildSrsRecommendation(
      buildCard({ type: CardType.Item }),
      'fsrs-v6',
      NOW,
    );
    const reviewResult = await service.recordSrsReview({
      card: buildCard({ type: CardType.Item }),
      rating: 3,
      currentSchedulerType: 'fsrs-v6',
    });

    expect(service.isEnabled()).toBe(false);
    expect(selection).toBeNull();
    expect(recommendation).toBeNull();
    expect(reviewResult).toBeNull();
    expect(store.data.matches).toEqual([]);
    expect(store.data.scores).toEqual([]);
    expect(store.data.attributions).toEqual([]);
  });

  it('stops writing Arena events after the global switch is turned off', async () => {
    const settings = createEnabledArenaSettings();
    settings.ai.strategyPacks = [
      createPack({ id: 'pack-a', title: 'Pack A' }),
    ];
    const { service, store, getSettings } = createKernel(settings);
    const selection = await service.selectAIPack({
      surface: 'standalone-dialog',
      scenarioId: 'candidate-card-generation',
      targetKind: 'note',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
    });
    const matchCountAfterExposure = store.data.matches.length;

    getSettings().enabled = false;
    await service.recordAIEvent({
      selection,
      eventType: 'create',
      cardIds: ['card-created-after-disable'],
    });
    const recommendation = await service.buildSrsRecommendation(
      buildCard({ type: CardType.Item }),
      'fsrs-v6',
      NOW,
    );
    const reviewResult = await service.recordSrsReview({
      card: buildCard({ type: CardType.Item }),
      rating: 3,
      currentSchedulerType: 'fsrs-v6',
    });

    expect(selection).not.toBeNull();
    expect(service.isEnabled()).toBe(false);
    expect(store.data.matches).toHaveLength(matchCountAfterExposure);
    expect(store.data.attributions).toEqual([]);
    expect(store.data.matches.filter((match) => match.domain === 'srs')).toEqual([]);
    expect(recommendation).toBeNull();
    expect(reviewResult).toBeNull();
  });

  it('routes AI pools by scenario and honors pinned, retired, and ineligible strategy packs', async () => {
    const settings = createEnabledArenaSettings();
    settings.ai.strategyPacks = [
      createPack({ id: 'pack-a', title: 'Eligible A' }),
      createPack({ id: 'pack-b', title: 'Pinned B', state: 'pinned', skillId: 'concept-coach' }),
      createPack({ id: 'pack-c', title: 'Other Skill', skillId: 'general-chat' }),
      createPack({ id: 'pack-d', title: 'Retired', state: 'retired' }),
      createPack({ id: 'pack-e', title: 'Wrong Scenario', eligibleScenarios: ['note-refinement'] }),
    ];
    const { service } = createKernel(settings, createMemoryArenaStore(), vi.fn(() => 0.99));

    const selection = await service.selectAIPack({
      surface: 'review-dialog-sidecar',
      scenarioId: 'candidate-card-generation',
      targetKind: 'item',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
      sessionId: 'session-1',
    });

    expect(selection?.pack.id).toBe('pack-b');
    expect(selection?.challengers.map((pack) => pack.id)).toEqual(['pack-a']);
    expect(selection?.weights).toEqual({ 'pack-b': 1 });
  });

  it('weights LLM judge feedback below direct user behavior', async () => {
    const settings = createEnabledArenaSettings();
    settings.ai.strategyPacks = [
      createPack({ id: 'pack-a', title: 'Pack A' }),
    ];
    const { service, store } = createKernel(settings);
    const selection = await service.selectAIPack({
      surface: 'standalone-dialog',
      scenarioId: 'candidate-card-generation',
      targetKind: 'note',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
    });

    await service.recordAIEvent({ selection, eventType: 'judge', qualityLabel: 'strong' });
    await service.recordAIEvent({ selection, eventType: 'manual-bad' });

    const snapshot = await store.getLatestScoreSnapshot('ai', selection!.pool.key);
    expect(snapshot?.entries[0]).toMatchObject({
      contestantId: 'pack-a',
      score: -2.3,
      sampleCount: 2,
      winCount: 1,
      lossCount: 1,
    });
  });

  it('batches AI create event, score update, and card attributions into one store commit', async () => {
    const settings = createEnabledArenaSettings();
    settings.ai.strategyPacks = [
      createPack({ id: 'pack-a', title: 'Pack A' }),
    ];
    const { service, store } = createKernel(settings);
    const selection = await service.selectAIPack({
      surface: 'standalone-dialog',
      scenarioId: 'candidate-card-generation',
      targetKind: 'note',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
    });
    const commitBatchSpy = vi.spyOn(store, 'commitBatch');

    await service.recordAIEvent({
      selection,
      eventType: 'create',
      cardIds: ['card-created-1', 'card-created-2'],
    });

    expect(commitBatchSpy).toHaveBeenCalledTimes(1);
    expect(commitBatchSpy.mock.calls[0]?.[0]).toMatchObject({
      matches: [expect.objectContaining({ domain: 'ai' })],
      scoreSnapshots: [expect.objectContaining({ domain: 'ai' })],
      attributions: [
        expect.objectContaining({ cardId: 'card-created-1' }),
        expect.objectContaining({ cardId: 'card-created-2' }),
      ],
    });
    expect(store.data.attributions.map((entry) => entry.cardId).sort()).toEqual([
      'card-created-1',
      'card-created-2',
    ]);
  });

  it('creates challenge packs from the current pool without crossing scenarios', async () => {
    const settings = createEnabledArenaSettings();
    settings.ai.strategyPacks = [
      createPack({
        id: 'pack-a',
        title: 'Pack A',
        eligibleScenarios: ['candidate-card-generation'],
        promptOverrides: { appendSystemPrompt: 'base prompt' },
      }),
    ];
    const { service, getSettings } = createKernel(settings);
    const poolKey = buildArenaPoolKey({
      surface: 'standalone-dialog',
      scenarioId: 'candidate-card-generation',
      targetKind: 'note',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
    });

    const challenger = await service.generateChallengePack(poolKey);

    expect(challenger?.source).toBe('user');
    expect(challenger?.state).toBe('active');
    expect(challenger?.eligibleScenarios).toEqual(['candidate-card-generation']);
    expect(getSettings().ai.strategyPacks.map((pack) => pack.id)).toContain(challenger?.id);
  });

  it('tracks delayed card attribution from AI creation into later SRS review feedback', async () => {
    const settings = createEnabledArenaSettings();
    settings.ai.strategyPacks = [
      createPack({ id: 'pack-a', title: 'Pack A' }),
    ];
    const { service, store } = createKernel(settings);
    const selection = await service.selectAIPack({
      surface: 'standalone-dialog',
      scenarioId: 'candidate-card-generation',
      targetKind: 'note',
      skillId: 'concept-coach',
      tabId: 'self-test-cards',
    });

    await service.recordAIEvent({
      selection,
      eventType: 'create',
      qualityLabel: 'strong',
      cardIds: ['card-created'],
    });
    await service.recordSrsReview({
      card: buildCard({ id: 'card-created', type: CardType.Item }),
      rating: 1,
      currentSchedulerType: 'fsrs-v6',
    });

    const attribution = await store.getAttribution('card-created');
    const delayedMatch = store.data.matches.find((match) => match.ai?.metadata?.source === 'delayed-review-attribution');
    expect(attribution).toMatchObject({
      cardId: 'card-created',
      sourcePackId: 'pack-a',
      reviewCount: 1,
      lastOutcome: 'negative',
    });
    expect(delayedMatch?.ai).toMatchObject({
      packId: 'pack-a',
      eventType: 'judge',
      scoreDelta: -1.4,
    });
  });

  it('builds advisory-only SRS recommendations with the registered FSRS baseline', async () => {
    const settings = createEnabledArenaSettings();
    const { service, store } = createKernel(settings);
    const card = buildCard({ type: CardType.Descriptor, schedulerType: 'fsrs-v6' });

    const recommendation = await service.buildSrsRecommendation(card, 'fsrs-v6', NOW);

    expect(recommendation?.targetKind).toBe('descriptor');
    expect(recommendation?.contestants.map((entry) => entry.contestantId)).toEqual(['fsrs-v6']);
    expect(recommendation?.contestants.map((entry) => entry.label)).toEqual(['FSRS v6']);
    expect(recommendation?.contestants.map((entry) => entry.contestantId)).not.toContain('a-factor-v2');
    expect(recommendation?.weightedIntervalDays).toBeGreaterThan(0);
    expect(recommendation?.summary).toContain('Arena 当前更偏向');
    expect(card.due).toBe(NOW + 7 * 86_400_000);
    expect(await store.getLatestScoreSnapshot('srs', 'srs::descriptor')).not.toBeNull();
  });

  it('attaches advisory learning evidence diagnostics to SRS recommendations without changing interval outputs', async () => {
    const settings = createEnabledArenaSettings();
    settings.srs.contestantIds = ['fsrs-v6'];
    const evidenceReader = {
      readRecentReviewLogs: vi.fn(async () => [
        formalReviewLog(1),
        formalReviewLog(2),
        formalReviewLog(3),
      ]),
    };
    const { service } = createKernel(settings, createMemoryArenaStore(), vi.fn(() => 0), evidenceReader);
    const card = buildCard({ type: CardType.Item, schedulerType: 'fsrs-v6' });

    const recommendation = await service.buildSrsRecommendation(card, 'fsrs-v6', NOW, {
      ratingBasis: Rating.Good,
    });

    expect(evidenceReader.readRecentReviewLogs).toHaveBeenCalledWith({ cardId: card.id, now: NOW });
    expect(recommendation?.learningCurveEvidence).toMatchObject({
      status: 'ready',
      advisory: true,
      sampleSize: 3,
      usableSampleSize: 3,
      driftDirection: 'weaker-than-expected',
    });
    expect(recommendation?.learningCurveEvidence?.suggestions[0]?.advisory).toBe(true);
    expect(recommendation?.weightedIntervalDays).toBeGreaterThan(0);
    expect(recommendation?.weightedDue).toBeGreaterThan(NOW);
    expect(card.due).toBe(NOW + 7 * 86_400_000);
  });

  it('reports insufficient, low-quality, and unavailable learning evidence states explicitly', async () => {
    const settings = createEnabledArenaSettings();
    settings.srs.contestantIds = ['fsrs-v6'];
    const insufficientReader = {
      readRecentReviewLogs: vi.fn(async () => [
        formalReviewLog(1, { rating: Rating.Good, reviewedAt: NOW }),
      ]),
    };
    const lowQualityReader = {
      readRecentReviewLogs: vi.fn(async () => [
        { rating: Rating.Good, reviewedAt: NOW - 86_400_000, commitPolicy: 'write-schedule', queueMode: 'formal' },
        { rating: Rating.Good, reviewedAt: NOW - 2 * 86_400_000, commitPolicy: 'write-schedule', queueMode: 'formal' },
        { rating: Rating.Good, reviewedAt: NOW - 3 * 86_400_000, commitPolicy: 'write-schedule', queueMode: 'formal' },
      ]),
    };
    const unavailableReader = {
      readRecentReviewLogs: vi.fn(async () => {
        throw new Error('history unavailable');
      }),
    };

    const insufficient = await createKernel(settings, createMemoryArenaStore(), vi.fn(() => 0), insufficientReader)
      .service.buildSrsRecommendation(buildCard(), 'fsrs-v6', NOW);
    const lowQuality = await createKernel(settings, createMemoryArenaStore(), vi.fn(() => 0), lowQualityReader)
      .service.buildSrsRecommendation(buildCard(), 'fsrs-v6', NOW);
    const unavailable = await createKernel(settings, createMemoryArenaStore(), vi.fn(() => 0), unavailableReader)
      .service.buildSrsRecommendation(buildCard(), 'fsrs-v6', NOW);
    const absent = await createKernel(settings)
      .service.buildSrsRecommendation(buildCard(), 'fsrs-v6', NOW);

    expect(insufficient?.learningCurveEvidence).toMatchObject({
      status: 'insufficient-history',
      advisory: true,
      sampleSize: 1,
      suggestions: [],
    });
    expect(lowQuality?.learningCurveEvidence).toMatchObject({
      status: 'low-quality-history',
      advisory: true,
      sampleSize: 0,
      usableSampleSize: 0,
      exclusions: expect.objectContaining({ lowQuality: 3 }),
      suggestions: [],
    });
    expect(unavailable?.learningCurveEvidence).toMatchObject({
      status: 'unavailable',
      advisory: true,
      diagnostics: ['evidence-history-unavailable'],
      suggestions: [],
    });
    expect(absent?.learningCurveEvidence).toMatchObject({
      status: 'unavailable',
      advisory: true,
      diagnostics: ['evidence-reader-unavailable'],
      suggestions: [],
    });
  });

  it('does not let learning evidence activate Arena or mutate SRS Arena review writes', async () => {
    const disabledSettings = clone(DEFAULT_ARENA_SETTINGS);
    const disabledReader = { readRecentReviewLogs: vi.fn(async () => []) };
    const disabled = createKernel(disabledSettings, createMemoryArenaStore(), vi.fn(() => 0), disabledReader);

    const disabledRecommendation = await disabled.service.buildSrsRecommendation(buildCard(), 'fsrs-v6', NOW);

    expect(disabledRecommendation).toBeNull();
    expect(disabledReader.readRecentReviewLogs).not.toHaveBeenCalled();

    const settings = createEnabledArenaSettings();
    settings.srs.contestantIds = ['fsrs-v6'];
    const reviewNow = Date.now();
    const readyReader = {
      readRecentReviewLogs: vi.fn(async () => [
        formalReviewLog(1, { reviewedAt: reviewNow - 86_400_000 }),
        formalReviewLog(2, { reviewedAt: reviewNow - 2 * 86_400_000 }),
        formalReviewLog(3, { reviewedAt: reviewNow - 3 * 86_400_000 }),
      ]),
    };
    const { service, store } = createKernel(settings, createMemoryArenaStore(), vi.fn(() => 0), readyReader);

    const recommendation = await service.recordSrsReview({
      card: buildCard({ type: CardType.Item }),
      rating: Rating.Good,
      currentSchedulerType: 'fsrs-v6',
    });

    expect(recommendation?.learningCurveEvidence?.status).toBe('ready');
    expect(store.data.matches[0]?.srs).not.toHaveProperty('learningCurveEvidence');
    expect(store.data.matches[0]?.srs?.weightedIntervalDays).toBe(recommendation?.weightedIntervalDays);
    expect(store.data.matches[0]?.srs?.discrepancyRatio).toBe(recommendation?.discrepancyRatio);
  });

  it('seeds SRS manager pools from configured target kinds and shows all configured contestants', async () => {
    const settings = createEnabledArenaSettings();
    const { service, store } = createKernel(settings);

    const view = await service.buildManagerView();

    expect(store.data.matches.filter((match) => match.domain === 'srs')).toEqual([]);
    expect(view.srs.pools.map((entry) => entry.pool.key).sort()).toEqual(['srs::descriptor', 'srs::item']);
    for (const pool of view.srs.pools) {
      expect(pool.totalEntries).toBe(settings.srs.contestantIds.length);
      expect(pool.topEntries).toHaveLength(settings.srs.contestantIds.length);
      expect(pool.topEntries.map((entry) => entry.contestantId).sort()).toEqual(settings.srs.contestantIds.slice().sort());
    }
    expect(view.srs.scores.map((snapshot) => snapshot.poolKey).sort()).toEqual(['srs::descriptor', 'srs::item']);
  });

  it('anchors SRS recommendations to the queue scheduling context and selected rating basis', async () => {
    const settings = createEnabledArenaSettings();
    settings.srs.contestantIds = ['fsrs-v6'];
    const { service } = createKernel(settings);
    const reviewTime = NOW;
    const memoryStateAsOf = NOW + 13 * 86_400_000;
    const card = buildCard({
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
      due: memoryStateAsOf,
      lastReview: memoryStateAsOf - 30 * 86_400_000,
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 0,
    });

    const bare = await service.buildSrsRecommendation(card, 'fsrs-v6', reviewTime, {
      ratingBasis: Rating.Good,
    });
    const anchored = await service.buildSrsRecommendation(card, 'fsrs-v6', reviewTime, {
      ratingBasis: Rating.Hard,
      schedulingContext: {
        reviewTime,
        memoryStateAsOf,
        queueType: 'retrieval-practice',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
        customStudy: true,
      },
    });

    const anchoredHardChoice = anchored?.contestants[0]?.choices.find((choice) => choice.rating === Rating.Hard);
    expect(anchored?.ratingBasis).toBe(Rating.Hard);
    expect(anchored?.schedulingContextLabel).toContain('记忆锚点');
    expect(anchored?.currentSchedulerIntervalDays).toBeCloseTo(anchoredHardChoice?.intervalDays || 0, 5);
    expect(anchored?.currentSchedulerIntervalDays).not.toBeCloseTo(bare?.currentSchedulerIntervalDays || 0, 5);
  });
});
