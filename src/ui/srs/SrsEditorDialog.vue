<template>
  <div class="srs-editor">
    <section class="srs-editor__hero">
      <div>
        <p class="srs-editor__eyebrow">{{ t('srsQuickEditTitle', 'Quick Edit') }}</p>
        <h2 class="srs-editor__title">{{ t('srsEditorTitle', '编辑 SRS 数据') }}</h2>
      </div>
      <div v-if="currentCard" class="srs-editor__hero-meta">
        <span class="srs-editor__chip">{{ formatCardType(currentCard.type) }}</span>
        <span class="srs-editor__chip">{{ currentRenderLabel }}</span>
        <span v-if="isDismissed" class="srs-editor__chip srs-editor__chip--warning">{{ t('suspended', 'Suspended') }}</span>
        <span class="srs-editor__chip srs-editor__chip--muted">{{ currentStateLabel }}</span>
      </div>
    </section>

    <div v-if="banner" class="srs-editor__banner" :class="`srs-editor__banner--${banner.kind}`">{{ banner.message }}</div>

    <div v-if="loadError" class="srs-editor__empty">
      <svg><use xlink:href="#iconWarning"></use></svg>
      <span>{{ loadError }}</span>
    </div>

    <template v-else-if="snapshot">
      <section class="srs-panel srs-panel--quick">
        <div class="srs-panel__header">
          <h3>{{ t('srsQuickEditTitle', 'Quick Edit') }}</h3>
          <button class="b3-button b3-button--outline" :disabled="isLoading('snapshot')" @click="refreshSnapshot">
            {{ t('refresh', '刷新') }}
          </button>
        </div>

        <article class="srs-editor__notice">
          <p class="srs-editor__notice-title">{{ t('srsConversionNoticeTitle', '转换提示') }}</p>
          <p class="srs-editor__notice-body">
            {{ t('srsConversionNoticeBody', '修改卡片类型会影响语义和调度；修改渲染只会调整显示元数据，不会重写问答映射或块结构。改完类型后请检查渲染是否适配当前卡片内容。') }}
          </p>
        </article>

        <div class="srs-field-grid">
          <article v-for="field in quickFields" :key="field.id" class="srs-field-card" :data-field="field.id">
            <div class="srs-field-card__header">
              <div>
                <p class="srs-field-card__label">{{ field.label }}</p>
                <p class="srs-field-card__helper">{{ field.helperText }}</p>
              </div>
              <span v-if="field.loadingKey && isLoading(field.loadingKey)" class="srs-field-card__status">{{ t('saving', '保存中') }}</span>
            </div>

            <div v-if="field.kind === 'card-type'" class="srs-type-grid">
              <button
                v-for="option in cardTypeOptions"
                :key="option.value"
                class="srs-type-option"
                :class="{ 'srs-type-option--active': currentCard?.type === option.value }"
                :disabled="isLoading(field.loadingKey)"
                @click="commitCardType(option.value)"
              >
                <span class="srs-type-option__title">{{ option.label }}</span>
                <span class="srs-type-option__desc">{{ option.description }}</span>
              </button>
            </div>

            <div v-else-if="field.kind === 'render-target'" class="srs-field-stack">
              <select class="b3-select srs-input" :value="currentRenderTarget || 'default'" :disabled="isLoading(field.loadingKey)" @change="handleRenderChange">
                <option v-for="option in renderTargetOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <p class="srs-field-card__value">{{ field.value }}</p>
              <p class="srs-render-status" :class="{ 'srs-render-status--warning': !isRenderRecommended, 'srs-render-status--ok': isRenderRecommended }">
                {{ renderRecommendationText }}
              </p>
            </div>

            <div v-else-if="field.kind === 'priority'" class="srs-field-stack">
              <input v-model="priorityDraft" type="number" min="0" max="100" class="b3-text-field srs-input" :disabled="isLoading(field.loadingKey)" @keydown.enter.prevent="commitPriority" @blur="commitPriority" />
              <div class="srs-field-card__value">{{ field.value }}</div>
            </div>

            <div v-else-if="field.kind === 'schedule-date'" class="srs-field-stack">
              <div class="srs-schedule-value">{{ field.value }}</div>
              <button class="b3-button b3-button--text" :disabled="isLoading(field.loadingKey)" @click="openScheduleDateDialog">
                <svg><use xlink:href="#iconCalendar"></use></svg>
                {{ t('scheduleDate', '安排复习日期') }}
              </button>
            </div>
            <div v-else-if="field.kind === 'dismiss-toggle'" class="srs-field-stack">
              <div class="srs-field-card__value">{{ field.value }}</div>
              <button
                class="b3-button"
                :class="isDismissed ? 'b3-button--outline' : 'b3-button--warning'"
                :disabled="isLoading(field.loadingKey)"
                @click="commitDismissed(!isDismissed)"
              >
                {{ isDismissed ? t('restore', 'Restore') : t('suspend', 'Suspend') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="srs-panel">
        <div class="srs-panel__header">
          <div>
            <h3>{{ t('reviewSnapshot', 'Review Snapshot') }}</h3>
            <p>{{ t('reviewSnapshotDesc', '用于校对当前卡片的复习状态，编辑保存后会立即刷新。') }}</p>
          </div>
        </div>
        <div class="srs-stats-grid">
          <div v-for="item in snapshotItems" :key="item.label" class="srs-stat">
            <p class="srs-stat__label">{{ item.label }}</p>
            <p class="srs-stat__value">{{ item.value }}</p>
          </div>
        </div>
      </section>

      <details class="srs-panel srs-panel--details">
        <summary class="srs-panel__summary">{{ t('technicalDetails', 'Technical Details') }}</summary>
        <div class="srs-details-grid">
          <div v-for="item in technicalItems" :key="item.label" class="srs-detail">
            <p class="srs-detail__label">{{ item.label }}</p>
            <p class="srs-detail__value" :class="{ 'srs-detail__value--mono': item.mono }">{{ item.value }}</p>
          </div>
        </div>
      </details>

      <section class="srs-panel srs-panel--danger">
        <div class="srs-panel__header">
          <div>
            <h3>{{ t('dangerZone', 'Danger Zone') }}</h3>
            <p>{{ t('dangerZoneDesc', '重置会清空本卡的复习进度，但保留卡片本身。') }}</p>
          </div>
        </div>
        <button class="b3-button b3-button--warning" :disabled="isLoading('reset')" @click="handleReset">
          {{ t('resetProgress', '重置学习进度') }}
        </button>
      </section>
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
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { CardEditorApplicationService, CardEditorSnapshot } from '@/application/services/CardEditorApplicationService';
import type { DataChangeEvent, IDataSourceObserver, IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { resolveRecommendedRenderTargetForType, type EditableCardType } from '@/application/services/card-editor/applyCardTypeTransition';
import { getRenderTargetLabel, getRenderTargetOptions, resolveEditableRenderTarget, type EditableRenderTarget } from '@/application/services/card-editor/applyRenderTargetTransition';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import type { SrsEditorFieldDefinition } from './types';

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
const banner = ref<BannerState | null>(null);
const loadError = ref<string | null>(null);
const priorityDraft = ref('50');
const loadingKeys = ref(new Set<string>());
const blockId = (props.card.blockId || props.card.blockID || '').trim();
const initialCardId = (props.card.id || props.card.cardID || '').trim();
let subscribedManager: IUnifiedDataSourceManagerFacade | null = null;
let observerRefreshQueued = false;

const t = (key: string, fallback: string) => props.i18n?.[key] || fallback;
const getContext = () => props.plugin?.getContext?.();
const getReviewService = () => props.reviewService || getContext()?.getReviewService?.();
const getCardEditorService = (): CardEditorApplicationService | null => getContext()?.getCardEditorService?.() || null;
const getUnifiedManager = (): IUnifiedDataSourceManagerFacade | null => getContext()?.getUnifiedDataSourceManager?.() || null;
const getSiyuanApi = () => getReviewService()?.getSiyuanApi?.();
const currentCard = computed(() => snapshot.value?.card ?? null);
const isDismissed = computed(() => currentCard.value ? isCardDismissed(currentCard.value) : false);
const currentStateLabel = computed(() => isDismissed.value ? t('suspended', 'Suspended') : formatState(currentCard.value?.state));
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
  const next = new Set(loadingKeys.value); next.add(key); loadingKeys.value = next;
  try { return await task(); } finally {
    const current = new Set(loadingKeys.value); current.delete(key); loadingKeys.value = current;
  }
}
function syncDrafts(nextSnapshot: CardEditorSnapshot | null): void { priorityDraft.value = String(nextSnapshot?.card.priority ?? 50); }
function getTrackedCardId(): string { return String(currentCard.value?.id || initialCardId || '').trim(); }
function formatDateTime(timestamp?: number | null, fallback = '-'): string { return !timestamp || !Number.isFinite(timestamp) || timestamp <= 0 ? fallback : new Date(timestamp).toLocaleString(); }
function formatDays(value?: number | null): string { return value == null || !Number.isFinite(value) ? '-' : `${Number(value).toFixed(1)} ${t('days', '天')}`; }
function formatNumber(value?: number | null, digits?: number): string { return value == null || !Number.isFinite(value) ? '-' : (digits == null ? String(value) : value.toFixed(digits)); }
function formatState(state?: CardState): string {
  switch (state) { case CardState.New: return t('newCard', '新卡'); case CardState.Learning: return t('learning', '学习中'); case CardState.Review: return t('reviewCard', '复习卡'); case CardState.Relearning: return t('relearning', '重学'); case CardState.Suspended: return t('suspended', '暂停'); default: return t('unknown', '未知'); }
}
function formatCardType(type?: CardType): string {
  switch (type) { case CardType.Topic: return t('topicCard', 'Topic 卡片'); case CardType.Item: return t('itemCard', 'Item 卡片'); case CardType.Concept: return t('conceptCard', '概念卡'); case CardType.Descriptor: return t('descriptorCard', '描述符卡'); default: return t('unknown', '未知'); }
}
function getMetaRecord(card: FSRSCard | null): Record<string, unknown> { return card?.meta && typeof card.meta === 'object' ? (card.meta as Record<string, unknown>) : {}; }
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
      const nextSnapshot = await cardEditorService.loadSnapshot(blockId, getTrackedCardId());
      snapshot.value = nextSnapshot; syncDrafts(nextSnapshot); loadError.value = null;
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

const quickFields = computed<SrsEditorFieldDefinition[]>(() => currentCard.value ? [
  { id: 'cardType', label: t('cardType', '卡片类型'), kind: 'card-type', commitMode: 'immediate', editable: true, value: formatCardType(currentCard.value.type), helperText: t('cardTypeHelper', '立即保存，并按默认策略同步推荐渲染。'), loadingKey: 'cardType' },
  { id: 'render', label: t('render', '渲染'), kind: 'render-target', commitMode: 'immediate', editable: true, value: currentRenderLabel.value, helperText: t('renderHelper', '仅修改渲染元数据，不改卡片类型。'), loadingKey: 'render' },
  { id: 'nextReview', label: t('nextReview', '下次复习'), kind: 'schedule-date', commitMode: 'dialog', editable: true, value: formatDateTime(currentCard.value.due, t('pending', '待安排')), helperText: t('nextReviewHelper', '继续复用现有安排日期对话框。'), loadingKey: 'nextReview' },
  { id: 'priority', label: t('priority', '优先级'), kind: 'priority', commitMode: 'immediate', editable: true, value: `${formatNumber(currentCard.value.priority)} / 100`, helperText: t('priorityHelper', '范围 0-100，数值越小越优先。'), loadingKey: 'priority' },
  { id: 'dismiss', label: t('suspend', 'Suspend'), kind: 'dismiss-toggle', commitMode: 'immediate', editable: true, value: isDismissed.value ? t('suspended', 'Suspended') : t('active', 'Active'), helperText: t('dismissHelper', 'Suspend this card without changing its SRS history.'), loadingKey: 'dismiss' },
] : []);

const snapshotItems = computed<DetailItem[]>(() => currentCard.value ? [
  { label: t('state', '状态'), value: formatState(currentCard.value.state) },
  { label: t('reps', '复习次数'), value: formatNumber(currentCard.value.reps) },
  { label: t('lapses', '遗忘次数'), value: formatNumber(currentCard.value.lapses) },
  { label: t('stability', '记忆强度'), value: formatDays(currentCard.value.stability) },
  { label: t('difficulty', '难度'), value: formatNumber(currentCard.value.difficulty, 2) },
  { label: t('scheduledDays', '安排间隔'), value: formatNumber(currentCard.value.scheduledDays) },
  { label: t('elapsedDays', '已过天数'), value: formatNumber(currentCard.value.elapsedDays) },
  { label: t('lastReview', '上次复习'), value: formatDateTime(currentCard.value.lastReview, t('pending', '未复习')) },
] : []);

const technicalItems = computed<DetailItem[]>(() => {
  if (!currentCard.value) return [];
  const card = currentCard.value; const meta = getMetaRecord(card);
  return [
    { label: t('cardId', 'Card ID'), value: card.id, mono: true },
    { label: t('blockId', 'Block ID'), value: card.blockId, mono: true },
    { label: t('createdAt', '创建时间'), value: formatDateTime(snapshot.value?.blockInfo.createdAt ?? card.createdAt) },
    { label: t('updatedAt', '更新时间'), value: formatDateTime(snapshot.value?.blockInfo.updatedAt ?? card.updatedAt) },
    { label: t('schedulerType', '调度器'), value: card.schedulerType || 'fsrs-v6' },
    { label: t('cardTypeMarker', '类型标记'), value: card.cardTypeMarker || '-' },
    { label: t('aFactor', 'A-Factor'), value: formatNumber(card.aFactor, 2) },
    { label: t('renderProfile', '渲染档案'), value: String(meta.renderProfile || '-') },
    { label: t('templateId', '模板 ID'), value: String(meta.templateID || '-'), mono: true },
    { label: t('typeMarker', 'Type Marker'), value: String(meta.typeMarker || '-'), mono: true },
  ];
});

async function commitCardType(targetType: EditableCardType): Promise<void> {
  if (!currentCard.value || currentCard.value.type === targetType) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('cardType', async () => {
    try { snapshot.value = await service.updateCardType(currentCard.value!.id, targetType); syncDrafts(snapshot.value); await announce('success', t('cardTypeSaved', '卡片类型已更新')); }
    catch (error) { logger.error('Failed to update card type', error); await announce('error', t('cardTypeSaveFailed', '卡片类型更新失败')); }
  });
}

async function commitRender(targetRender: EditableRenderTarget): Promise<void> {
  if (!currentCard.value || currentRenderTarget.value === targetRender) return;
  const service = getCardEditorService();
  if (!service) { await announce('error', t('envNotInit', '环境未初始化')); return; }
  await withLoading('render', async () => {
    try { snapshot.value = await service.updateRender(currentCard.value!.id, targetRender); syncDrafts(snapshot.value); await announce('success', t('renderSaved', '渲染已更新')); }
    catch (error) { logger.error('Failed to update render target', error); await announce('error', t('renderSaveFailed', '渲染更新失败')); }
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
    try { snapshot.value = await service.updatePriority(currentCard.value!.id, nextPriority); syncDrafts(snapshot.value); await announce('success', t('prioritySaved', '优先级已更新')); }
    catch (error) { logger.error('Failed to update priority', error); await announce('error', t('prioritySaveFailed', '优先级更新失败')); }
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
      snapshot.value = await service.setDismissed(cardId, nextDismissed);
      syncDrafts(snapshot.value);
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
      snapshot.value = await service.scheduleCard(scheduledCardId, {
        mode: options.mode,
        rating: options.mode === 'rating' ? options.rating : undefined,
        dueTimestamp,
      });
      syncDrafts(snapshot.value);
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
      confirm: async (options: unknown) => { await handleScheduleDate(options as ScheduleOptions); dialogHandle?.destroy(); },
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
    try { snapshot.value = await service.resetProgress(currentCard.value!.id); syncDrafts(snapshot.value); await announce('success', t('resetDone', '学习进度已重置')); }
    catch (error) { logger.error('Failed to reset card progress', error); await announce('error', t('resetFailed', '重置学习进度失败')); }
  });
}

onMounted(async () => { bindManagerObserver(); await refreshSnapshot(); });
onBeforeUnmount(() => { unbindManagerObserver(); });
</script>

<style scoped>
.srs-editor{--srs-surface:color-mix(in srgb,var(--b3-theme-surface) 84%,white 16%);--srs-surface-strong:color-mix(in srgb,var(--b3-theme-surface) 68%,white 32%);--srs-border:color-mix(in srgb,var(--b3-border-color) 75%,transparent 25%);--srs-accent:color-mix(in srgb,var(--b3-theme-primary) 84%,#1f5fbf 16%);--srs-accent-soft:color-mix(in srgb,var(--b3-theme-primary-lightest) 70%,white 30%);flex:1 1 auto;display:flex;flex-direction:column;gap:18px;box-sizing:border-box;height:100%;min-height:0;padding:20px;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;background:radial-gradient(circle at top left,color-mix(in srgb,var(--b3-theme-primary-lightest) 78%,transparent 22%),transparent 42%),linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 92%,var(--b3-theme-surface) 8%),var(--b3-theme-background));}
.srs-editor__hero,.srs-panel__header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.srs-editor__hero{padding:18px 20px;border:1px solid var(--srs-border);border-radius:18px;background:linear-gradient(145deg,var(--srs-surface-strong),var(--srs-surface));box-shadow:0 16px 40px rgba(0,0,0,.08)}
.srs-editor__eyebrow,.srs-field-card__label,.srs-stat__label,.srs-detail__label{margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--b3-theme-on-surface-light)}
.srs-editor__eyebrow{margin-bottom:6px;font-size:11px;letter-spacing:.18em}
.srs-editor__title,.srs-panel__header h3,.srs-panel__summary{margin:0;color:var(--b3-theme-on-surface)}
.srs-editor__title{font-size:24px;line-height:1.2}
.srs-panel__header h3,.srs-panel__summary{font-size:17px;font-weight:700}
.srs-panel__header p,.srs-field-card__helper,.srs-editor__notice-body,.srs-render-status{margin:0;color:var(--b3-theme-on-surface-light);line-height:1.5}
.srs-editor__hero-meta{display:flex;gap:8px;flex-wrap:wrap}
.srs-editor__chip,.srs-field-card__status{display:inline-flex;align-items:center;border-radius:999px;font-size:12px;font-weight:600}
.srs-editor__chip{min-height:32px;padding:0 12px;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.7);color:var(--b3-theme-on-surface)}
.srs-editor__chip--muted{background:transparent;border-color:var(--srs-border)}
.srs-editor__chip--warning{background:color-mix(in srgb,var(--b3-theme-warning-lightest) 78%,white 22%);border-color:color-mix(in srgb,var(--b3-theme-warning) 35%,var(--srs-border) 65%)}
.srs-editor__banner,.srs-editor__notice,.srs-panel,.srs-field-card,.srs-stat,.srs-detail{border:1px solid var(--srs-border);border-radius:16px}
.srs-editor__banner{padding:12px 14px;background:var(--srs-surface);color:var(--b3-theme-on-surface)}
.srs-editor__banner--success{border-color:color-mix(in srgb,var(--b3-theme-success) 40%,var(--srs-border) 60%);background:color-mix(in srgb,var(--b3-theme-success-lightest) 72%,white 28%)}
.srs-editor__banner--error{border-color:color-mix(in srgb,var(--b3-theme-error) 40%,var(--srs-border) 60%);background:color-mix(in srgb,var(--b3-theme-error-lightest) 72%,white 28%)}
.srs-editor__empty{display:flex;align-items:center;gap:10px;padding:18px;border:1px dashed var(--srs-border);border-radius:14px;color:var(--b3-theme-on-surface-light)}
.srs-editor__empty svg,.srs-field-stack button svg{width:14px;height:14px}
.srs-panel{display:flex;flex-direction:column;gap:16px;padding:18px;background:var(--srs-surface);box-shadow:0 14px 34px rgba(0,0,0,.05)}
.srs-panel--quick{background:linear-gradient(135deg,color-mix(in srgb,var(--srs-accent-soft) 85%,white 15%),rgba(255,255,255,.92))}
.srs-panel--danger{background:linear-gradient(135deg,color-mix(in srgb,var(--b3-theme-warning-lightest) 78%,white 22%),var(--srs-surface))}
.srs-editor__notice{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-color:color-mix(in srgb,var(--b3-theme-warning) 35%,var(--srs-border) 65%);background:color-mix(in srgb,var(--b3-theme-warning-lightest) 76%,white 24%)}
.srs-editor__notice-title,.srs-type-option__title,.srs-field-card__value,.srs-schedule-value,.srs-stat__value,.srs-detail__value{margin:0;font-weight:600;color:var(--b3-theme-on-surface)}
.srs-editor__notice-title{font-size:13px;font-weight:700}
.srs-field-grid,.srs-stats-grid,.srs-details-grid,.srs-type-grid{display:grid;gap:12px}
.srs-field-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.srs-stats-grid,.srs-details-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.srs-type-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.srs-field-card,.srs-stat,.srs-detail{display:flex;flex-direction:column;gap:10px;padding:14px;background:rgba(255,255,255,.74)}
.srs-field-card{min-height:180px;backdrop-filter:blur(8px);border-color:rgba(255,255,255,.8)}
.srs-field-card[data-field='nextReview']{background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(232,242,255,.92))}
.srs-field-card__header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.srs-field-card__status{padding:4px 8px;background:var(--srs-accent-soft);color:var(--srs-accent)}
.srs-field-stack{display:flex;flex-direction:column;gap:12px;margin-top:auto}
.srs-input{height:46px;font-size:16px;font-weight:600}
.srs-schedule-value{font-size:20px;line-height:1.4}
.srs-field-stack button{width:fit-content;display:inline-flex;align-items:center;gap:8px}
.srs-type-option{display:flex;flex-direction:column;gap:6px;padding:12px;text-align:left;border-radius:14px;border:1px solid var(--srs-border);background:rgba(255,255,255,.75);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
.srs-type-option:hover:not(:disabled){transform:translateY(-1px);border-color:color-mix(in srgb,var(--srs-accent) 45%,var(--srs-border) 55%);box-shadow:0 8px 18px rgba(31,95,191,.12)}
.srs-type-option--active{border-color:color-mix(in srgb,var(--srs-accent) 60%,var(--srs-border) 40%);background:linear-gradient(180deg,white,color-mix(in srgb,var(--srs-accent-soft) 80%,white 20%))}
.srs-type-option__desc{font-size:13px;line-height:1.45;color:var(--b3-theme-on-surface-light)}
.srs-render-status--ok{color:color-mix(in srgb,var(--b3-theme-success) 85%,var(--b3-theme-on-surface) 15%)}
.srs-render-status--warning{color:color-mix(in srgb,var(--b3-theme-warning) 88%,var(--b3-theme-on-surface) 12%)}
.srs-stat,.srs-detail{min-height:88px;background:color-mix(in srgb,var(--b3-theme-background) 80%,white 20%)}
.srs-panel--details[open] .srs-panel__summary{margin-bottom:14px}
.srs-panel__summary{cursor:pointer;list-style:none}
.srs-panel__summary::-webkit-details-marker{display:none}
.srs-detail__value--mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;word-break:break-all}
@media (max-width:960px){.srs-field-grid,.srs-stats-grid,.srs-details-grid,.srs-type-grid{grid-template-columns:1fr}.srs-editor__hero,.srs-panel__header{flex-direction:column}}
</style>
