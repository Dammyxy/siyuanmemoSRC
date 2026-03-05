<template>
  <div class="settings-panel">
    <!-- 顶部标签页 -->
    <div class="settings-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.key"
        class="settings-tab"
        :class="{ 'settings-tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <svg><use :xlink:href="tab.icon"></use></svg>
        {{ tab.label }}
      </button>
    </div>

    <!-- 设置区域 -->
    <div class="settings-content">
      <!-- 参数设置 -->
      <div v-show="activeTab === 'params'" class="settings-section">
        <h3>{{ t('fsrsParamsTitle', 'FSRS 参数') }}</h3>
        
        <!-- 请求保留率 -->
        <div class="form-item">
          <label>{{ t('requestRetention', '请求保留率') }}</label>
          <div class="form-control">
            <input 
              type="range" 
              min="0.7" 
              max="0.97" 
              step="0.01" 
              v-model.number="settings.requestRetention"
            >
            <span class="form-value">{{ (settings.requestRetention * 100).toFixed(0) }}%</span>
          </div>
          <p class="form-hint">{{ t('requestRetentionHint', '目标记忆保留率，建议 0.85-0.95') }}</p>
        </div>

        <!-- 最大间隔 -->
        <div class="form-item">
          <label>{{ t('maximumInterval', '最大间隔（天）') }}</label>
          <div class="form-control">
            <input 
              type="number" 
              min="30" 
              max="36500" 
              v-model.number="settings.maximumInterval"
            >
          </div>
          <p class="form-hint">{{ t('maximumIntervalHint', '卡片复习的最大间隔天数') }}</p>
        </div>

        <!-- 启用短期调度器 -->
        <div class="form-item">
          <label>{{ t('enableShortTerm', '启用短期调度器') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.enableShortTerm">
          </div>
          <p class="form-hint">{{ t('enableShortTermHint', '是否使用短期调度策略（学习阶段）') }}</p>
        </div>

        <div class="fn__hr"></div>

        <h3>{{ t('schedulerSettingsTitle', 'Scheduler Settings') }}</h3>
        
        <p class="form-hint" style="margin-bottom: 16px;">
          {{ t('schedulerArchitectureHint', '插件使用两套调度器：Item 卡片和描述符卡片使用同一个调度器（FSRS v6），概念卡片和 Topic 卡片使用同一个调度器（A-Factor v2）。') }}
        </p>

        <!-- Item Scheduler (Default Scheduler) -->
        <div class="form-item">
          <label>{{ t('itemScheduler', 'Item/Descriptor Card Scheduler') }}</label>
          <div class="form-control">
            <select v-model="schedulerConfig.defaultScheduler" class="scheduler-select" disabled>
              <option value="fsrs-v6">{{ t('schedulerFsrsV6', 'FSRS v6') }}</option>
            </select>
          </div>
          <p class="form-hint">
            💡 {{ t('itemSchedulerHint', 'For Item and Descriptor cards, modern algorithm, accurately predicts forgetting curve (fixed to FSRS v6)') }}
          </p>
        </div>

        <!-- Topic Scheduler -->
        <div class="form-item">
          <label>{{ t('topicScheduler', 'Concept/Topic Card Scheduler') }}</label>
          <div class="form-control">
            <select v-model="schedulerConfig.topicScheduler" class="scheduler-select" disabled>
              <option value="a-factor-v2">{{ t('schedulerAFactorV2', 'A-Factor v2') }}</option>
            </select>
          </div>
          <p class="form-hint">
            💡 {{ t('topicSchedulerHint', 'For Concept and Topic cards, suitable for reading materials, dynamically adjusts difficulty factor (fixed to A-Factor v2)') }}
          </p>
        </div>

        <div class="fn__hr"></div>

        <h3>{{ t('featuresTitle', '功能开关') }}</h3>

        <div class="fn__hr"></div>

        <h3>{{ t('storageConflictTitle', '多端冲突处理') }}</h3>
        <div class="form-item">
          <label>{{ t('storageConflictStrategy', '冲突策略') }}</label>
          <div class="form-control">
            <select v-model="riffIntegrationConfig.storageConflictResolution" class="scheduler-select">
              <option value="merge">{{ t('storageConflictMerge', '自动合并（推荐）') }}</option>
              <option value="prefer-remote">{{ t('storageConflictPreferRemote', '云端覆盖本地') }}</option>
              <option value="prefer-local">{{ t('storageConflictPreferLocal', '本地覆盖云端') }}</option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('storageConflictHint', '检测到多实例写入冲突时，选择自动合并或单向覆盖策略。') }}
          </p>
        </div>

        <div class="fn__hr"></div>

        <!-- Quick Card Symbols -->
        <h3>{{ t('quickCardTitle', '监听符号制卡') }}</h3>
        
        <!-- 启用开关 -->
        <div class="form-item">
          <label>{{ t('quickCardEnabled', '启用监听符号制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.enabled">
          </div>
          <p class="form-hint">
            {{ t('quickCardEnabledHint', '启用后，插件会监听块内容变化，自动检测符号并创建卡片。默认关闭，避免误触发。') }}
          </p>
        </div>
        
        <p class="form-hint" style="margin-bottom: 16px;" v-if="settings.quickCard.enabled">
          ✅ {{ t('quickCardSymbolsInfo', '支持的符号类型') }}：&gt;&gt;, &lt;&lt;, &lt;&gt;, ::, ;;, &#123;&#123;&#125;&#125;, &gt;&gt;&gt;
        </p>

        <div class="fn__hr"></div>

        <!-- 🆕 每日刷新时间 -->
        <div class="form-item">
          <label>{{ t('dayStartHour', '每日刷新时间') }}</label>
          <div class="form-control">
            <input 
              type="number" 
              min="0" 
              max="23" 
              step="1" 
              v-model.number="settings.dayStartHour"
              @change="handleDayStartHourChange"
            >
            <span class="form-unit">{{ t('hourUnit', '点') }}</span>
          </div>
          <p class="form-hint">
            {{ t('dayStartHourHint', '定义"新的一天"的开始时间（0-23点）。例如设置为4，则凌晨4点之前的时间仍属于"昨天"。') }}
          </p>
          
          <!-- 当前"今天"范围示例 -->
          <div class="form-example">
            <span class="example-label">{{ t('todayRangeExample', '当前"今天"范围：') }}</span>
            <code class="example-value">{{ todayRangeText }}</code>
          </div>
          
          <!-- 快速设置按钮 -->
          <div class="form-quick-actions">
            <span class="quick-label">{{ t('commonSettings', '常见设置：') }}</span>
            <button 
              class="btn-small" 
              @click="setDayStartHour(0)"
              :class="{ 'btn-active': settings.dayStartHour === 0 }"
            >
              {{ t('midnight', '午夜 (0点)') }}
            </button>
            <button 
              class="btn-small" 
              @click="setDayStartHour(4)"
              :class="{ 'btn-active': settings.dayStartHour === 4 }"
            >
              {{ t('dawn', '凌晨 (4点)') }}
            </button>
            <button 
              class="btn-small" 
              @click="setDayStartHour(6)"
              :class="{ 'btn-active': settings.dayStartHour === 6 }"
            >
              {{ t('morning', '早晨 (6点)') }}
            </button>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('autoPostponeEnabled', '自动延期（AutoPostpone）') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.autoPostponeEnabled">
          </div>
          <p class="form-hint">
            {{ t('autoPostponeEnabledHint', '每天首次打开提取练习/渐进学习时，自动跳过前 N 张后对其余卡片做延期，减少当日负载。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('autoPostponeSkipTopN', '自动延期保护前 N 张') }}</label>
          <div class="form-control">
            <input
              type="number"
              min="0"
              max="2000"
              step="1"
              v-model.number="settings.autoPostponeSkipTopN"
              @change="handleAutoPostponeSkipTopNChange"
            >
            <span class="form-unit">{{ t('autoPostponeSkipTopNUnit', '张') }}</span>
          </div>
          <p class="form-hint">
            {{ t('autoPostponeSkipTopNHint', '执行 autoPostpone 时保护队列前 N 张不延期，默认 20。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('autoSortEnabled', '自动排序（AutoSort）') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.autoSortEnabled">
          </div>
          <p class="form-hint">
            {{ t('autoSortEnabledHint', '开启后 Outstanding 基础卡片按优先级+到期排序；关闭后保持数据源原顺序，仅执行间隔插入。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('addToOutstandingEveryNth', 'Outstanding 间隔插入') }}</label>
          <div class="form-control">
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              v-model.number="settings.addToOutstandingEveryNth"
              @change="handleAddToOutstandingEveryNthChange"
            >
            <span class="form-unit">{{ t('everyNthUnit', '每 N 张插入 1 张') }}</span>
          </div>
          <p class="form-hint">
            {{ t('addToOutstandingEveryNthHint', '手动加入 Outstanding 的卡片按该间隔稀疏插入队列，默认 2。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('priorityRandomness', '优先级随机因子') }}</label>
          <div class="form-control">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              v-model.number="settings.priorityRandomness"
              @change="handlePriorityRandomnessChange"
            >
            <span class="form-value">{{ settings.priorityRandomness.toFixed(2) }}</span>
          </div>
          <p class="form-hint">
            {{ t('priorityRandomnessHint', '0 为严格按优先级排序，越大越随机（仍保留优先级倾向）。') }}
          </p>
        </div>

        <!-- 当前参数展示 -->
        <div class="form-item">
          <label>{{ t('modelParams', `模型参数 (${FSRS_WEIGHT_COUNT})`) }}</label>
          <div class="params-preview">
            <code>{{ paramsPreview }}</code>
          </div>
          <p class="form-hint">{{ t('modelParamsHint', '使用优化器可以根据你的复习数据自动优化这些参数') }}</p>
        </div>

        <div class="fn__hr"></div>

        <h3>{{ t('blockAttrsCleanupTitle', '块属性清理') }}</h3>

        <div class="form-item">
          <label>{{ t('blockAttrsCleanupModeLabel', '清理模式') }}</label>
          <div class="form-control">
            <select v-model="blockAttrsCleanupMode" class="scheduler-select">
              <option value="safe">{{ t('blockAttrsCleanupModeSafe', 'SAFE（推荐）') }}</option>
              <option value="full">{{ t('blockAttrsCleanupModeFull', 'FULL（危险）') }}</option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('blockAttrsCleanupModeHint', 'SAFE 仅清理废弃属性和无效 custom-xiuyuan-id；FULL 清理全部插件块属性。') }}
          </p>
        </div>

        <div class="form-actions">
          <button
            class="btn-secondary"
            :disabled="blockAttrsCleanupBusy"
            @click="handleScanBlockAttrsCleanup"
          >
            {{ blockAttrsCleanupBusy ? t('blockAttrsCleanupScanning', '扫描中...') : t('blockAttrsCleanupScanBtn', '1) 扫描并预览') }}
          </button>
          <button
            class="btn-primary"
            :disabled="blockAttrsCleanupBusy || !blockAttrsCleanupHasScan"
            @click="handleRunBlockAttrsCleanup"
          >
            {{ blockAttrsCleanupBusy ? t('blockAttrsCleanupRunning', '执行中...') : t('blockAttrsCleanupRunBtn', '2) 确认并执行清理') }}
          </button>
        </div>

        <p v-if="blockAttrsCleanupError" class="form-hint form-hint--warning">
          {{ t('blockAttrsCleanupErrorPrefix', '执行失败：') }}{{ blockAttrsCleanupError }}
        </p>

        <div v-if="blockAttrsCleanupScanResult" class="form-example">
          <div class="example-label">{{ t('blockAttrsCleanupScanSummary', '扫描结果') }}</div>
          <div class="example-value">
            {{ t('blockAttrsCleanupTotalBlocks', '总块数') }}: {{ blockAttrsCleanupScanResult.totalBlocks }}
            |
            {{ t('blockAttrsCleanupRemovableBlocks', '可清理块数') }}: {{ blockAttrsCleanupScanResult.removableBlocks }}
            |
            {{ t('blockAttrsCleanupStaleXiuyuan', '失效 Xiuyuan 绑定') }}: {{ blockAttrsCleanupScanResult.staleXiuyuanCount }}
          </div>
          <div class="example-value" style="margin-top: 6px;">
            {{ t('blockAttrsCleanupSkippedTreeNotFound', 'tree not found 跳过数') }}: {{ blockAttrsCleanupScanResult.skippedTreeNotFoundCount }}
          </div>
          <div v-if="blockAttrsCleanupAttrRows.length > 0" style="margin-top: 8px;">
            <div class="example-label">{{ t('blockAttrsCleanupAttrDistribution', '属性分布') }}</div>
            <div
              v-for="[name, count] in blockAttrsCleanupAttrRows"
              :key="name"
              class="example-value"
              style="display: flex; justify-content: space-between; gap: 12px;"
            >
              <code>{{ name }}</code>
              <span>{{ count }}</span>
            </div>
          </div>
        </div>

        <div v-if="blockAttrsCleanupRunResult" class="form-example">
          <div class="example-label">{{ t('blockAttrsCleanupRunSummary', '执行结果') }}</div>
          <div class="example-value">
            mode: {{ blockAttrsCleanupRunResult.mode }} |
            {{ t('blockAttrsCleanupCleanedBlocks', '已清理块') }}: {{ blockAttrsCleanupRunResult.cleanedBlocks }} |
            {{ t('blockAttrsCleanupCleanedAttrs', '已清理属性') }}: {{ blockAttrsCleanupRunResult.cleanedAttrs }}
          </div>
          <div class="example-value" style="margin-top: 6px;">
            {{ t('blockAttrsCleanupSkippedTreeNotFound', 'tree not found 跳过数') }}: {{ blockAttrsCleanupRunResult.skippedTreeNotFoundCount }}
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-primary" @click="saveSettings">{{ t('saveSettings', '保存设置') }}</button>
          <button class="btn-secondary" @click="resetSettings">{{ t('resetDefault', '重置默认') }}</button>
        </div>
      </div>



      <!-- About -->
      <div v-show="activeTab === 'about'" class="settings-section about-section">
        <div class="guide-section">
          <h4>ℹ️ About</h4>
          <p class="about-info">
            Dedicated to the past, present, and future of the SiYuan and spaced repetition community.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { DEFAULT_FSRS_WEIGHTS, FSRS_WEIGHT_COUNT, type FilterGroupDefinition, type FSRSParameters, type QueueSettings, type SchedulerConfig, type QuickCardSettings } from '../../types';
import { getTodayRange, formatTodayRange } from '../../utils/dateUtils';  // 🆕 导入日期工具
import { createLogger } from '@/utils/logger';

type OptimizationConfig = Record<string, unknown>;
type ConflictResolutionStrategy = 'merge' | 'prefer-local' | 'prefer-remote';
type CleanupMode = 'safe' | 'full';
type CleanupScanResult = {
  totalBlocks: number;
  removableBlocks: number;
  attrCounts: Record<string, number>;
  staleXiuyuanCount: number;
  skippedTreeNotFoundCount: number;
};
type CleanupRunResult = CleanupScanResult & {
  mode: CleanupMode;
  cleanedBlocks: number;
  cleanedAttrs: number;
};

const logger = createLogger('SettingsPanel');

const DEFAULT_PARAMS = [...DEFAULT_FSRS_WEIGHTS];

// Emits
const emit = defineEmits<{
  (e: 'save', settings: Record<string, unknown>): void;
  (e: 'close'): void;
  (e: 'repair-dates'): void;  // 🆕 数据修复事件
  (e: 'optimize-parameters', config: OptimizationConfig): Promise<OptimizationConfig | void>;  // 🆕 参数优化事件
  (e: 'scan-block-attrs-cleanup', mode: CleanupMode, resolve?: (result: CleanupScanResult) => void, reject?: (error: Error) => void): void;
  (e: 'run-block-attrs-cleanup', mode: CleanupMode, resolve?: (result: CleanupRunResult) => void, reject?: (error: Error) => void): void;
}>();

const props = defineProps<{
  fsrsSettings?: FSRSParameters;
  queueSettings?: QueueSettings;
  priorityRandomness?: number;
  schedulerSettings?: SchedulerConfig;  // 🆕 新增
  riffIntegrationSettings?: Record<string, unknown>;  // 🆕 Riff 集成配置
  incrementalSettings?: { autoCardEnabled: boolean };
  quickCardSettings?: Partial<QuickCardSettings>;  // 🆕 快速制卡配置
  i18n?: Record<string, string>;
  defaultTab?: string;
  queueCount?: number;
  queueHandlers?: {
    preview: (filter: { type: string; value: string }) => Promise<number>;
    add: (filter: { type: string; value: string }) => Promise<number>;
    start: () => Promise<void>;
    clear: () => Promise<void>;
  };
  optimizationHandlers?: {  // 🆕 参数优化处理器
    optimize: (config: OptimizationConfig) => Promise<OptimizationConfig>;
  };
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const tabs = computed(() => [
  { key: 'params', label: t('settingsParamsTab', '参数设置'), icon: '#iconSettings' },
  { key: 'about', label: t('settingsAboutTab', '关于'), icon: '#iconInfo' },
]);

const activeTab = ref(props.defaultTab || 'params');

const queueSettings = ref<QueueSettings>({
  defaultQueue: 'retrieval',
  addToOutstandingEveryNth: 2,
  neuralWandering: {
    enabled: false,
    maxPool: 200,
    historyLimit: 50,
    maxContext: 30,
    enableTags: false,
    maxTags: 10,
    enableSiblings: false,
    maxSiblings: 10,
    weights: { ref: 10, context: 5, tag: 3, sibling: 1 },
  },
  filterGroup: { enabled: false, groups: [] },
});

// 设置
interface Settings {
  requestRetention: number;
  maximumInterval: number;
  enableShortTerm: boolean;
  params: number[];
  dayStartHour: number;  // 🆕 每日刷新时间
  autoPostponeEnabled: boolean;
  autoPostponeSkipTopN: number;
  autoSortEnabled: boolean;
  addToOutstandingEveryNth: number;
  priorityRandomness: number;
  quickCard: QuickCardSettings;  // 🆕 快速制卡设置
}

const settings = ref<Settings>({
  requestRetention: 0.9,
  maximumInterval: 365,
  enableShortTerm: true,
  params: [...DEFAULT_PARAMS],
  dayStartHour: 4,  // 🆕 默认值：凌晨4点
  autoPostponeEnabled: false,
  autoPostponeSkipTopN: 20,
  autoSortEnabled: true,
  addToOutstandingEveryNth: 2,
  priorityRandomness: 0.1,
  quickCard: {  // 🆕 默认值
    enabled: false,
    enabledSymbols: {
      basic: true,
      concept: true,
      descriptor: true,
      cloze: true,
      multiLine: true,
    },
    debounceDelay: {
      quick: 300,
      list: 2000,
    },
    descriptorUseXiuyuan: true,
  },
});

// 🆕 快速制卡设置
const quickCardSettings = ref<QuickCardSettings>({
  enabled: true,
  enabledSymbols: {
    basic: true,
    concept: true,
    descriptor: true,
    cloze: true,
    multiLine: true,
  },
  debounceDelay: {
    quick: 300,
    list: 2000,
  },
  descriptorUseXiuyuan: true,
});

// 🆕 调度器配置
const schedulerConfig = ref<SchedulerConfig>({
  defaultScheduler: 'fsrs-v6',
  topicScheduler: 'a-factor-v2',
  itemScheduler: 'fsrs-v6',
});

// 调度器说明
const schedulerDescriptions: Record<string, string> = {
  'fsrs-v6': '现代算法，准确预测遗忘曲线，推荐使用',
  'sm15': 'SuperMemo 15 算法，完整的遗忘曲线系统',
  'a-factor-v2': '改进的 A-Factor，动态调整难度',
};

// 🆕 Riff 集成配置
const riffIntegrationConfig = ref({
  mode: 'advanced' as 'advanced' | 'simple',
  useLocalScheduler: true,
  incrementalSync: {
    enabled: true,
    triggers: ['plugin-start'] as Array<'plugin-start' | 'browser-open' | 'review-open'>,
    useBlacklist: true,
  },
  fullSync: {
    enabled: true,
    interval: 604800000,  // 7天
    cleanupBlacklist: true,
  },
  deleteSync: {
    enabled: true,
    useBlacklistFallback: true,
  },
  storageConflictResolution: 'merge' as ConflictResolutionStrategy,
});

// 🆕 触发器复选框状态（用于 UI 绑定）
const triggers = ref({
  pluginStart: true,
  browserOpen: true,
  reviewOpen: true,
});

// 参数预览
const paramsPreview = computed(() => {
  return settings.value.params.map(p => p.toFixed(4)).join(', ');
});

// 🆕 计算"今天"范围的显示文本
const todayRangeText = computed(() => {
  const range = getTodayRange(settings.value.dayStartHour);
  return formatTodayRange(range);
});

const blockAttrsCleanupMode = ref<CleanupMode>('safe');
const blockAttrsCleanupScanResult = ref<CleanupScanResult | null>(null);
const blockAttrsCleanupRunResult = ref<CleanupRunResult | null>(null);
const blockAttrsCleanupBusy = ref(false);
const blockAttrsCleanupError = ref('');
const blockAttrsCleanupHasScan = computed(() => blockAttrsCleanupScanResult.value !== null);
const blockAttrsCleanupAttrRows = computed(() => {
  const counts = blockAttrsCleanupScanResult.value?.attrCounts || {};
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
});

watch(
  () => blockAttrsCleanupMode.value,
  (mode, prevMode) => {
    if (mode === prevMode) {
      return;
    }
    blockAttrsCleanupScanResult.value = null;
    blockAttrsCleanupRunResult.value = null;
    blockAttrsCleanupError.value = '';
  }
);

function normalizeConflictResolutionStrategy(value: unknown): ConflictResolutionStrategy {
  if (value === 'prefer-local' || value === 'prefer-remote' || value === 'merge') {
    return value;
  }
  return 'merge';
}

function normalizeOutstandingEveryNth(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 2;
  }
  return Math.max(1, Math.min(100, Math.floor(numeric)));
}

function normalizePriorityRandomness(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.1;
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function normalizeAutoPostponeSkipTopN(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 20;
  }
  return Math.max(0, Math.min(2000, Math.floor(numeric)));
}

function requestBlockAttrsCleanupScan(mode: CleanupMode): Promise<CleanupScanResult> {
  return new Promise((resolve, reject) => {
    emit('scan-block-attrs-cleanup', mode, resolve, reject);
  });
}

function requestBlockAttrsCleanupRun(mode: CleanupMode): Promise<CleanupRunResult> {
  return new Promise((resolve, reject) => {
    emit('run-block-attrs-cleanup', mode, resolve, reject);
  });
}

async function handleScanBlockAttrsCleanup(): Promise<void> {
  if (blockAttrsCleanupBusy.value) {
    return;
  }
  blockAttrsCleanupBusy.value = true;
  blockAttrsCleanupError.value = '';
  blockAttrsCleanupRunResult.value = null;
  try {
    const result = await requestBlockAttrsCleanupScan(blockAttrsCleanupMode.value);
    blockAttrsCleanupScanResult.value = result;
  } catch (error) {
    blockAttrsCleanupError.value = (error instanceof Error ? error.message : String(error)) || '扫描失败';
  } finally {
    blockAttrsCleanupBusy.value = false;
  }
}

async function handleRunBlockAttrsCleanup(): Promise<void> {
  if (blockAttrsCleanupBusy.value || !blockAttrsCleanupHasScan.value) {
    return;
  }

  if (blockAttrsCleanupMode.value === 'full') {
    const firstConfirm = window.confirm(
      t('blockAttrsCleanupFullFirstConfirm', 'FULL 模式会清除所有插件块属性（包含 custom-xiuyuan-id 与功能字段），是否继续？')
    );
    if (!firstConfirm) {
      return;
    }
    const secondConfirm = window.confirm(
      t('blockAttrsCleanupFullSecondConfirm', '这是第二次确认：执行后不可恢复，确定立即执行 FULL 清理吗？')
    );
    if (!secondConfirm) {
      return;
    }
  } else {
    const safeConfirm = window.confirm(
      t('blockAttrsCleanupSafeConfirm', '将执行 SAFE 清理（保留功能字段与有效 custom-xiuyuan-id），是否继续？')
    );
    if (!safeConfirm) {
      return;
    }
  }

  blockAttrsCleanupBusy.value = true;
  blockAttrsCleanupError.value = '';
  try {
    const result = await requestBlockAttrsCleanupRun(blockAttrsCleanupMode.value);
    blockAttrsCleanupRunResult.value = result;
  } catch (error) {
    blockAttrsCleanupError.value = (error instanceof Error ? error.message : String(error)) || '执行失败';
  } finally {
    blockAttrsCleanupBusy.value = false;
  }
}

// 加载设置
function loadSettings() {
  // 🔍 调试日志：检查接收到的 quickCardSettings
  logger.debug('Loading settings with quickCardSettings', { quickCardSettings: props.quickCardSettings });
  
  if (props.fsrsSettings) {
    settings.value = {
      requestRetention: props.fsrsSettings.requestRetention,
      maximumInterval: props.fsrsSettings.maximumInterval,
      enableShortTerm: props.fsrsSettings.enableShortTerm,
      params: [...props.fsrsSettings.weights],
      dayStartHour: props.fsrsSettings.dayStartHour ?? 4,  // 🆕 加载 dayStartHour 配置
      autoPostponeEnabled: false,
      autoPostponeSkipTopN: 20,
      autoSortEnabled: true,
      addToOutstandingEveryNth: 2,
      priorityRandomness: normalizePriorityRandomness(props.priorityRandomness),
      quickCard: {  // 🆕 初始化完整的 quickCard 字段
        enabled: props.quickCardSettings?.enabled ?? false,
        enabledSymbols: props.quickCardSettings?.enabledSymbols || {
          basic: true,
          concept: true,
          descriptor: true,
          cloze: true,
          multiLine: true,
        },
        debounceDelay: props.quickCardSettings?.debounceDelay || {
          quick: 300,
          list: 2000,
        },
        descriptorUseXiuyuan: props.quickCardSettings?.descriptorUseXiuyuan ?? true,
      },
    };
    
    // 🔍 调试日志：检查初始化后的 settings.quickCard
    logger.debug('Initialized settings.quickCard', { quickCard: settings.value.quickCard });
  }
  
  // 🆕 加载快速制卡设置
  if (props.quickCardSettings) {
    quickCardSettings.value = {
      enabled: props.quickCardSettings.enabled ?? false,  // 🔧 修改默认值为 false
      enabledSymbols: {
        basic: props.quickCardSettings.enabledSymbols?.basic ?? true,
        concept: props.quickCardSettings.enabledSymbols?.concept ?? true,
        descriptor: props.quickCardSettings.enabledSymbols?.descriptor ?? true,
        cloze: props.quickCardSettings.enabledSymbols?.cloze ?? true,
        multiLine: props.quickCardSettings.enabledSymbols?.multiLine ?? true,
      },
      debounceDelay: {
        quick: props.quickCardSettings.debounceDelay?.quick ?? 300,
        list: props.quickCardSettings.debounceDelay?.list ?? 2000,
      },
      descriptorUseXiuyuan: props.quickCardSettings.descriptorUseXiuyuan ?? true,
    };
  }
  
  if (props.queueSettings) {
    const incoming = JSON.parse(JSON.stringify(props.queueSettings));
    queueSettings.value = {
      ...queueSettings.value,
      ...incoming,
      neuralWandering: {
        ...queueSettings.value.neuralWandering,
        ...(incoming.neuralWandering || {}),
        weights: {
          ...queueSettings.value.neuralWandering.weights,
          ...(incoming.neuralWandering?.weights || {}),
        },
      },
      filterGroup: {
        ...queueSettings.value.filterGroup,
        ...(incoming.filterGroup || {}),
      },
    };

    settings.value.addToOutstandingEveryNth = normalizeOutstandingEveryNth(
      (incoming as QueueSettings & { outstandingEveryNth?: unknown; outstandingSpacing?: unknown })
        .addToOutstandingEveryNth
      ?? (incoming as { outstandingEveryNth?: unknown }).outstandingEveryNth
      ?? (incoming as { outstandingSpacing?: unknown }).outstandingSpacing
      ?? settings.value.addToOutstandingEveryNth
    );
    settings.value.autoSortEnabled = normalizeBoolean(
      (incoming as { autoSort?: { enabled?: unknown } }).autoSort?.enabled,
      true
    );
    settings.value.autoPostponeEnabled = normalizeBoolean(
      (incoming as { autoPostpone?: { enabled?: unknown } }).autoPostpone?.enabled,
      false
    );
    settings.value.autoPostponeSkipTopN = normalizeAutoPostponeSkipTopN(
      (incoming as { autoPostpone?: { skipTopNElements?: unknown } }).autoPostpone?.skipTopNElements
    );
  }

  settings.value.priorityRandomness = normalizePriorityRandomness(
    props.priorityRandomness ?? settings.value.priorityRandomness
  );

  // 🆕 加载调度器配置
  if (props.schedulerSettings) {
    schedulerConfig.value = {
      defaultScheduler: props.schedulerSettings.defaultScheduler || 'fsrs-v6',
      topicScheduler: props.schedulerSettings.topicScheduler || 'a-factor-v2',
      itemScheduler: props.schedulerSettings.itemScheduler || 'fsrs-v6',
    };
  }

  const riffSettings = props.riffIntegrationSettings || {};
  const incomingIncremental = (
    typeof riffSettings.incrementalSync === 'object' &&
    riffSettings.incrementalSync !== null
  ) ? riffSettings.incrementalSync as Record<string, unknown> : {};
  const incomingFullSync = (
    typeof riffSettings.fullSync === 'object' &&
    riffSettings.fullSync !== null
  ) ? riffSettings.fullSync as Record<string, unknown> : {};
  const incomingDeleteSync = (
    typeof riffSettings.deleteSync === 'object' &&
    riffSettings.deleteSync !== null
  ) ? riffSettings.deleteSync as Record<string, unknown> : {};

  const incomingTriggers = Array.isArray(incomingIncremental.triggers)
    ? incomingIncremental.triggers.filter(
      (trigger): trigger is 'plugin-start' | 'browser-open' | 'review-open' =>
        trigger === 'plugin-start' || trigger === 'browser-open' || trigger === 'review-open'
    )
    : riffIntegrationConfig.value.incrementalSync.triggers;

  riffIntegrationConfig.value = {
    mode: riffSettings.mode === 'simple' ? 'simple' : 'advanced',
    useLocalScheduler: typeof riffSettings.useLocalScheduler === 'boolean'
      ? riffSettings.useLocalScheduler
      : true,
    incrementalSync: {
      enabled: typeof incomingIncremental.enabled === 'boolean' ? incomingIncremental.enabled : true,
      triggers: incomingTriggers.length > 0 ? incomingTriggers : ['plugin-start'],
      useBlacklist: typeof incomingIncremental.useBlacklist === 'boolean' ? incomingIncremental.useBlacklist : true,
    },
    fullSync: {
      enabled: typeof incomingFullSync.enabled === 'boolean' ? incomingFullSync.enabled : true,
      interval: typeof incomingFullSync.interval === 'number' ? incomingFullSync.interval : 604800000,
      cleanupBlacklist: typeof incomingFullSync.cleanupBlacklist === 'boolean' ? incomingFullSync.cleanupBlacklist : true,
    },
    deleteSync: {
      enabled: typeof incomingDeleteSync.enabled === 'boolean' ? incomingDeleteSync.enabled : true,
      useBlacklistFallback: typeof incomingDeleteSync.useBlacklistFallback === 'boolean'
        ? incomingDeleteSync.useBlacklistFallback
        : true,
    },
    storageConflictResolution: normalizeConflictResolutionStrategy(riffSettings.storageConflictResolution),
  };

  triggers.value = {
    pluginStart: riffIntegrationConfig.value.incrementalSync.triggers.includes('plugin-start'),
    browserOpen: riffIntegrationConfig.value.incrementalSync.triggers.includes('browser-open'),
    reviewOpen: riffIntegrationConfig.value.incrementalSync.triggers.includes('review-open'),
  };
}

// 保存设置
function saveSettings() {
  const queueInput = queueSettings.value as QueueSettings & {
    outstandingEveryNth?: number;
    outstandingSpacing?: number;
  };
  const {
    outstandingEveryNth: _legacyOutstandingEveryNth,
    outstandingSpacing: _legacyOutstandingSpacing,
    ...queueBase
  } = queueInput;
  const queues: QueueSettings = {
    ...queueBase,
    addToOutstandingEveryNth: normalizeOutstandingEveryNth(settings.value.addToOutstandingEveryNth),
    autoSort: {
      ...(queueBase.autoSort || {}),
      enabled: settings.value.autoSortEnabled,
    },
    autoPostpone: {
      ...(queueBase.autoPostpone || {}),
      enabled: settings.value.autoPostponeEnabled,
      skipTopNElements: normalizeAutoPostponeSkipTopN(settings.value.autoPostponeSkipTopN),
    },
  };

  // 🆕 从复选框状态构建 triggers 数组
  const triggersArray: Array<'plugin-start' | 'browser-open' | 'review-open'> = [];
  if (triggers.value.pluginStart) triggersArray.push('plugin-start');
  if (triggers.value.browserOpen) triggersArray.push('browser-open');
  if (triggers.value.reviewOpen) triggersArray.push('review-open');

  const {
    addToOutstandingEveryNth: _spacingFromForm,
    autoSortEnabled: _autoSortEnabled,
    autoPostponeEnabled: _autoPostponeEnabled,
    autoPostponeSkipTopN: _autoPostponeSkipTopN,
    ...settingsBase
  } = settings.value;

  const settingsToSave = {
    ...settingsBase,
    queues,
    priorityRandomness: normalizePriorityRandomness(settings.value.priorityRandomness),
    // quickCard 已经在 settings.value 中,不需要单独处理
    // 🆕 保存调度器配置
    scheduler: {
      defaultScheduler: schedulerConfig.value.defaultScheduler,
      topicScheduler: schedulerConfig.value.topicScheduler,
      itemScheduler: schedulerConfig.value.itemScheduler,
    },
    // 🆕 保存 Riff 集成配置
    riffIntegration: {
      mode: riffIntegrationConfig.value.mode,
      useLocalScheduler: riffIntegrationConfig.value.useLocalScheduler,
      incrementalSync: {
        ...riffIntegrationConfig.value.incrementalSync,
        triggers: triggersArray,
      },
      fullSync: riffIntegrationConfig.value.fullSync,
      deleteSync: riffIntegrationConfig.value.deleteSync,
      storageConflictResolution: riffIntegrationConfig.value.storageConflictResolution,
    },
  };
  
  // 🔍 调试日志：检查 quickCard 配置
  logger.debug('Saving settings with quickCard', { quickCard: settingsToSave.quickCard });
  
  emit('save', settingsToSave);
}

// 重置默认
function resetSettings() {
  settings.value = {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableShortTerm: true,
    params: [...DEFAULT_PARAMS],
    dayStartHour: 4,  // 🆕 重置为默认值4
    autoPostponeEnabled: false,
    autoPostponeSkipTopN: 20,
    autoSortEnabled: true,
    addToOutstandingEveryNth: 2,
    priorityRandomness: 0.1,
    quickCard: {  // 🆕 重置快速制卡设置
      enabled: false,
      enabledSymbols: {
        basic: true,
        concept: true,
        descriptor: true,
        cloze: true,
        multiLine: true,
      },
      debounceDelay: {
        quick: 300,
        list: 2000,
      },
      descriptorUseXiuyuan: true,
    },
  };
}

// 🆕 重置调度器设置
function resetSchedulerSettings() {
  schedulerConfig.value = {
    defaultScheduler: 'fsrs-v6',
    topicScheduler: 'a-factor-v2',
    itemScheduler: 'fsrs-v6',
  };
}

// 🆕 dayStartHour 变更处理
function handleDayStartHourChange() {
  // 验证范围
  if (settings.value.dayStartHour < 0) {
    settings.value.dayStartHour = 0;
  } else if (settings.value.dayStartHour > 23) {
    settings.value.dayStartHour = 23;
  }
  
  logger.debug('dayStartHour changed', { dayStartHour: settings.value.dayStartHour });
}

function handleAddToOutstandingEveryNthChange() {
  settings.value.addToOutstandingEveryNth = normalizeOutstandingEveryNth(
    settings.value.addToOutstandingEveryNth
  );
}

function handleAutoPostponeSkipTopNChange() {
  settings.value.autoPostponeSkipTopN = normalizeAutoPostponeSkipTopN(
    settings.value.autoPostponeSkipTopN
  );
}

function handlePriorityRandomnessChange() {
  settings.value.priorityRandomness = normalizePriorityRandomness(
    settings.value.priorityRandomness
  );
}

// 🆕 快速设置 dayStartHour
function setDayStartHour(hour: number) {
  settings.value.dayStartHour = hour;
  handleDayStartHourChange();
}



onMounted(() => {
  loadSettings();
});

// 🆕 数据修复相关
const isRepairing = ref(false);
const repairResult = ref<{ fixed: number; total: number } | null>(null);

async function handleRepairDates() {
  if (isRepairing.value) return;
  
  isRepairing.value = true;
  repairResult.value = null;
  
  try {
    // 调用插件的修复方法
    // 注意：这里需要通过 emit 或其他方式调用插件的 storage.repairInvalidDates()
    // 由于 SettingsPanel 是一个独立组件，我们需要通过 emit 传递修复请求
    emit('repair-dates');
  } catch (err) {
    logger.error('Failed to repair dates', err);
  } finally {
    isRepairing.value = false;
  }
}
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-tab:hover {
  background: var(--b3-list-hover);
}

.settings-tab--active {
  background: var(--b3-theme-primary);
  color: white;
}

.settings-tab svg {
  width: 16px;
  height: 16px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.settings-section h4 {
  margin: 16px 0 8px 0;
  font-size: 14px;
  font-weight: 500;
}

.form-item {
  margin-bottom: 20px;
}

.form-item label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}

.form-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-control input[type="range"] {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--b3-theme-surface);
  outline: none;
  -webkit-appearance: none;
}

.form-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--b3-theme-primary);
  cursor: pointer;
}

.form-control input[type="number"] {
  width: 100px;
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  font-size: 14px;
}

.form-control input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.form-value {
  min-width: 48px;
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.form-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.params-preview {
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
  overflow-x: auto;
}

.params-preview code {
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.6;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--b3-theme-primary);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

.btn-secondary {
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
}

.btn-secondary:hover {
  background: var(--b3-list-hover);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-section ul {
  padding-left: 20px;
}

.settings-section a {
  color: var(--b3-theme-primary);
  text-decoration: none;
}

.settings-section a:hover {
  text-decoration: underline;
}

.form-control select,
.form-control input[type="text"] {
  height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  font-size: 14px;
}

.practice-filter {
  flex-wrap: wrap;
}

.practice-filter select {
  min-width: 120px;
}

.practice-filter input[type="text"] {
  flex: 1;
  min-width: 180px;
}

.practice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.practice-stats {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.practice-guide {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: var(--b3-theme-surface);
  margin-bottom: 16px;
}

.practice-guide__title {
  font-weight: 600;
  font-size: 13px;
}

.practice-guide__text {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

/* 🆕 调度器选择器样式 */
.scheduler-select {
  width: 100%;
  max-width: 300px;
}

.form-hint--warning {
  color: var(--b3-theme-error);
  font-weight: 500;
}

.advanced-config {
  margin-top: 16px;
}

.sub-config {
  margin-left: 24px;
  padding-left: 16px;
  border-left: 2px solid var(--b3-border-color);
}

/* 🆕 每日刷新时间样式 */
.form-example {
  margin-top: 8px;
  padding: 8px 12px;
  background-color: var(--b3-theme-surface);
  border-radius: 4px;
  font-size: 12px;
}

.example-label {
  color: var(--b3-theme-on-surface-light);
  margin-right: 8px;
}

.example-value {
  color: var(--b3-theme-primary);
  font-family: monospace;
}

.form-quick-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.btn-small {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--b3-theme-surface-lighter);
  border-radius: 4px;
  background-color: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-small:hover {
  background-color: var(--b3-theme-surface-light);
}

.btn-small.btn-active {
  background-color: var(--b3-theme-primary);
  color: var(--b3-theme-on-primary);
  border-color: var(--b3-theme-primary);
}

.form-unit {
  margin-left: 8px;
  color: var(--b3-theme-on-surface-light);
}

/* 🆕 快速制卡配置样式 */
.form-subsection {
  margin-left: 20px;
  padding-left: 16px;
  border-left: 2px solid var(--b3-border-color);
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 13px;
}

.checkbox-item input[type="checkbox"] {
  margin: 0;
}

.checkbox-item code {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: var(--b3-theme-surface);
  border-radius: 3px;
  color: var(--b3-theme-primary);
}

/* 🆕 关于页面样式 */
.about-section {
  max-width: 800px;
}

.guide-section {
  margin-bottom: 32px;
}

.guide-section h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.guide-intro {
  margin-bottom: 16px;
  color: var(--b3-theme-on-surface-light);
  line-height: 1.6;
}

/* 队列列表 */
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.queue-item {
  padding: 12px 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
  border-left: 3px solid var(--b3-theme-primary);
}

.queue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.queue-icon {
  font-size: 18px;
}

.queue-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.queue-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

/* 符号列表 */
.symbol-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.symbol-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
}

.symbol-code {
  flex-shrink: 0;
  padding: 4px 8px;
  background: var(--b3-theme-primary-lighter);
  color: var(--b3-theme-primary);
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
}

.symbol-info {
  flex: 1;
}

.symbol-name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--b3-theme-on-background);
}

.symbol-example {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  font-family: monospace;
  line-height: 1.6;
}

.symbol-note {
  margin-top: 4px;
  font-size: 11px;
  color: var(--b3-theme-primary);
  font-style: italic;
}

.guide-tip {
  padding: 12px 16px;
  background: var(--b3-theme-primary-lightest);
  border-radius: 8px;
  border-left: 3px solid var(--b3-theme-primary);
}

.guide-tip strong {
  color: var(--b3-theme-primary);
}

.guide-tip ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.guide-tip li {
  margin: 4px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--b3-theme-on-surface);
}

/* 入口列表 */
.entry-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entry-item {
  padding: 12px 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.entry-icon {
  font-size: 18px;
}

.entry-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.entry-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

/* 快捷键列表 */
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
}

.shortcut-item kbd {
  padding: 4px 8px;
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.shortcut-desc {
  flex: 1;
  font-size: 13px;
  color: var(--b3-theme-on-surface-light);
}

/* 关于信息 */
.about-info {
  padding: 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
  line-height: 1.8;
  font-size: 13px;
  color: var(--b3-theme-on-surface-light);
}

.about-info strong {
  color: var(--b3-theme-on-background);
  font-size: 14px;
}
</style>


/* 🆕 数据修复结果样式 */
.form-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
}

.form-result--success {
  background: var(--b3-theme-success-lighter);
  color: var(--b3-theme-success);
}

