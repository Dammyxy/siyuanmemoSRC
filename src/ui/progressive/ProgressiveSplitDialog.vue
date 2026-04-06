<template>
  <div class="progressive-split-dialog">
    <template v-if="viewMode === 'config'">
      <p class="dialog-description">
        {{ t('progressiveSplitDialogDescription', '选择哪些标记会触发渐进 Split。命中标题或自定义字符串时，会从该块开始新的 piece。') }}
      </p>

      <div class="marker-list">
        <label class="marker-item">
          <input v-model="form.horizontalRule" type="checkbox">
          <span>{{ t('progressiveSplitMarkerHorizontalRule', '分割线') }}</span>
        </label>

        <label class="marker-item">
          <input v-model="form.h1" type="checkbox">
          <span>{{ t('progressiveSplitMarkerH1', 'H1 标题') }}</span>
        </label>

        <label class="marker-item">
          <input v-model="form.h2" type="checkbox">
          <span>{{ t('progressiveSplitMarkerH2', 'H2 标题') }}</span>
        </label>

        <label class="marker-item">
          <input v-model="form.h3ToH6" type="checkbox">
          <span>{{ t('progressiveSplitMarkerH3ToH6', 'H3-H6 标题') }}</span>
        </label>

        <label class="marker-item">
          <input v-model="form.customStringEnabled" type="checkbox">
          <span>{{ t('progressiveSplitMarkerCustom', '自定义字符串') }}</span>
        </label>
      </div>

      <div class="custom-field">
        <input
          v-model="form.customString"
          class="b3-text-field fn__block"
          type="text"
          :disabled="!form.customStringEnabled"
          :placeholder="t('progressiveSplitCustomPlaceholder', '输入自定义切割字符串')"
          @keydown.enter.prevent="handleConfirm"
        >
        <p class="field-hint">
          {{ t('progressiveSplitCustomHint', '命中时会在该顶层块前切开，并保留该块作为新 piece 的第一块。') }}
        </p>
      </div>

      <div v-if="validationError" class="validation-error">
        {{ validationError }}
      </div>

      <div class="dialog-actions">
        <button class="b3-button b3-button--cancel" @click="handleCancel">
          {{ t('cancel', '取消') }}
        </button>
        <button
          class="b3-button b3-button--text"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          {{ t('confirm', '确认') }}
        </button>
      </div>
    </template>

    <template v-else>
      <div class="progress-panel">
        <div class="progress-header">
          <div>
            <p class="progress-phase">{{ phaseLabel }}</p>
            <h3 class="progress-title">
              {{ viewMode === 'cancelling'
                ? t('progressiveSplitCancelling', '正在取消并清理...')
                : t('progressiveSplitRunningTitle', '正在执行渐进 Split') }}
            </h3>
          </div>
          <div class="progress-percent">{{ progressPercentage }}%</div>
        </div>

        <div
          class="progress-bar"
          role="progressbar"
          :aria-valuenow="progressPercentage"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-bar__fill" :style="{ width: `${progressPercentage}%` }"></div>
        </div>

        <p class="progress-message">
          {{ progressMessage }}
        </p>

        <div class="progress-stats">
          <div class="progress-stat">
            <span class="progress-stat__label">{{ t('progressiveSplitProgressCurrent', '当前进度') }}</span>
            <strong>{{ progressCountText }}</strong>
          </div>
          <div class="progress-stat">
            <span class="progress-stat__label">{{ t('progressiveSplitProgressDocsCreated', '已创建文档') }}</span>
            <strong>{{ progress?.createdDocCount ?? 0 }}</strong>
          </div>
          <div class="progress-stat">
            <span class="progress-stat__label">{{ t('progressiveSplitProgressCardsCreated', '已创建卡片') }}</span>
            <strong>{{ progress?.createdCardCount ?? 0 }}</strong>
          </div>
        </div>

        <div v-if="progress?.currentTitle" class="progress-current">
          <span class="progress-stat__label">{{ t('progressiveSplitCurrentItem', '当前对象') }}</span>
          <strong>{{ progress.currentTitle }}</strong>
        </div>

        <div class="dialog-actions">
          <button
            class="b3-button b3-button--cancel progressive-split-dialog__cancel-running"
            :disabled="viewMode === 'cancelling'"
            @click="handleCancel"
          >
            {{ viewMode === 'cancelling'
              ? t('progressiveSplitCancelling', '正在取消并清理...')
              : t('progressiveSplitCancelRunning', '取消 Split') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import {
  createDefaultProgressiveSplitConfig,
  type ProgressiveHeadingSplitLevel,
  type ProgressiveSplitConfig,
  type ProgressiveSplitProgress,
} from '@/application/services/ProgressiveReadingService';

const props = defineProps<{
  i18n?: Record<string, string>;
  initialConfig?: Partial<ProgressiveSplitConfig>;
  progressState?: {
    status?: 'config' | 'running' | 'cancelling';
    progress?: ProgressiveSplitProgress | null;
  };
}>();

const emit = defineEmits<{
  confirm: [config: ProgressiveSplitConfig];
  cancel: [];
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function isHeadingLevel(value: unknown): value is ProgressiveHeadingSplitLevel {
  return value === 'h1' || value === 'h2' || value === 'h3ToH6';
}

const defaultConfig = createDefaultProgressiveSplitConfig();
const initialHeadingLevels = new Set(
  (props.initialConfig?.headingLevels || defaultConfig.headingLevels).filter(isHeadingLevel),
);

const form = reactive({
  horizontalRule: props.initialConfig?.horizontalRule ?? defaultConfig.horizontalRule,
  h1: initialHeadingLevels.has('h1'),
  h2: initialHeadingLevels.has('h2'),
  h3ToH6: initialHeadingLevels.has('h3ToH6'),
  customStringEnabled: props.initialConfig?.customStringEnabled ?? defaultConfig.customStringEnabled,
  customString: props.initialConfig?.customString ?? defaultConfig.customString ?? '',
});

const headingLevels = computed<ProgressiveHeadingSplitLevel[]>(() => {
  const levels: ProgressiveHeadingSplitLevel[] = [];
  if (form.h1) {
    levels.push('h1');
  }
  if (form.h2) {
    levels.push('h2');
  }
  if (form.h3ToH6) {
    levels.push('h3ToH6');
  }
  return levels;
});

const trimmedCustomString = computed(() => form.customString.trim());
const validationError = computed(() => {
  if (form.customStringEnabled && trimmedCustomString.value.length === 0) {
    return t('progressiveSplitCustomRequired', '请输入自定义切割字符串');
  }

  const hasMarker = form.horizontalRule
    || headingLevels.value.length > 0
    || (form.customStringEnabled && trimmedCustomString.value.length > 0);
  if (!hasMarker) {
    return t('progressiveSplitMarkerRequired', '至少选择一个切割标记');
  }

  return '';
});

const canConfirm = computed(() => validationError.value.length === 0);
const viewMode = computed(() => props.progressState?.status || 'config');
const progress = computed(() => props.progressState?.progress || null);
const progressPercentage = computed(() => progress.value?.percentage ?? 0);
const progressCountText = computed(() => {
  const current = progress.value?.current ?? 0;
  const total = progress.value?.total ?? 0;
  return `${current}/${total}`;
});
const progressMessage = computed(() => {
  switch (progress.value?.phase) {
    case 'scan':
      return t('progressiveSplitPhaseScanDescription', '正在批量扫描文档块并准备构建标题树。');
    case 'plan':
      return t('progressiveSplitPhasePlanDescription', '正在分析切点并生成树形 split 计划。');
    case 'createDocs':
      return t('progressiveSplitPhaseCreateDocsDescription', '正在创建 piece 子文档并写入渐进阅读属性。');
    case 'createCards':
      return t('progressiveSplitPhaseCreateCardsDescription', '正在为本次会话需要的 piece 创建 Topic 卡。');
    case 'save':
      return t('progressiveSplitPhaseSaveDescription', '正在保存会话状态并刷新文档树索引。');
    case 'cleanup':
      return t('progressiveSplitPhaseCleanupDescription', '正在尽力清理本次已创建的卡片和子文档。');
    default:
      break;
  }
  return t('progressiveSplitRunningDescription', '正在按阶段扫描文档、生成子文档并建立 Topic 卡。');
});
const phaseLabel = computed(() => {
  switch (progress.value?.phase) {
    case 'scan':
      return t('progressiveSplitPhaseScan', '扫描文档');
    case 'plan':
      return t('progressiveSplitPhasePlan', '构建切割计划');
    case 'createDocs':
      return t('progressiveSplitPhaseCreateDocs', '创建子文档');
    case 'createCards':
      return t('progressiveSplitPhaseCreateCards', '创建 Topic 卡');
    case 'save':
      return t('progressiveSplitPhaseSave', '保存会话');
    case 'cleanup':
      return t('progressiveSplitPhaseCleanup', '清理已创建内容');
    default:
      return t('progressiveSplitRunningTitle', '正在执行渐进 Split');
  }
});

function buildConfig(): ProgressiveSplitConfig {
  return {
    horizontalRule: form.horizontalRule,
    headingLevels: headingLevels.value,
    customStringEnabled: form.customStringEnabled,
    customString: form.customStringEnabled ? trimmedCustomString.value : '',
  };
}

function handleConfirm(): void {
  if (!canConfirm.value) {
    return;
  }
  emit('confirm', buildConfig());
}

function handleCancel(): void {
  emit('cancel');
}
</script>

<style scoped>
.progressive-split-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 18px;
  color: var(--b3-theme-on-surface);
}

.dialog-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

.marker-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-surface);
}

.marker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  cursor: pointer;
}

.marker-item input[type="checkbox"] {
  margin: 0;
}

.custom-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--b3-theme-on-surface-light);
}

.validation-error {
  padding: 10px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--b3-card-error-color) 12%, transparent);
  color: var(--b3-card-error-color);
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.progress-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.progress-phase {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--b3-theme-primary);
}

.progress-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.3;
}

.progress-percent {
  min-width: 72px;
  font-size: 28px;
  font-weight: 700;
  text-align: right;
  color: var(--b3-theme-primary);
}

.progress-bar {
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--b3-theme-primary), color-mix(in srgb, var(--b3-theme-primary) 72%, white));
  transition: width 160ms ease;
}

.progress-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.progress-stat,
.progress-current {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-surface);
}

.progress-stat__label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.progress-current strong,
.progress-stat strong {
  word-break: break-word;
}

.progressive-split-dialog__cancel-running[disabled] {
  cursor: not-allowed;
}

@media (max-width: 680px) {
  .progress-header {
    flex-direction: column;
  }

  .progress-percent {
    text-align: left;
  }

  .progress-stats {
    grid-template-columns: 1fr;
  }
}
</style>
