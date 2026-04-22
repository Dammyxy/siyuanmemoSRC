<template>
  <div class="srs-editor">
    <div v-if="banner" class="srs-editor__banner" :class="`srs-editor__banner--${banner.kind}`">{{ banner.message }}</div>

    <div v-if="loadError" class="srs-editor__empty">
      <svg><use xlink:href="#iconWarning"></use></svg>
      <span>{{ loadError }}</span>
    </div>

    <template v-else-if="snapshot && currentCard">
      <section class="srs-panel srs-panel--inspector">
        <div class="srs-inspector__meta">
          <span class="srs-editor__chip srs-editor__chip--accent">{{ transparency?.schedulerLabel || currentCard.schedulerType || 'fsrs-v6' }}</span>
          <span class="srs-editor__chip">{{ formatCardType(currentCard.type) }}</span>
          <span class="srs-editor__chip srs-editor__chip--muted">{{ currentStateLabel }}</span>
          <span v-if="isDismissed" class="srs-editor__chip srs-editor__chip--warning">{{ t('suspended', 'Suspended') }}</span>
        </div>
        <p v-if="transparency" class="srs-inspector__summary">{{ transparency.summary }}</p>
      </section>

      <details
        data-section="more-edit"
        class="srs-panel srs-panel--details"
        :open="moreEditOpen"
        @toggle="handleDetailsToggle($event, 'moreEdit')"
      >
        <summary class="srs-panel__summary">{{ t('srsMoreEditTitle', '更多编辑') }}</summary>
        <div class="srs-detail-stack">
          <section class="srs-inline-editor" data-field="cardType">
            <div class="srs-inline-editor__header">
              <div>
                <p class="srs-inline-editor__label">{{ t('cardType', '卡片类型') }}</p>
                <p class="srs-inline-editor__helper">{{ t('cardTypeHelper', '立即保存，并同步更新渲染元数据。') }}</p>
              </div>
              <span v-if="isLoading('cardType')" class="srs-inline-editor__status">{{ t('saving', '保存中') }}</span>
            </div>
            <div class="srs-type-grid srs-type-grid--compact">
              <button
                v-for="option in cardTypeOptions"
                :key="option.value"
                class="srs-type-option"
                :class="{ 'srs-type-option--active': currentCard.type === option.value }"
                :disabled="isLoading('cardType')"
                @click="commitCardType(option.value)"
              >
                <span class="srs-type-option__title">{{ option.label }}</span>
                <span class="srs-type-option__desc">{{ option.description }}</span>
              </button>
            </div>
          </section>

          <section class="srs-inline-editor" data-field="render">
            <div class="srs-inline-editor__header">
              <div>
                <p class="srs-inline-editor__label">{{ t('render', '渲染') }}</p>
                <p class="srs-inline-editor__helper">{{ t('renderHelper', '仅修改渲染元数据，不改卡片类型。') }}</p>
              </div>
              <span v-if="isLoading('render')" class="srs-inline-editor__status">{{ t('saving', '保存中') }}</span>
            </div>
            <div class="srs-inline-editor__control">
              <select
                class="b3-select srs-input"
                :value="currentRenderTarget || 'default'"
                :disabled="isLoading('render')"
                @change="handleRenderChange"
              >
                <option v-for="option in renderTargetOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <p class="srs-inline-editor__value">{{ currentRenderLabel }}</p>
              <p class="srs-render-status" :class="{ 'srs-render-status--warning': !isRenderRecommended, 'srs-render-status--ok': isRenderRecommended }">
                {{ renderRecommendationText }}
              </p>
            </div>
          </section>

          <section class="srs-inline-editor" data-field="priority">
            <div class="srs-inline-editor__header">
              <div>
                <p class="srs-inline-editor__label">{{ t('priority', '优先级') }}</p>
                <p class="srs-inline-editor__helper">{{ t('priorityHelper', '范围 0-100，数值越小越优先。') }}</p>
              </div>
              <span v-if="isLoading('priority')" class="srs-inline-editor__status">{{ t('saving', '保存中') }}</span>
            </div>
            <div class="srs-inline-editor__control srs-inline-editor__control--split">
              <input
                v-model="priorityDraft"
                type="number"
                min="0"
                max="100"
                class="b3-text-field srs-input"
                :disabled="isLoading('priority')"
                @keydown.enter.prevent="commitPriority"
                @blur="commitPriority"
              />
              <p class="srs-inline-editor__value">{{ `${formatNumber(currentCard.priority)} / 100` }}</p>
            </div>
          </section>
        </div>
      </details>

      <section class="srs-panel">
        <div class="srs-panel__header srs-panel__header--compact">
          <div>
            <h3>{{ t('srsStateSummaryTitle', '当前状态') }}</h3>
            <p>{{ t('srsStateSummaryDesc', '先看最影响判断的六个状态字段，其余调度细节放到下方折叠区。') }}</p>
          </div>
        </div>

        <div class="srs-summary-grid">
          <div v-for="item in summaryItems" :key="item.label" class="srs-summary-item">
            <p class="srs-summary-item__label">{{ item.label }}</p>
            <p class="srs-summary-item__value">{{ item.value }}</p>
          </div>
        </div>
      </section>

      <section class="srs-panel">
        <div class="srs-panel__header srs-panel__header--compact">
          <div>
            <h3>{{ t('srsPrimaryActionsTitle', '常用操作') }}</h3>
            <p>{{ t('srsPrimaryActionsDesc', '把最常用的调度动作放在首屏，减少来回滚动。') }}</p>
          </div>
          <button
            data-action="refresh"
            class="b3-button b3-button--outline"
            :disabled="isLoading('snapshot')"
            @click="refreshSnapshot"
          >
            {{ t('refresh', '刷新') }}
          </button>
        </div>

        <div class="srs-action-row">
          <button
            data-action="schedule"
            class="b3-button"
            :disabled="isLoading('nextReview')"
            @click="openScheduleDateDialog"
          >
            <svg><use xlink:href="#iconCalendar"></use></svg>
            {{ t('scheduleDate', '安排复习日期') }}
          </button>
          <button
            data-action="dismiss"
            class="b3-button"
            :class="isDismissed ? 'b3-button--outline' : 'b3-button--warning'"
            :disabled="isLoading('dismiss')"
            @click="commitDismissed(!isDismissed)"
          >
            {{ isDismissed ? t('restore', 'Restore') : t('suspend', 'Suspend') }}
          </button>
        </div>
      </section>

      <details
        data-section="scheduling-details"
        class="srs-panel srs-panel--details"
        :open="detailsOpen"
        @toggle="handleDetailsToggle($event, 'details')"
      >
        <summary class="srs-panel__summary">{{ t('srsSchedulingDetailsTitle', '调度细节') }}</summary>
        <div class="srs-detail-stack">
          <section class="srs-detail-section">
            <div class="srs-detail-section__header">
              <h4>{{ t('srsAdvancedStateTitle', '进阶状态') }}</h4>
              <p>{{ t('srsAdvancedStateDesc', '这里保留更技术化的状态字段，方便排查为什么会排成这样。') }}</p>
            </div>
            <div class="srs-details-grid srs-details-grid--compact">
              <div v-for="item in advancedStateItems" :key="item.label" class="srs-detail">
                <p class="srs-detail__label">{{ item.label }}</p>
                <p class="srs-detail__value" :class="{ 'srs-detail__value--mono': item.mono }">{{ item.value }}</p>
              </div>
            </div>
          </section>

          <section v-if="transparency" class="srs-detail-section">
            <div class="srs-detail-section__header">
              <h4>{{ t('srsTransparencyAlgorithmFacts', '算法特有字段') }}</h4>
              <p>{{ t('srsTransparencyAlgorithmFactsDesc', '不同调度器会显示不同的关键参数，但都走同一个透明层外壳。') }}</p>
            </div>
            <div class="srs-details-grid srs-details-grid--compact">
              <div v-for="fact in transparency.algorithmFacts" :key="`algo-${fact.label}`" class="srs-detail">
                <p class="srs-detail__label">{{ fact.label }}</p>
                <p class="srs-detail__value" :class="{ 'srs-detail__value--mono': fact.mono }">{{ fact.value }}</p>
              </div>
            </div>
          </section>

          <section class="srs-detail-section">
            <div class="srs-detail-section__header">
              <h4>{{ t('technicalDetails', 'Technical Details') }}</h4>
              <p>{{ t('srsTechnicalDetailsDesc', '这里放原始标识和渲染元数据，适合需要核对存储状态时再看。') }}</p>
            </div>
            <div class="srs-details-grid srs-details-grid--compact">
              <div v-for="item in technicalItems" :key="item.label" class="srs-detail">
                <p class="srs-detail__label">{{ item.label }}</p>
                <p class="srs-detail__value" :class="{ 'srs-detail__value--mono': item.mono }">{{ item.value }}</p>
              </div>
            </div>
          </section>
        </div>
      </details>

      <details
        data-section="danger-zone"
        class="srs-panel srs-panel--details srs-panel--danger"
        :open="dangerOpen"
        @toggle="handleDetailsToggle($event, 'danger')"
      >
        <summary class="srs-panel__summary">{{ t('dangerZone', 'Danger Zone') }}</summary>
        <div class="srs-danger">
          <div>
            <p class="srs-danger__title">{{ t('dangerZone', 'Danger Zone') }}</p>
            <p class="srs-danger__desc">{{ t('dangerZoneDesc', '重置会清空本卡的复习进度，但保留卡片本身。') }}</p>
          </div>
          <button class="b3-button b3-button--warning" :disabled="isLoading('reset')" @click="handleReset">
            {{ t('resetProgress', '重置学习进度') }}
          </button>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import ScheduleDateDialog from '@/ui/review/v2/dialogs/ScheduleDateDialog.vue';
import type { ScheduleOptions } from '@/ui/review/v2/dialogs/ScheduleDateDialog.vue';
import type FSRSPlugin from '@/index';
import { createLogger } from '@/utils/logger';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { CardEditorApplicationService, CardEditorSnapshot } from '@/application/services/CardEditorApplicationService';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { SrsTransparencyApplicationService, SrsTransparencyViewModel } from '@/application/services/SrsTransparencyApplicationService';
import type { DataChangeEvent, IDataSourceObserver, IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { resolveRecommendedRenderTargetForType, type EditableCardType } from '@/application/services/card-editor/applyCardTypeTransition';
import { getRenderTargetLabel, getRenderTargetOptions, resolveEditableRenderTarget, type EditableRenderTarget } from '@/application/services/card-editor/applyRenderTargetTransition';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';

const logger = createLogger('SrsEditorDialog');

type BannerState = { kind: 'success' | 'error' | 'info'; message: string };
type DetailItem = { label: string; value: string; mono?: boolean };
type CardTypeOption = { value: EditableCardType; label: string; description: string };

const props = defineProps<{
  card: { id?: string; cardID?: string; blockId?: string; blockID?: string; deckId?: string; deckID?: string };
  deckId?: string;
  deckID?: string;
  i18n?: Record<string, string>;
  plugin?: FSRSPlugin;
  reviewService?: ReviewApplicationService;
}>();
const emit = defineEmits<{
  (e: 'scheduled', payload: { cardId: string; dueTimestamp: number }): void;
  (e: 'dismissed', payload: { cardId: string; blockId: string; dismissed: boolean }): void;
}>();

const snapshot = ref<CardEditorSnapshot | null>(null);
const transparency = ref<SrsTransparencyViewModel | null>(null);
const banner = ref<BannerState | null>(null);
const loadError = ref<string | null>(null);
const priorityDraft = ref('50');
const moreEditOpen = ref(true);
const detailsOpen = ref(false);
const dangerOpen = ref(false);
const loadingKeys = ref(new Set<string>());
const blockId = (props.card.blockId || props.card.blockID || '').trim();
const initialCardId = (props.card.id || props.card.cardID || '').trim();
let subscribedManager: IUnifiedDataSourceManagerFacade | null = null;
let observerRefreshQueued = false;

const t = (key: string, fallback: string) => props.i18n?.[key] || fallback;
const getContext = () => props.plugin?.getContext?.();
const getReviewService = () => props.reviewService || getContext()?.getReviewService?.();
const getCardEditorService = (): CardEditorApplicationService | null => getContext()?.getCardEditorService?.() || null;
const getSrsTransparencyService = (): SrsTransparencyApplicationService | null => getContext()?.getSrsTransparencyService?.() || null;
const getUnifiedManager = (): IUnifiedDataSourceManagerFacade | null => getContext()?.getUnifiedDataSourceManager?.() || null;
const getSiyuanApi = () => getReviewService()?.getSiyuanApi?.();
const currentCard = computed(() => snapshot.value?.card ?? null);
const isDismissed = computed(() => currentCard.value ? isCardDismissed(currentCard.value) : false);
const currentStateLabel = computed(() => formatState(currentCard.value?.state));
const currentRenderTarget = computed<EditableRenderTarget | null>(() => currentCard.value ? resolveEditableRenderTarget(currentCard.value) : null);
const currentRenderLabel = computed(() => currentRenderTarget.value ? getRenderTargetLabel(currentRenderTarget.value, t) : '-');
const recommendedRenderTarget = computed<EditableRenderTarget | null>(() => {
  if (!currentCard.value || !currentRenderTarget.value) return null;
  return resolveRecommendedRenderTargetForType(currentCard.value.type as EditableCardType, currentRenderTarget.value);
});
const isRenderRecommended = computed(() => !currentRenderTarget.value || !recommendedRenderTarget.value || currentRenderTarget.value === recommendedRenderTarget.value);
const renderRecommendationText = computed(() => {
  if (isRenderRecommended.value) return t('renderRecommendedState', '当前为推荐渲染');
  return `${t('renderMismatchWarning', '当前渲染与该类型的推荐渲染不一致，请检查卡片表现。')} ${t('recommendedRender', '推荐渲染')}: ${getRenderTargetLabel(recommendedRenderTarget.value!, t)}`;
});
const renderTargetOptions = computed(() => getRenderTargetOptions(t));

function isLoading(key: string | undefined): boolean { return key ? loadingKeys.value.has(key) : false; }
async function withLoading<T>(key: string, task: () => Promise<T>): Promise<T> {
  const next = new Set(loadingKeys.value);
  next.add(key);
  loadingKeys.value = next;
  try { return await task(); } finally {
    const current = new Set(loadingKeys.value);
    current.delete(key);
    loadingKeys.value = current;
  }
}
function syncDrafts(nextSnapshot: CardEditorSnapshot | null): void { priorityDraft.value = String(nextSnapshot?.card.priority ?? 50); }
function getTrackedCardId(): string { return String(currentCard.value?.id || initialCardId || '').trim(); }
function formatDateTime(timestamp?: number | null, fallback = '-'): string { return !timestamp || !Number.isFinite(timestamp) || timestamp <= 0 ? fallback : new Date(timestamp).toLocaleString(); }
function formatDays(value?: number | null): string { return value == null || !Number.isFinite(value) ? '-' : `${Number(value).toFixed(1)} ${t('days', '天')}`; }
function formatNumber(value?: number | null, digits?: number): string { return value == null || !Number.isFinite(value) ? '-' : (digits == null ? String(value) : value.toFixed(digits)); }
function formatState(state?: CardState): string {
  switch (state) {
    case CardState.New: return t('newCard', '新卡');
    case CardState.Learning: return t('learning', '学习中');
    case CardState.Review: return t('reviewCard', '复习卡');
    case CardState.Relearning: return t('relearning', '重学');
    case CardState.Suspended: return t('suspended', '暂停');
    default: return t('unknown', '未知');
  }
}
function formatCardType(type?: CardType): string {
  switch (type) {
    case CardType.Topic: return t('topicCard', 'Topic 卡片');
    case CardType.Item: return t('itemCard', 'Item 卡片');
    case CardType.Concept: return t('conceptCard', '概念卡');
    case CardType.Descriptor: return t('descriptorCard', '描述符卡');
    default: return t('unknown', '未知');
  }
}
function getMetaRecord(card: FSRSCard | null): Record<string, unknown> { return card?.meta && typeof card.meta === 'object' ? (card.meta as Record<string, unknown>) : {}; }
function buildTransparency(nextSnapshot: CardEditorSnapshot | null): SrsTransparencyViewModel | null {
  if (!nextSnapshot) return null;
  const service = getSrsTransparencyService();
  if (!service) return null;
  try {
    return service.build(nextSnapshot, { t });
  } catch (error) {
    logger.warn('Failed to build SRS transparency snapshot', { error });
    return null;
  }
}
function applySnapshot(nextSnapshot: CardEditorSnapshot | null): void {
  snapshot.value = nextSnapshot;
  transparency.value = buildTransparency(nextSnapshot);
  syncDrafts(nextSnapshot);
}
function handleDetailsToggle(event: Event, section: 'moreEdit' | 'details' | 'danger'): void {
  const open = (event.target as HTMLDetailsElement | null)?.open === true;
  if (section === 'moreEdit') moreEditOpen.value = open;
  if (section === 'details') detailsOpen.value = open;
  if (section === 'danger') dangerOpen.value = open;
}
async function announce(kind: BannerState['kind'], message: string): Promise<void> {
  banner.value = { kind, message };
  const siyuanApi = getSiyuanApi();
  if (!siyuanApi) return;
  if (kind === 'error') { await siyuanApi.pushErrMsg(message, 3000); return; }
  await siyuanApi.pushMsg(message, 3000);
}
async function refreshSnapshot(): Promise<void> {
  if (!blockId) { loadError.value = t('cardNotFound', '未找到卡片'); return; }
  const cardEditorService = getCardEditorService();
  if (!cardEditorService) { loadError.value = t('envNotInit', '环境未初始化'); return; }
  await withLoading('snapshot', async () => {
    try {
      applySnapshot(await cardEditorService.loadSnapshot(blockId, getTrackedCardId()));
      loadError.value = null;
    } catch (error) {
      logger.error('Failed to load SRS editor snapshot', error);
      loadError.value = error instanceof Error ? error.message : t('cardNotFound', '未找到卡片');
    }
  });
}

function isRelevantDataChange(event: DataChangeEvent): boolean {
  if (event.type !== 'card-updated') return false;
  const trackedIds = new Set([blockId, getTrackedCardId()].filter(Boolean));
  return trackedIds.size > 0 && (event.cardIds || []).some((id) => trackedIds.has(String(id || '').trim()));
}
function queueSnapshotRefreshFromObserver(): void {
  if (observerRefreshQueued) return;
  observerRefreshQueued = true;
  void Promise.resolve().then(async () => {
    observerRefreshQueued = false;
    if (loadingKeys.value.size > 0) return;
    await refreshSnapshot();
  });
}
const dataObserver: IDataSourceObserver = { onDataChanged(event) { if (isRelevantDataChange(event)) queueSnapshotRefreshFromObserver(); } };
function bindManagerObserver(): void {
  const manager = getUnifiedManager();
  if (manager === subscribedManager) return;
  if (subscribedManager) subscribedManager.unregisterObserver(dataObserver);
  subscribedManager = manager;
  subscribedManager?.registerObserver(dataObserver);
}
function unbindManagerObserver(): void {
  if (!subscribedManager) return;
  subscribedManager.unregisterObserver(dataObserver);
  subscribedManager = null;
}

const cardTypeOptions = computed<CardTypeOption[]>(() => [
  { value: CardType.Item, label: t('itemCard', 'Item 卡片'), description: t('itemCardDesc', '问答卡片，使用常规调度。') },
  { value: CardType.Topic, label: t('topicCard', 'Topic 卡片'), description: t('topicCardDesc', '阅读主题，切换为标准渲染与 Topic 调度。') },
  { value: CardType.Concept, label: t('conceptCard', '概念卡'), description: t('conceptCardDesc', '概念语义，切换到概念渲染。') },
  { value: CardType.Descriptor, label: t('descriptorCard', '描述符卡'), description: t('descriptorCardDesc', '保留描述符方向，默认正向渲染。') },
]);

const summaryItems = computed<DetailItem[]>(() => currentCard.value ? [
  { label: t('state', '状态'), value: formatState(currentCard.value.state) },
  { label: t('nextReview', '下次复习'), value: formatDateTime(currentCard.value.due, t('pending', '待安排')) },
  { label: t('lastReview', '上次复习'), value: formatDateTime(currentCard.value.lastReview, t('pending', '未复习')) },
  { label: t('reps', '复习次数'), value: formatNumber(currentCard.value.reps) },
  { label: t('lapses', '遗忘次数'), value: formatNumber(currentCard.value.lapses) },
  { label: t('stability', '记忆强度'), value: formatDays(currentCard.value.stability) },
] : []);

const advancedStateItems = computed<DetailItem[]>(() => currentCard.value ? [
  { label: t('difficulty', '难度'), value: formatNumber(currentCard.value.difficulty, 2) },
  { label: t('scheduledDays', '安排间隔'), value: formatDays(currentCard.value.scheduledDays) },
  { label: t('elapsedDays', '已过天数'), value: formatNumber(currentCard.value.elapsedDays) },
  {
    label: t('updatedAt', '更新时间'),
    value: formatDateTime(snapshot.value?.blockInfo.updatedAt ?? currentCard.value.updatedAt),
  },
] : []);

const technicalItems = computed<DetailItem[]>(() => {
  if (!currentCard.value) return [];
  const card = currentCard.value;
  const meta = getMetaRecord(card);
  return [
    { label: t('cardId', 'Card ID'), value: card.id, mono: true },
    { label: t('blockId', 'Block ID'), value: card.blockId, mono: true },
    { label: t('createdAt', '创建时间'), value: formatDateTime(snapshot.value?.blockInfo.createdAt ?? card.createdAt) },
    { label: t('cardTypeMarker', '类型标记'), value: card.cardTypeMarker || '-' },
    { label: t('aFactor', 'A-Factor'), value: formatNumber(card.aFactor, 2) },
    { label: t('renderProfile', '渲染档案'), value: String(meta.renderProfile || '-') },
    { label: t('clozeRenderMode', 'Cloze Render Mode'), value: String(meta.clozeRenderMode || '-'), mono: true },
    { label: t('templateId', '模板 ID'), value: String(meta.templateID || '-'), mono: true },
    { label: t('typeMarker', 'Type Marker'), value: String(meta.typeMarker || '-'), mono: true },
  ];
});

async function commitCardType(targetType: EditableCardType): Promise<void> {
  if (!currentCard.value || currentCard.value.type === targetType) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('cardType', async () => {
    try {
      applySnapshot(await service.updateCardType(currentCard.value!.id, targetType));
      await announce('success', t('cardTypeSaved', '卡片类型已更新'));
    } catch (error) {
      logger.error('Failed to update card type', error);
      await announce('error', t('cardTypeSaveFailed', '卡片类型更新失败'));
    }
  });
}
async function commitRender(targetRender: EditableRenderTarget): Promise<void> {
  if (!currentCard.value || currentRenderTarget.value === targetRender) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('render', async () => {
    try {
      applySnapshot(await service.updateRender(currentCard.value!.id, targetRender));
      await announce('success', t('renderSaved', '渲染已更新'));
    } catch (error) {
      logger.error('Failed to update render target', error);
      await announce('error', t('renderSaveFailed', '渲染更新失败'));
    }
  });
}
function handleRenderChange(event: Event): void {
  const target = (event.target as HTMLSelectElement | null)?.value as EditableRenderTarget | undefined;
  if (target) void commitRender(target);
}
async function commitPriority(): Promise<void> {
  if (!currentCard.value) return;
  const nextPriority = Math.max(0, Math.min(100, Math.floor(Number(priorityDraft.value) || 0)));
  priorityDraft.value = String(nextPriority);
  if (nextPriority === currentCard.value.priority) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('priority', async () => {
    try {
      applySnapshot(await service.updatePriority(currentCard.value!.id, nextPriority));
      await announce('success', t('prioritySaved', '优先级已更新'));
    } catch (error) {
      logger.error('Failed to update priority', error);
      await announce('error', t('prioritySaveFailed', '优先级更新失败'));
    }
  });
}
async function commitDismissed(nextDismissed: boolean): Promise<void> {
  if (!currentCard.value) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', 'Environment not initialized')); return; }
  await withLoading('dismiss', async () => {
    try {
      const cardId = String(currentCard.value!.id || '').trim();
      const targetBlockId = String(currentCard.value!.blockId || blockId).trim();
      applySnapshot(await service.setDismissed(cardId, nextDismissed));
      if (cardId && targetBlockId) {
        emit('dismissed', { cardId, blockId: targetBlockId, dismissed: nextDismissed });
      }
      await announce('success', nextDismissed ? t('dismissedDone', 'Card suspended') : t('restoredDone', 'Card restored'));
    } catch (error) {
      logger.error('Failed to update dismissed state', error);
      await announce('error', nextDismissed ? t('dismissedFailed', 'Failed to suspend card') : t('restoredFailed', 'Failed to restore card'));
    }
  });
}

function resolveDueTimestamp(options: ScheduleOptions): number {
  if (options.dueDate) return new Date(options.dueDate).getTime();
  if (options.days) return Date.now() + options.days * 24 * 60 * 60 * 1000;
  return Date.now() + 7 * 24 * 60 * 60 * 1000;
}
async function handleScheduleDate(options: ScheduleOptions): Promise<void> {
  if (!currentCard.value) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('nextReview', async () => {
    try {
      const scheduledCardId = String(currentCard.value!.id || '').trim();
      const dueTimestamp = resolveDueTimestamp(options);
      applySnapshot(await service.scheduleCard(scheduledCardId, {
        mode: options.mode,
        rating: options.mode === 'rating' ? options.rating : undefined,
        dueTimestamp,
      }));
      if (scheduledCardId) {
        emit('scheduled', { cardId: scheduledCardId, dueTimestamp });
      }
      await announce('success', t('scheduleDone', '复习日期已更新'));
    } catch (error) {
      logger.error('Failed to schedule review date', error);
      await announce('error', t('scheduleFailed', '安排复习日期失败'));
    }
  });
}
function openScheduleDateDialog(): void {
  if (!currentCard.value) return;
  const scheduleCardType = currentCard.value.type === CardType.Topic || currentCard.value.type === CardType.Concept ? 'topic' : 'item';
  let dialogHandle: ReturnType<typeof createVueDialog> | null = null;
  dialogHandle = createVueDialog({
    title: t('scheduleDate', '安排复习日期'),
    component: ScheduleDateDialog,
    props: { cardType: scheduleCardType, i18n: props.i18n || {} },
    width: '520px',
    height: '600px',
    events: {
      confirm: async (options: unknown) => {
        await handleScheduleDate(options as ScheduleOptions);
        dialogHandle?.destroy();
      },
      cancel: () => { dialogHandle?.destroy(); },
    },
  });
}

async function handleReset(): Promise<void> {
  if (!currentCard.value) return;
  const confirmed = await confirmDialog({ title: t('resetConfirmTitle', '确认重置学习进度'), content: t('resetConfirmContent', '这会清空本卡的复习历史，且不能撤销。是否继续？'), confirmText: t('confirm', '确认'), cancelText: t('cancel', '取消') });
  if (!confirmed) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('reset', async () => {
    try {
      applySnapshot(await service.resetProgress(currentCard.value!.id));
      await announce('success', t('resetDone', '学习进度已重置'));
    } catch (error) {
      logger.error('Failed to reset card progress', error);
      await announce('error', t('resetFailed', '重置学习进度失败'));
    }
  });
}

onMounted(async () => {
  bindManagerObserver();
  await refreshSnapshot();
});
onBeforeUnmount(() => {
  unbindManagerObserver();
});
</script>

<style scoped>
.srs-editor{--srs-surface:color-mix(in srgb,var(--b3-theme-surface) 86%,white 14%);--srs-border:color-mix(in srgb,var(--b3-border-color) 78%,transparent 22%);--srs-accent:color-mix(in srgb,var(--b3-theme-primary) 82%,#1f5fbf 18%);--srs-accent-soft:color-mix(in srgb,var(--b3-theme-primary-lightest) 74%,white 26%);flex:1 1 auto;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;height:100%;min-height:0;padding:14px;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 94%,var(--b3-theme-surface) 6%),var(--b3-theme-background))}
.srs-editor__banner,.srs-panel,.srs-editor__empty,.srs-preview-pill,.srs-preview-detail,.srs-summary-item,.srs-inline-editor,.srs-detail,.srs-type-option{border:1px solid var(--srs-border);border-radius:14px}
.srs-editor__banner{padding:10px 12px;background:var(--srs-surface);color:var(--b3-theme-on-surface)}
.srs-editor__banner--success{border-color:color-mix(in srgb,var(--b3-theme-success) 40%,var(--srs-border) 60%);background:color-mix(in srgb,var(--b3-theme-success-lightest) 74%,white 26%)}
.srs-editor__banner--error{border-color:color-mix(in srgb,var(--b3-theme-error) 40%,var(--srs-border) 60%);background:color-mix(in srgb,var(--b3-theme-error-lightest) 74%,white 26%)}
.srs-editor__empty{display:flex;align-items:center;gap:10px;padding:16px;color:var(--b3-theme-on-surface-light);background:var(--srs-surface)}
.srs-editor__empty svg,.srs-action-row .b3-button svg{width:14px;height:14px}
.srs-panel{display:flex;flex-direction:column;gap:12px;padding:14px;background:var(--srs-surface);box-shadow:0 10px 24px rgba(0,0,0,.04)}
.srs-panel--inspector{background:linear-gradient(180deg,color-mix(in srgb,var(--srs-accent-soft) 72%,white 28%),rgba(255,255,255,.92))}
.srs-panel--danger{background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-warning-lightest) 80%,white 20%),var(--srs-surface))}
.srs-inspector__meta,.srs-panel__header,.srs-inline-editor__header,.srs-danger{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.srs-inspector__meta{flex-wrap:wrap}
.srs-inspector__summary,.srs-panel__header p,.srs-inline-editor__helper,.srs-render-status,.srs-detail-section__header p,.srs-danger__desc{margin:0;color:var(--b3-theme-on-surface-light);line-height:1.45}
.srs-inspector__summary{font-size:13px}
.srs-panel__header h3,.srs-panel__summary,.srs-detail-section__header h4{margin:0;color:var(--b3-theme-on-surface)}
.srs-panel__header h3,.srs-panel__summary{font-size:15px;font-weight:700}
.srs-panel__header--compact{align-items:center}
.srs-panel__summary{cursor:pointer;list-style:none}
.srs-panel__summary::-webkit-details-marker{display:none}
.srs-panel--details[open] .srs-panel__summary{margin-bottom:10px}
.srs-editor__chip,.srs-inline-editor__status{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600}
.srs-editor__chip{background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.84);color:var(--b3-theme-on-surface)}
.srs-editor__chip--accent{background:color-mix(in srgb,var(--srs-accent-soft) 78%,white 22%);border-color:color-mix(in srgb,var(--srs-accent) 38%,white 62%);color:var(--srs-accent)}
.srs-editor__chip--muted{background:transparent;border-color:var(--srs-border)}
.srs-editor__chip--warning{background:color-mix(in srgb,var(--b3-theme-warning-lightest) 82%,white 18%);border-color:color-mix(in srgb,var(--b3-theme-warning) 36%,var(--srs-border) 64%)}
.srs-summary-grid,.srs-details-grid,.srs-type-grid{display:grid;gap:8px}
.srs-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.srs-details-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.srs-type-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.srs-summary-item__label,.srs-inline-editor__label,.srs-detail__label,.srs-danger__title{margin:0;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--b3-theme-on-surface-light)}
.srs-summary-item__value,.srs-inline-editor__value,.srs-detail__value{margin:0;font-weight:600;color:var(--b3-theme-on-surface)}
.srs-summary-item,.srs-detail{display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:color-mix(in srgb,var(--b3-theme-background) 82%,white 18%)}
.srs-action-row{display:flex;flex-wrap:wrap;gap:10px}
.srs-action-row .b3-button{display:inline-flex;align-items:center;gap:8px}
.srs-detail-stack{display:flex;flex-direction:column;gap:10px}
.srs-inline-editor,.srs-detail-section{display:flex;flex-direction:column;gap:10px}
.srs-inline-editor{padding:12px;background:rgba(255,255,255,.72)}
.srs-inline-editor__control{display:flex;flex-direction:column;gap:8px}
.srs-inline-editor__control--split{display:grid;grid-template-columns:minmax(0,160px) auto;align-items:center;gap:10px}
.srs-inline-editor__status{background:var(--srs-accent-soft);color:var(--srs-accent)}
.srs-input{height:40px;font-size:14px;font-weight:600}
.srs-type-grid--compact .srs-type-option{min-height:0}
.srs-type-option{display:flex;flex-direction:column;gap:4px;padding:10px 12px;text-align:left;background:rgba(255,255,255,.78);transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.srs-type-option:hover:not(:disabled){transform:translateY(-1px);border-color:color-mix(in srgb,var(--srs-accent) 46%,var(--srs-border) 54%);box-shadow:0 8px 16px rgba(31,95,191,.1)}
.srs-type-option--active{border-color:color-mix(in srgb,var(--srs-accent) 60%,var(--srs-border) 40%);background:linear-gradient(180deg,white,color-mix(in srgb,var(--srs-accent-soft) 82%,white 18%))}
.srs-type-option__title{margin:0;font-weight:600;color:var(--b3-theme-on-surface)}
.srs-type-option__desc{font-size:12px;line-height:1.45;color:var(--b3-theme-on-surface-light)}
.srs-render-status--ok{color:color-mix(in srgb,var(--b3-theme-success) 82%,var(--b3-theme-on-surface) 18%)}
.srs-render-status--warning{color:color-mix(in srgb,var(--b3-theme-warning) 86%,var(--b3-theme-on-surface) 14%)}
.srs-detail__value--mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;word-break:break-all}
.srs-danger{align-items:center}
.srs-danger__title{font-weight:700}
@media (max-width:780px){.srs-summary-grid,.srs-details-grid,.srs-type-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.srs-panel__header,.srs-inline-editor__header,.srs-danger{flex-direction:column}.srs-inline-editor__control--split{grid-template-columns:1fr}}
@media (max-width:560px){.srs-summary-grid,.srs-details-grid,.srs-type-grid{grid-template-columns:1fr}}
</style>
