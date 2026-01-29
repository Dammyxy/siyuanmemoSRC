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

        <h3>{{ t('featuresTitle', '功能开关') }}</h3>

        <!-- 自动制卡 -->
        <div class="form-item">
          <label>{{ t('autoCardEnabled', '实时自动制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.autoCardEnabled">
          </div>
          <p class="form-hint">{{ t('autoCardEnabledHint', '监听编辑操作，当输入特定内容（如高亮、问答）时自动创建闪卡') }}</p>
        </div>

        <!-- 当前参数展示 -->
        <div class="form-item">
          <label>{{ t('modelParams', '模型参数 (19)') }}</label>
          <div class="params-preview">
            <code>{{ paramsPreview }}</code>
          </div>
          <p class="form-hint">{{ t('modelParamsHint', '使用优化器可以根据你的复习数据自动优化这些参数') }}</p>
        </div>

        <div class="form-actions">
          <button class="btn-primary" @click="saveSettings">{{ t('saveSettings', '保存设置') }}</button>
          <button class="btn-secondary" @click="resetSettings">{{ t('resetDefault', '重置默认') }}</button>
        </div>
      </div>



      <!-- 关于 -->
      <div v-show="activeTab === 'about'" class="settings-section">
        <h3>{{ t('aboutFsrsTitle', '关于 FSRS') }}</h3>
        <p>{{ t('aboutFsrsDesc1', 'FSRS (Free Spaced Repetition Scheduler) 是一种现代的间隔重复算法，由 Jarrett Ye 开发。') }}</p>
        <p>{{ t('aboutFsrsDesc2', '相比传统的 SM-2 算法，FSRS 能够更准确地预测记忆遗忘曲线，提供更优的复习计划。') }}</p>
        
        <h4>{{ t('links', '链接') }}</h4>
        <ul>
          <li><a href="https://github.com/open-spaced-repetition/fsrs4anki" target="_blank">FSRS GitHub</a></li>
          <li><a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank">ts-fsrs</a></li>
        </ul>

        <h4>{{ t('version', '版本') }}</h4>
        <p>FSRS-5 (ts-fsrs)</p>
      </div>

      <div v-show="activeTab === 'practice'" class="settings-section">
        <h3>{{ t('practiceTab', '练习模式') }}</h3>
        <div class="practice-guide">
          <div class="practice-guide__title">{{ t('practiceQueueGuideTitle', '队列模式') }}</div>
          <div class="practice-guide__text">{{ t('practiceQueueGuide', '筛选并加入练习队列，队列会持久保存。') }}</div>
          <div class="practice-guide__text">{{ t('practiceQueueGuideStep1', '1. 选择筛选条件并查看数量') }}</div>
          <div class="practice-guide__text">{{ t('practiceQueueGuideStep2', '2. 加入队列后可跨次继续练习') }}</div>
          <div class="practice-guide__text">{{ t('practiceQueueGuideStep3', '3. 进入练习时会显示队列模式标识') }}</div>
          <div class="practice-guide__title">{{ t('practiceBlockGuideTitle', '块练习模式') }}</div>
          <div class="practice-guide__text">{{ t('practiceBlockGuide', '在文档块或父级块上右键，收集当前块及子块闪卡进行练习。') }}</div>
          <div class="practice-guide__text">{{ t('practiceBlockGuideStep1', '1. 仅收集当前块层级内的闪卡') }}</div>
          <div class="practice-guide__text">{{ t('practiceBlockGuideStep2', '2. 与队列模式数据完全隔离') }}</div>
          <div class="practice-guide__text">{{ t('practiceBlockGuideStep3', '3. 练习界面显示块练习标识') }}</div>
        </div>

        <div class="form-item">
          <label>{{ t('practiceFilterType', '筛选条件') }}</label>
          <div class="form-control practice-filter">
            <select v-model="queueFilterType">
              <option value="doc">{{ t('practiceFilterDoc', '文档ID') }}</option>
              <option value="tree">{{ t('practiceFilterTree', '文档树') }}</option>
              <option value="sql">{{ t('practiceFilterSql', 'SQL') }}</option>
            </select>
            <input v-model="queueFilterValue" type="text" :placeholder="t('practiceFilterPlaceholder', '输入筛选值')" />
          </div>
          <p class="form-hint">{{ t('practiceFilterHint', '文档树会包含子文档，SQL 应返回块列表。') }}</p>
        </div>

        <div class="practice-actions">
          <button class="btn-secondary" @click="handleQueuePreview">{{ t('practicePreview', '查看筛选数量') }}</button>
          <button class="btn-primary" @click="handleQueueAdd">{{ t('practiceAddToQueue', '加入练习队列') }}</button>
          <button class="btn-secondary" @click="handleQueueStart">{{ t('practiceStartQueue', '开始队列练习') }}</button>
          <button class="btn-secondary" @click="handleQueueClear">{{ t('practiceClearQueue', '清空队列') }}</button>
        </div>

        <div class="practice-stats">
          <span>{{ t('practiceQueueCount', '队列数量') }}: {{ queueCount }}</span>
          <span v-if="queuePreviewCount !== null">{{ t('practicePreviewCount', '筛选数量') }}: {{ queuePreviewCount }}</span>
        </div>

        <div class="fn__hr"></div>

        <h4>{{ t('queueStrategyTitle', '队列策略') }}</h4>
        <div class="form-item">
          <label>{{ t('defaultQueue', '默认队列') }}</label>
          <div class="form-control">
            <select v-model="queueSettings.defaultQueue">
              <option value="extraction">{{ t('queueExtraction', '提取练习队列') }}</option>
              <option value="final-drill">{{ t('queueDeliberate', '最终冲刺队列') }}</option>
              <option value="neural-roam">{{ t('queueNeural', '神经漫游队列') }}</option>
              <option value="filter-group">{{ t('queueFilterGroup', '筛选组队列') }}</option>
            </select>
          </div>
        </div>

        <!-- TODO: 神经漫游队列配置UI - 等待新实现 -->
        <!-- 旧的神经漫游队列代码已被移除 -->
        <!--
        <div class="form-item">
          <label>{{ t('neuralWanderingQueue', '神经漫游队列') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="queueSettings.neuralWandering.enabled">
            <span>{{ t('enable', '启用') }}</span>
            <span class="fn__space"></span>
            <span>{{ t('maxPool', '最大池') }}</span>
            <input type="number" min="10" max="5000" v-model.number="queueSettings.neuralWandering.maxPool" style="width: 110px;">
          </div>
          <div class="form-control" style="margin-top: 8px; flex-wrap: wrap;">
            <span>{{ t('historyLimit', '历史长度') }}</span>
            <input type="number" min="5" max="500" v-model.number="queueSettings.neuralWandering.historyLimit" style="width: 110px;">
            <span>{{ t('maxContext', '同文档上限') }}</span>
            <input type="number" min="5" max="200" v-model.number="queueSettings.neuralWandering.maxContext" style="width: 110px;">
          </div>
          <div class="form-control" style="margin-top: 8px; flex-wrap: wrap;">
            <input type="checkbox" v-model="queueSettings.neuralWandering.enableTags">
            <span>{{ t('enableTags', '启用标签') }}</span>
            <span>{{ t('maxTags', '标签上限') }}</span>
            <input type="number" min="0" max="200" v-model.number="queueSettings.neuralWandering.maxTags" style="width: 110px;">
            <input type="checkbox" v-model="queueSettings.neuralWandering.enableSiblings">
            <span>{{ t('enableSiblings', '启用兄弟块') }}</span>
            <span>{{ t('maxSiblings', '兄弟上限') }}</span>
            <input type="number" min="0" max="200" v-model.number="queueSettings.neuralWandering.maxSiblings" style="width: 110px;">
          </div>
          <div class="form-control" style="margin-top: 8px; flex-wrap: wrap;">
            <span>{{ t('weightRef', '双链权重') }}</span>
            <input type="number" min="0" max="100" v-model.number="queueSettings.neuralWandering.weights.ref" style="width: 90px;">
            <span>{{ t('weightContext', '同文档权重') }}</span>
            <input type="number" min="0" max="100" v-model.number="queueSettings.neuralWandering.weights.context" style="width: 90px;">
            <span>{{ t('weightTag', '标签权重') }}</span>
            <input type="number" min="0" max="100" v-model.number="queueSettings.neuralWandering.weights.tag" style="width: 90px;">
            <span>{{ t('weightSibling', '兄弟权重') }}</span>
            <input type="number" min="0" max="100" v-model.number="queueSettings.neuralWandering.weights.sibling" style="width: 90px;">
          </div>
        </div>
        -->

        <div class="form-item">
          <label>{{ t('filterGroupQueue', '筛选组队列') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="queueSettings.filterGroup.enabled">
            <span>{{ t('enable', '启用') }}</span>
          </div>
          <div class="form-control" style="margin-top: 8px; align-items: flex-start;">
            <textarea v-model="filterGroupsJson" rows="6" style="width: 100%;"></textarea>
          </div>
          <p v-if="queueConfigError" class="form-hint ft__error">{{ queueConfigError }}</p>
          <p v-else class="form-hint">{{ t('filterGroupHint', 'JSON 数组，每项包含 id/name/type/value/weight') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { FilterGroupDefinition, FSRSParameters, QueueSettings } from '../../types';

// FSRS-5 默认权重参数
const DEFAULT_PARAMS = [
  0.40255, 1.18385, 3.173, 15.69105,
  7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621
];

// Emits
const emit = defineEmits<{
  (e: 'save', settings: any): void;
  (e: 'close'): void;
}>();

const props = defineProps<{
  fsrsSettings?: FSRSParameters;
  queueSettings?: QueueSettings;
  incrementalSettings?: { autoCardEnabled: boolean };
  i18n?: Record<string, string>;
  defaultTab?: string;
  queueCount?: number;
  queueHandlers?: {
    preview: (filter: { type: string; value: string }) => Promise<number>;
    add: (filter: { type: string; value: string }) => Promise<number>;
    start: () => Promise<void>;
    clear: () => Promise<void>;
  };
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const tabs = computed(() => [
  { key: 'params', label: t('settingsParamsTab', '参数设置'), icon: '#iconSettings' },
  { key: 'practice', label: t('practiceTab', '练习模式'), icon: '#iconPlay' },
  { key: 'about', label: t('settingsAboutTab', '关于'), icon: '#iconInfo' },
]);

const activeTab = ref(props.defaultTab || 'params');
const queueFilterType = ref<'doc' | 'tree' | 'sql'>('doc');
const queueFilterValue = ref('');
const queuePreviewCount = ref<number | null>(null);
const queueCount = ref(props.queueCount || 0);
const queueConfigError = ref('');

const queueSettings = ref<QueueSettings>({
  defaultQueue: 'retrieval',
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
const filterGroupsJson = ref('[]');

// 设置
interface Settings {
  requestRetention: number;
  maximumInterval: number;
  enableShortTerm: boolean;
  params: number[];
  autoCardEnabled: boolean;
}

const settings = ref<Settings>({
  requestRetention: 0.9,
  maximumInterval: 365,
  enableShortTerm: true,
  params: [...DEFAULT_PARAMS],
  autoCardEnabled: false,
});

// 参数预览
const paramsPreview = computed(() => {
  return settings.value.params.map(p => p.toFixed(4)).join(', ');
});

// 加载设置
function loadSettings() {
  if (props.fsrsSettings) {
    settings.value = {
      requestRetention: props.fsrsSettings.requestRetention,
      maximumInterval: props.fsrsSettings.maximumInterval,
      enableShortTerm: props.fsrsSettings.enableShortTerm,
      params: [...props.fsrsSettings.weights],
      autoCardEnabled: props.incrementalSettings?.autoCardEnabled ?? false,
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
  }
  filterGroupsJson.value = JSON.stringify(queueSettings.value.filterGroup.groups || [], null, 2);
}

// 保存设置
function saveSettings() {
  queueConfigError.value = '';
  let groups: FilterGroupDefinition[] = [];
  try {
    const parsed = JSON.parse(filterGroupsJson.value || '[]');
    if (!Array.isArray(parsed)) {
      throw new Error('invalid groups');
    }
    groups = parsed;
  } catch {
    queueConfigError.value = t('queueConfigInvalid', '筛选组配置不是合法 JSON 数组');
    return;
  }
  const queues: QueueSettings = {
    ...queueSettings.value,
    filterGroup: {
      ...queueSettings.value.filterGroup,
      groups,
    },
  };
  emit('save', { 
    ...settings.value, 
    queues,
    incremental: {
      autoCardEnabled: settings.value.autoCardEnabled
    }
  });
}

// 重置默认
function resetSettings() {
  settings.value = {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableShortTerm: true,
    params: [...DEFAULT_PARAMS],
  };
}



onMounted(() => {
  loadSettings();
});

async function handleQueuePreview() {
  if (!props.queueHandlers?.preview) return;
  queuePreviewCount.value = await props.queueHandlers.preview({
    type: queueFilterType.value,
    value: queueFilterValue.value,
  });
}

async function handleQueueAdd() {
  if (!props.queueHandlers?.add) return;
  const added = await props.queueHandlers.add({
    type: queueFilterType.value,
    value: queueFilterValue.value,
  });
  if (added > 0) {
    queueCount.value += added;
  }
}

async function handleQueueStart() {
  if (!props.queueHandlers?.start) return;
  await props.queueHandlers.start();
}

async function handleQueueClear() {
  if (!props.queueHandlers?.clear) return;
  await props.queueHandlers.clear();
  queueCount.value = 0;
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
</style>
