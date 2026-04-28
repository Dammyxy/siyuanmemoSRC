import { describe, expect, it, vi } from 'vitest';
import { ArenaKernelService } from '@/application/services/ArenaKernelService';
import type { ArenaStoreBatchInput, ArenaStoreService, SrsArenaReviewBatchInput } from '@/application/services/ArenaStoreService';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
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

  it('builds advisory-only SRS recommendations with the registered SRS v1 contestants', async () => {
    const settings = createEnabledArenaSettings();
    const { service, store } = createKernel(settings);
    const card = buildCard({ type: CardType.Descriptor, schedulerType: 'fsrs-v6' });

    const recommendation = await service.buildSrsRecommendation(card, 'fsrs-v6', NOW);

    expect(recommendation?.targetKind).toBe('descriptor');
    expect(recommendation?.contestants.map((entry) => entry.contestantId)).toEqual([
      'fsrs-v6',
      'sm2',
      'sm5',
      'sm8',
      'sm15',
      'sm18',
      'sm20',
    ]);
    expect(recommendation?.contestants.map((entry) => entry.label)).toContain('FSRSV5');
    expect(recommendation?.contestants.map((entry) => entry.label)).toContain('SM-20');
    expect(recommendation?.contestants.map((entry) => entry.contestantId)).not.toContain('a-factor-v2');
    expect(recommendation?.weightedIntervalDays).toBeGreaterThan(0);
    expect(recommendation?.summary).toContain('Arena 当前更偏向');
    expect(card.due).toBe(NOW + 7 * 86_400_000);
    expect(await store.getLatestScoreSnapshot('srs', 'srs::descriptor')).not.toBeNull();
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
