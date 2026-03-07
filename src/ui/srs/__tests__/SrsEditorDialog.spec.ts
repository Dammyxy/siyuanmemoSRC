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

function createPlugin(
  cardEditorService: Record<string, unknown>,
  reviewService?: Record<string, unknown>,
  manager?: Record<string, unknown>,
) {
  return {
    getContext: () => ({
      getCardEditorService: () => cardEditorService,
      getReviewService: () => reviewService,
      getUnifiedDataSourceManager: () => manager,
    }),
  };
}

describe('SrsEditorDialog', () => {
  beforeEach(() => {
    createVueDialogMock.mockReset();
    createVueDialogMock.mockReturnValue({ dialog: {}, destroy: vi.fn() });
    confirmDialogMock.mockReset();
    confirmDialogMock.mockResolvedValue(true);
  });

  it('renders four schema-driven quick edit fields and the conversion notice', async () => {
    const loadSnapshot = vi.fn(async () => buildSnapshot());
    const manager = { registerObserver: vi.fn(), unregisterObserver: vi.fn() };
    const plugin = createPlugin({
      loadSnapshot,
      updateCardType: vi.fn(),
      updateRender: vi.fn(),
      updatePriority: vi.fn(),
      scheduleCard: vi.fn(),
      resetProgress: vi.fn(),
    }, {
      getSiyuanApi: () => ({ pushMsg: vi.fn(), pushErrMsg: vi.fn() }),
    }, manager);

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
    expect(wrapper.findAll('.srs-field-card')).toHaveLength(4);
    expect(wrapper.find('[data-field="cardType"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="render"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="nextReview"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="priority"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('转换提示');
    expect(wrapper.text()).not.toContain('schema');
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

    await wrapper.findAll('.srs-type-option')[2].trigger('click');
    await flushPromises();
    expect(updateCardType).toHaveBeenCalledWith('card-1', CardType.Concept);

    await wrapper.get('[data-field="render"] select').setValue('descriptor-reverse');
    await flushPromises();
    expect(updateRender).toHaveBeenCalledWith('card-1', 'descriptor-reverse');

    await wrapper.get('[data-field="nextReview"] .b3-button').trigger('click');
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

    expect(wrapper.text()).toContain('当前渲染与该类型的推荐渲染不一致');
    expect(wrapper.text()).toContain('推荐渲染');
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
