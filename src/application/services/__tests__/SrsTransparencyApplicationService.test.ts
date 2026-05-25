import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import type { CardEditorSnapshot } from '@/application/services/CardEditorApplicationService';
import { SrsTransparencyApplicationService } from '@/application/services/SrsTransparencyApplicationService';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 6,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : {},
    aFactor: overrides.aFactor,
    cardTypeMarker: overrides.cardTypeMarker,
    schedulerType: overrides.schedulerType,
    schedulerMeta: overrides.schedulerMeta,
  };
}

function buildSnapshot(cardOverrides: Partial<FSRSCard> = {}): CardEditorSnapshot {
  return {
    card: buildCard(cardOverrides),
    blockInfo: {
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    },
  };
}

function reviewLogState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    due: 1_700_000_000_000,
    stability: 10,
    difficulty: 6,
    reps: 3,
    lapses: 1,
    state: CardState.Review,
    lastReview: 1_700_000_000_000 - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 7,
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

function createTranslator() {
  return (key: string, fallback: string) => {
    const overrides: Record<string, string> = {
      days: 'd',
      schedulerFsrsV6: 'FSRS v6',
      schedulerAFactorV2: 'A-Factor v2',
      afHistorySummary: '{count} 条，最新值 {latest}',
    };
    return overrides[key] ?? fallback;
  };
}

describe('SrsTransparencyApplicationService', () => {
  it('builds FSRS transparency from router preview using shared next-due formatting', async () => {
    const now = 1_700_000_000_000;
    const router = {
      getSchedulerType: vi.fn(() => 'fsrs-v6' as const),
      preview: vi.fn(() => new Map([
        [Rating.Again, buildCard({ due: now + 30_000 })],
        [Rating.Hard, buildCard({ due: now + 3_600_000 })],
        [Rating.Good, buildCard({ due: now + 86_400_000 })],
        [Rating.Easy, buildCard({ due: now + 3 * 86_400_000 })],
      ])),
    };

    const service = new SrsTransparencyApplicationService(router);
    const model = await service.build(buildSnapshot(), { now, t: createTranslator() });

    expect(router.getSchedulerType).toHaveBeenCalled();
    expect(router.preview).toHaveBeenCalled();
    expect(model.schedulerLabel).toBe('FSRS v6');
    expect(model.gradePreviews.map((item) => item.nextDue)).toEqual(['< 1 min', '1 h', '1 d', '3 d']);
    expect(model.summary).toContain('FSRS v6');
    expect(model.algorithmFacts).toEqual([
      { label: '调度器', value: 'FSRS v6' },
      { label: '调度依据', value: '根据稳定度与难度预测间隔扩张，并对不同评分给出不同增长幅度。' },
    ]);
  });

  it('surfaces A-Factor v2 facts from topic scheduler metadata', async () => {
    const router = {
      getSchedulerType: vi.fn(() => 'a-factor-v2' as const),
      preview: vi.fn(() => new Map([
        [Rating.Again, buildCard()],
        [Rating.Hard, buildCard()],
        [Rating.Good, buildCard()],
        [Rating.Easy, buildCard()],
      ])),
    };

    const service = new SrsTransparencyApplicationService(router);
    const model = await service.build(buildSnapshot({
      aFactor: 2.7,
      schedulerMeta: {
        topic: {
          afs: [2.3, 2.5, 2.7],
          of: 2.7,
          optimalInterval: 9,
        },
      },
    }), { t: createTranslator() });

    expect(model.schedulerType).toBe('a-factor-v2');
    expect(model.algorithmFacts).toEqual([
      { label: '调度器', value: 'A-Factor v2' },
      { label: 'A-Factor', value: '2.70' },
      { label: 'O-Factor', value: '2.70' },
      { label: '最优间隔', value: '9.0 d' },
      { label: 'AF 历史', value: '3 条，最新值 2.70' },
    ]);
  });

  it('adds Arena recommendation facts and hint when the advisory diverges', async () => {
    const now = 1_700_000_000_000;
    const router = {
      getSchedulerType: vi.fn(() => 'fsrs-v6' as const),
      preview: vi.fn(() => new Map([
        [Rating.Again, buildCard({ due: now + 30_000 })],
        [Rating.Hard, buildCard({ due: now + 3_600_000 })],
        [Rating.Good, buildCard({ due: now + 86_400_000 })],
        [Rating.Easy, buildCard({ due: now + 3 * 86_400_000 })],
      ])),
    };
    const arenaKernel = {
      buildSrsRecommendation: vi.fn(async () => ({
        poolKey: 'srs::item',
        targetKind: 'item' as const,
        leadingContestantId: 'fsrs-v6' as const,
        weightedIntervalDays: 9,
        weightedDue: now + 9 * 86_400_000,
        currentSchedulerIntervalDays: 1,
        discrepancyRatio: 8,
        ratingBasis: Rating.Good,
        schedulingContextLabel: '默认上下文',
        shouldHighlight: true,
        summary: 'Arena summary',
        contestants: [],
      })),
    };

    const service = new SrsTransparencyApplicationService(router, arenaKernel);
    const model = await service.build(buildSnapshot(), { now, t: createTranslator() });

    expect(arenaKernel.buildSrsRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'card-1' }),
      'fsrs-v6',
      now,
      { schedulingContext: undefined },
    );
    expect(model.arenaHint).toBe('Arena 按Good综合建议约 9.0 d，与当前正式调度相差 800%。');
    expect(model.algorithmFacts).toContainEqual({ label: 'Arena 预判间隔（Good）', value: '9.0 d' });
    expect(model.algorithmFacts).toContainEqual({ label: 'Arena 当前领先', value: 'FSRS v6' });
    expect(model.algorithmFacts).toContainEqual({ label: 'Arena 调度上下文', value: '默认上下文' });
  });

  it('surfaces advisory learning-curve evidence from bounded review history', async () => {
    const now = 1_700_000_000_000;
    const router = {
      getSchedulerType: vi.fn(() => 'fsrs-v6' as const),
      preview: vi.fn(() => new Map([
        [Rating.Again, buildCard({ due: now + 30_000 })],
        [Rating.Hard, buildCard({ due: now + 3_600_000 })],
        [Rating.Good, buildCard({ due: now + 86_400_000 })],
        [Rating.Easy, buildCard({ due: now + 3 * 86_400_000 })],
      ])),
    };
    const evidenceReader = {
      readRecentReviewLogs: vi.fn(async () => [
        {
          id: 'event-1',
          cardId: 'card-1',
          attemptId: 'attempt-1',
          rating: Rating.Again,
          reviewedAt: now - 86_400_000,
          schedulerType: 'fsrs-v6',
          commitPolicy: 'write-schedule',
          queueMode: 'formal',
          before: reviewLogState(),
          after: reviewLogState({ reps: 4 }),
        },
        {
          id: 'event-2',
          cardId: 'card-1',
          attemptId: 'attempt-2',
          rating: Rating.Again,
          reviewedAt: now - 2 * 86_400_000,
          schedulerType: 'fsrs-v6',
          commitPolicy: 'write-schedule',
          queueMode: 'formal',
          before: reviewLogState(),
          after: reviewLogState({ reps: 4 }),
        },
        {
          id: 'event-3',
          cardId: 'card-1',
          attemptId: 'attempt-3',
          rating: Rating.Again,
          reviewedAt: now - 3 * 86_400_000,
          schedulerType: 'fsrs-v6',
          commitPolicy: 'write-schedule',
          queueMode: 'formal',
          before: reviewLogState(),
          after: reviewLogState({ reps: 4 }),
        },
        {
          id: 'preview-1',
          cardId: 'card-1',
          attemptId: 'attempt-preview',
          rating: Rating.Good,
          reviewedAt: now - 4 * 86_400_000,
          schedulerType: 'fsrs-v6',
          commitPolicy: 'preview-only',
          queueMode: 'filtered-preview',
          before: reviewLogState(),
          after: reviewLogState(),
        },
      ]),
    };

    const service = new SrsTransparencyApplicationService(router, null, evidenceReader);
    const model = await service.build(buildSnapshot(), { now, t: createTranslator() });

    expect(evidenceReader.readRecentReviewLogs).toHaveBeenCalledWith({
      cardId: 'card-1',
      now,
    });
    expect(model.learningCurveEvidence).toMatchObject({
      status: 'ready',
      advisory: true,
      sampleSize: 3,
      usableSampleSize: 3,
      exclusions: expect.objectContaining({ nonFormal: 1 }),
      driftDirection: 'weaker-than-expected',
    });
    expect(model.learningCurveEvidence?.diagnostics).toContain('excluded-non-formal:1');
    expect(model.learningCurveEvidence?.suggestions[0]?.advisory).toBe(true);
    expect(model.algorithmFacts).toContainEqual({ label: '学习曲线', value: '偏弱（3 样本，33% 置信）' });
    expect(model.algorithmFacts).toContainEqual({ label: '学习曲线建议', value: '建议提前复习（仅诊断）' });
  });

  it('reports insufficient or unavailable learning-curve evidence without fabricated suggestions', async () => {
    const router = {
      getSchedulerType: vi.fn(() => 'fsrs-v6' as const),
      preview: vi.fn(() => new Map([
        [Rating.Again, buildCard()],
        [Rating.Hard, buildCard()],
        [Rating.Good, buildCard()],
        [Rating.Easy, buildCard()],
      ])),
    };
    const insufficientReader = {
      readRecentReviewLogs: vi.fn(async () => [
        {
          rating: Rating.Good,
          reviewedAt: 1_700_000_000_000,
          id: 'event-1',
          cardId: 'card-1',
          attemptId: 'attempt-1',
          schedulerType: 'fsrs-v6',
          commitPolicy: 'write-schedule',
          queueMode: 'formal',
          before: reviewLogState(),
          after: reviewLogState({ reps: 4 }),
        },
      ]),
    };
    const unavailableReader = {
      readRecentReviewLogs: vi.fn(async () => {
        throw new Error('review history offline');
      }),
    };

    const insufficient = await new SrsTransparencyApplicationService(
      router,
      null,
      insufficientReader,
    ).build(buildSnapshot(), { now: 1_700_000_000_000, t: createTranslator() });
    const unavailable = await new SrsTransparencyApplicationService(
      router,
      null,
      unavailableReader,
    ).build(buildSnapshot(), { now: 1_700_000_000_000, t: createTranslator() });

    expect(insufficient.learningCurveEvidence).toMatchObject({
      status: 'insufficient-data',
      advisory: true,
      sampleSize: 1,
      suggestions: [],
    });
    expect(insufficient.algorithmFacts).toContainEqual({ label: '学习曲线', value: '数据不足（1 样本）' });
    expect(unavailable.learningCurveEvidence).toMatchObject({
      status: 'unavailable',
      advisory: true,
      diagnostics: ['evidence-history-unavailable'],
      suggestions: [],
    });
    expect(unavailable.algorithmFacts).toContainEqual({ label: '学习曲线', value: '历史不可用' });
  });
});
