// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SrsEditorDialog from '../SrsEditorDialog.vue';
import { CardState, CardType, type FSRSCard } from '@/types/card';

const createVueDialogMock = vi.fn();
const confirmDialogMock = vi.fn();

vi.mock('@/utils/dialog', () => ({
  createVueDialog: (...args: unknown[]) => createVueDialogMock(...args),
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
}));

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
  };
}

function buildSnapshot(cardOverrides: Partial<FSRSCard> = {}) {
  return {
    card: buildCard(cardOverrides),
    blockInfo: {
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    },
  };
}

function buildTransparencyModel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schedulerType: overrides.schedulerType ?? 'fsrs-v6',
    schedulerLabel: overrides.schedulerLabel ?? 'FSRS v6',
    summary: overrides.summary ?? 'FSRS v6 会根据当前稳定度和难度预测遗忘速度，再为四个评分给出不同的下次复习区间。',
    gradePreviews: overrides.gradePreviews ?? [
      { rating: 1, tone: 'again', label: '重来', nextDue: '< 1 min', dueAt: '2023/11/15 06:13:20', explanation: '收紧到最短可接受间隔，优先避免再次遗忘。' },
      { rating: 2, tone: 'hard', label: '困难', nextDue: '1 h', dueAt: '2023/11/15 07:12:50', explanation: '保守延长，并留出更多巩固次数。' },
      { rating: 3, tone: 'good', label: '良好', nextDue: '1 d', dueAt: '2023/11/16 06:12:50', explanation: '按当前算法的默认增长推进。' },
      { rating: 4, tone: 'easy', label: '简单', nextDue: '3 d', dueAt: '2023/11/18 06:12:50', explanation: '如果回忆轻松，就放大下一次间隔。' },
    ],
    stateFacts: overrides.stateFacts ?? [
      { label: '状态', value: '复习卡' },
      { label: '复习次数', value: '3' },
    ],
    algorithmFacts: overrides.algorithmFacts ?? [
      { label: '调度器', value: 'FSRS v6' },
      { label: '调度依据', value: '根据稳定度与难度预测间隔扩张，并对不同评分给出不同增长幅度。' },
    ],
    reviewPreviewContextLabel: overrides.reviewPreviewContextLabel ?? null,
  };
}

function createPlugin(
  cardEditorService: Record<string, unknown>,
  reviewService?: Record<string, unknown>,
  manager?: Record<string, unknown>,
  transparencyService?: Record<string, unknown>,
) {
  return {
    getContext: () => ({
      getCardEditorService: () => cardEditorService,
      getReviewService: () => reviewService,
      getUnifiedDataSourceManager: () => manager,
      getSrsTransparencyService: () => transparencyService || { build: vi.fn(() => buildTransparencyModel()) },
    }),
  };
}

async function openDetails(wrapper: ReturnType<typeof mount>, selector: string) {
  const details = wrapper.get(selector);
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger('toggle');
  await flushPromises();
  return details;
}

describe('SrsEditorDialog', () => {
  beforeEach(() => {
    createVueDialogMock.mockReset();
    createVueDialogMock.mockReturnValue({ dialog: {}, destroy: vi.fn() });
    confirmDialogMock.mockReset();
    confirmDialogMock.mockResolvedValue(true);
  });

  it('renders a compact inspector without the grade preview strip and opens more-edit by default', async () => {
    const loadSnapshot = vi.fn(async () => buildSnapshot());
    const buildTransparency = vi.fn(() => buildTransparencyModel());
    const manager = { registerObserver: vi.fn(), unregisterObserver: vi.fn() };
    const plugin = createPlugin({
      loadSnapshot,
      updateCardType: vi.fn(),
      updateRender: vi.fn(),
      updatePriority: vi.fn(),
      scheduleCard: vi.fn(),
      setDismissed: vi.fn(),
      resetProgress: vi.fn(),
    }, {
      getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
    }, manager, {
      build: buildTransparency,
    });

    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: plugin as never,
        i18n: {},
      },
    });

    await flushPromises();

    expect(loadSnapshot).toHaveBeenCalledWith('block-1', 'card-1');
    expect(manager.registerObserver).toHaveBeenCalledTimes(1);
    expect(buildTransparency).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.srs-editor__hero').exists()).toBe(false);
    expect(wrapper.findAll('.srs-preview-pill')).toHaveLength(0);
    expect(wrapper.findAll('.srs-preview-detail')).toHaveLength(0);
    expect(wrapper.findAll('.srs-grade-card')).toHaveLength(0);
    expect(wrapper.findAll('.srs-field-card')).toHaveLength(0);
    expect(wrapper.findAll('[data-action]')).toHaveLength(3);
    expect(wrapper.html().indexOf('更多编辑')).toBeLessThan(wrapper.html().indexOf('当前状态'));
    expect((wrapper.get('[data-section="more-edit"]').element as HTMLDetailsElement).open).toBe(true);
    expect((wrapper.get('[data-section="scheduling-details"]').element as HTMLDetailsElement).open).toBe(false);
    expect((wrapper.get('[data-section="danger-zone"]').element as HTMLDetailsElement).open).toBe(false);
    expect(wrapper.text()).toContain('当前状态');
    expect(wrapper.text()).not.toContain('评分预览');
    expect(wrapper.text()).not.toContain('转换提示');
  });

  it('shows queue-context review previews only when opened from review', async () => {
    const loadSnapshot = vi.fn(async () => buildSnapshot({ scheduledDays: 3 }));
    const buildTransparency = vi.fn(() => buildTransparencyModel({
      reviewPreviewContextLabel: '队列上下文（按到期日记忆锚点）',
      gradePreviews: [
        { rating: 1, tone: 'again', label: '重来', nextDue: '10 min', dueAt: '2026/4/29 10:10:00', explanation: '' },
        { rating: 2, tone: 'hard', label: '困难', nextDue: '8 d', dueAt: '2026/5/7 10:00:00', explanation: '' },
        { rating: 3, tone: 'good', label: '良好', nextDue: '13 d', dueAt: '2026/5/12 10:00:00', explanation: '' },
        { rating: 4, tone: 'easy', label: '简单', nextDue: '23 d', dueAt: '2026/5/22 10:00:00', explanation: '' },
      ],
    }));
    const schedulingContext = {
      memoryStateAsOf: 1_777_777_777_000,
      queueMode: 'filtered-preview' as const,
      commitPolicy: 'preview-only' as const,
    };

    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot,
          updateCardType: vi.fn(),
          updateRender: vi.fn(),
          updatePriority: vi.fn(),
          scheduleCard: vi.fn(),
          setDismissed: vi.fn(),
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
        }, {
          registerObserver: vi.fn(),
          unregisterObserver: vi.fn(),
        }, {
          build: buildTransparency,
        }) as never,
        schedulingContext,
      },
    });

    await flushPromises();

    expect(buildTransparency).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schedulingContext }),
    );
    expect(wrapper.text()).toContain('安排间隔');
    expect(wrapper.text()).toContain('3.0 天');
    expect(wrapper.text()).toContain('本次复习预览');
    expect(wrapper.text()).toContain('8 d');
    expect(wrapper.text()).toContain('13 d');
    expect(wrapper.text()).toContain('23 d');
  });

  it('shows loading state while saving priority and refreshes after resolve', async () => {
    let resolvePriorityUpdate: ((value: unknown) => void) | null = null;
    const updatePriority = vi.fn(() => new Promise((resolve) => {
      resolvePriorityUpdate = resolve;
    }));

    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot: vi.fn(async () => buildSnapshot({ priority: 50 })),
          updateCardType: vi.fn(),
          updateRender: vi.fn(),
          updatePriority,
          scheduleCard: vi.fn(),
          setDismissed: vi.fn(),
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
        }, {
          registerObserver: vi.fn(),
          unregisterObserver: vi.fn(),
        }) as never,
      },
    });

    await flushPromises();

    await openDetails(wrapper, '[data-section="more-edit"]');

    const input = wrapper.get('[data-field="priority"] input');
    await input.setValue('12');
    await input.trigger('blur');
    await flushPromises();

    expect(updatePriority).toHaveBeenCalledWith('card-1', 12);
    expect(wrapper.text()).toContain('保存中');

    resolvePriorityUpdate?.(buildSnapshot({ priority: 12 }));
    await flushPromises();

    expect(wrapper.text()).not.toContain('保存中');
    expect(wrapper.get('[data-field="priority"]').text()).toContain('12 / 100');
  });

  it('saves card type, saves render, and opens the existing schedule dialog flow', async () => {
    const updateCardType = vi.fn(async (_cardId: string, targetType: CardType) => buildSnapshot({ type: targetType, meta: { renderProfile: 'concept', typeMarker: 'C' } }));
    const updateRender = vi.fn(async () => buildSnapshot({
      type: CardType.Concept,
      meta: { renderProfile: 'descriptor', typeMarker: 'concept-descriptor-reverse', templateID: 'builtin-concept-descriptor-reverse' },
    }));
    const scheduleCard = vi.fn(async () => buildSnapshot({ due: 1_800_000_000_000 }));

    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot: vi.fn(async () => buildSnapshot()),
          updateCardType,
          updateRender,
          updatePriority: vi.fn(),
          scheduleCard,
          setDismissed: vi.fn(),
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
        }, {
          registerObserver: vi.fn(),
          unregisterObserver: vi.fn(),
        }) as never,
      },
    });

    await flushPromises();

    await openDetails(wrapper, '[data-section="more-edit"]');

    await wrapper.findAll('.srs-type-option')[2].trigger('click');
    await flushPromises();
    expect(updateCardType).toHaveBeenCalledWith('card-1', CardType.Concept);

    await wrapper.get('[data-field="render"] select').setValue('descriptor-reverse');
    await flushPromises();
    expect(updateRender).toHaveBeenCalledWith('card-1', 'descriptor-reverse');

    await wrapper.get('[data-action="schedule"]').trigger('click');
    expect(createVueDialogMock).toHaveBeenCalledTimes(1);

    const dialogOptions = createVueDialogMock.mock.calls[0][0] as {
      props: Record<string, unknown>;
      events: Record<string, (value: unknown) => unknown>;
    };
    expect(dialogOptions.props.cardType).toBe('topic');

    await dialogOptions.events.confirm({ mode: 'direct', days: 3 });
    await flushPromises();

    expect(scheduleCard).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({
        mode: 'direct',
        dueTimestamp: expect.any(Number),
      }),
    );
  });

  it('surfaces protected semantic overwrite results without showing a success state', async () => {
    const pushMsg = vi.fn();
    const updateRender = vi.fn(async () => ({
      ...buildSnapshot({
        type: CardType.Item,
        meta: {
          templateID: 'custom-owned-template',
          typeMarker: 'custom-owned-rule',
          renderProfile: 'custom-render-profile',
        },
      }),
      status: 'confirmation-required',
      semanticOverwrite: {
        reason: 'protected-semantic-payload',
        fields: [
          { path: 'meta.templateID', kind: 'template', before: 'custom-owned-template', after: 'builtin-concept-descriptor-reverse', custom: true },
          { path: 'meta.typeMarker', kind: 'render', before: 'custom-owned-rule', after: 'concept-descriptor-reverse', custom: true },
          { path: 'meta.renderProfile', kind: 'render', before: 'custom-render-profile', after: 'descriptor', custom: true },
        ],
      },
    }));

    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot: vi.fn(async () => buildSnapshot({
            meta: {
              templateID: 'custom-owned-template',
              typeMarker: 'custom-owned-rule',
              renderProfile: 'custom-render-profile',
            },
          })),
          updateCardType: vi.fn(),
          updateRender,
          updatePriority: vi.fn(),
          scheduleCard: vi.fn(),
          setDismissed: vi.fn(),
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg, pushErrMsg: vi.fn() }),
        }, {
          registerObserver: vi.fn(),
          unregisterObserver: vi.fn(),
        }) as never,
      },
    });

    await flushPromises();
    await openDetails(wrapper, '[data-section="more-edit"]');

    await wrapper.get('[data-field="render"] select').setValue('descriptor-reverse');
    await flushPromises();

    expect(updateRender).toHaveBeenCalledWith('card-1', 'descriptor-reverse');
    expect(wrapper.text()).toContain('已保护自定义卡片重要数据');
    expect(wrapper.text()).toContain('模板 ID');
    expect((wrapper.get('[data-field="render"] select').element as HTMLSelectElement).value).toBe('default');
    expect(pushMsg).toHaveBeenLastCalledWith(expect.stringContaining('已保护自定义卡片重要数据'), 3000);
    expect(pushMsg).not.toHaveBeenCalledWith('渲染已更新', 3000);
  });

  it('shows a warning when render no longer matches the current card type recommendation', async () => {
    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot: vi.fn(async () => buildSnapshot({
            type: CardType.Concept,
            meta: { renderProfile: 'descriptor', typeMarker: 'concept-descriptor-forward', templateID: 'builtin-concept-descriptor' },
          })),
          updateCardType: vi.fn(),
          updateRender: vi.fn(),
          updatePriority: vi.fn(),
          scheduleCard: vi.fn(),
          setDismissed: vi.fn(),
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
        }, {
          registerObserver: vi.fn(),
          unregisterObserver: vi.fn(),
        }) as never,
      },
    });

    await flushPromises();

    await openDetails(wrapper, '[data-section="more-edit"]');

    expect(wrapper.text()).toContain('当前渲染与该类型的推荐渲染不一致');
    expect(wrapper.text()).toContain('推荐渲染');
  });

  it('toggles dismissed state from the quick action and emits dismissed event', async () => {
    const setDismissed = vi.fn(async (_cardId: string, dismissed: boolean) =>
      buildSnapshot({
        meta: dismissed ? { suspended: true } : {},
      }),
    );

    const wrapper = mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-1', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot: vi.fn(async () => buildSnapshot()),
          updateCardType: vi.fn(),
          updateRender: vi.fn(),
          updatePriority: vi.fn(),
          scheduleCard: vi.fn(),
          setDismissed,
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
        }, {
          registerObserver: vi.fn(),
          unregisterObserver: vi.fn(),
        }) as never,
      },
    });

    await flushPromises();

    const dismissButton = wrapper.get('[data-action="dismiss"]');
    expect(dismissButton.text()).toContain('Suspend');

    await dismissButton.trigger('click');
    await flushPromises();

    expect(setDismissed).toHaveBeenCalledWith('card-1', true);
    expect(wrapper.emitted('dismissed')?.[0]).toEqual([
      { cardId: 'card-1', blockId: 'block-1', dismissed: true },
    ]);
    expect(wrapper.get('[data-action="dismiss"]').text()).toContain('Restore');
  });

  it('refreshes the same card when unified manager emits a matching update', async () => {
    const loadSnapshot = vi.fn(async () => buildSnapshot({ id: 'card-2', blockId: 'block-1', priority: 48 }));
    let observer: { onDataChanged: (event: { type: string; cardIds?: string[]; timestamp: number }) => void } | null = null;
    const manager = {
      registerObserver: vi.fn((nextObserver: typeof observer) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
    };

    mount(SrsEditorDialog, {
      props: {
        card: { id: 'card-2', blockId: 'block-1' },
        plugin: createPlugin({
          loadSnapshot,
          updateCardType: vi.fn(),
          updateRender: vi.fn(),
          updatePriority: vi.fn(),
          scheduleCard: vi.fn(),
          setDismissed: vi.fn(),
          resetProgress: vi.fn(),
        }, {
          getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
        }, manager) as never,
      },
    });

    await flushPromises();
    observer?.onDataChanged({
      type: 'card-updated',
      cardIds: ['card-2'],
      timestamp: Date.now(),
    });
    await flushPromises();

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(loadSnapshot).toHaveBeenLastCalledWith('block-1', 'card-2');
  });
});
