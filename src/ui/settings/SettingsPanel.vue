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



      <!-- About -->
      <div v-show="activeTab === 'about'" class="settings-section about-section">
        <h3>📚 Spaced Repetition System Guide</h3>
        
        <!-- Card Types -->
        <div class="guide-section">
          <h4>🎴 Four Card Types</h4>
          
          <div class="queue-list">
            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">❓</span>
                <span class="queue-name">Practice (Item Card)</span>
              </div>
              <p class="queue-desc">
                Flashcards in the broad sense, with questions on the front and answers on the back, the purest form of retrieval practice.
                <br>• Auto-created cards with back questions are recognized as Item
                <br>• Can also be manually marked in the browser
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">📖</span>
                <span class="queue-name">Material (Topic Card)</span>
              </div>
              <p class="queue-desc">
                Reading material cards for incremental learning.
                <br>• Auto-created cards without back questions are recognized as Topic
                <br>• Press space during review to go directly to the next card
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">🏷️</span>
                <span class="queue-name">Definition (Descriptor Card)</span>
              </div>
              <p class="queue-desc">
                Descriptor cards, derived from RemNote's CDF framework (Concept/Descriptor Framework).
                <br>• Use <code>;;</code> symbol to create: property;;description
                <br>• Shows parent block as context, suitable for structured notes
                <br>• Can create templates for commonly used descriptor combinations
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">🧠</span>
                <span class="queue-name">Concept (Concept Card)</span>
              </div>
              <p class="queue-desc">
                Core nodes for neural roaming, corresponding to SiYuan document blocks.
                <br>• Right-click document block icon → Create as concept card
                <br>• Used to build knowledge networks and concept associations
              </p>
            </div>
          </div>
        </div>

        <!-- Queue System -->
        <div class="guide-section">
          <h4>🎯 Five Review Queues</h4>
          
          <div class="queue-list">
            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">🎯</span>
                <span class="queue-name">Retrieval Practice</span>
              </div>
              <p class="queue-desc">
                Gets Item and Descriptor cards due today and manually added.
                <br>• Driven by FSRS algorithm
                <br>• Focuses on knowledge point memorization and understanding
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">📚</span>
                <span class="queue-name">Incremental Learning</span>
              </div>
              <p class="queue-desc">
                Gets all types of cards due today and manually added.
                <br>• Item/Descriptor uses FSRS algorithm
                <br>• Topic/Concept uses another algorithm
                <br>• Suitable for comprehensive review
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">🔍</span>
                <span class="queue-name">Filtered Review</span>
              </div>
              <p class="queue-desc">
                Gets cards for review based on filter conditions.
                <br>• Normal rating removes cards
                <br>• Click Rebuild to re-fetch cards
                <br>• Suitable for targeted review
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">💪</span>
                <span class="queue-name">Deliberate Practice (Static Queue)</span>
              </div>
              <p class="queue-desc">
                From SuperMemo's Final Drill, tackles difficult cards.
                <br>• Cards rated less than 3 are automatically added
                <br>• Only rating 4 removes from queue
                <br>• Uses local shuffle algorithm for sorting
              </p>
            </div>

            <div class="queue-item">
              <div class="queue-header">
                <span class="queue-icon">🌐</span>
                <span class="queue-name">Neural Roam</span>
              </div>
              <p class="queue-desc">
                Intelligent exploration based on SiYuan backlinks and SuperMemo neural review.
                <br>• Automatically gets backlinks and descriptor cards of concept cards
                <br>• Uses spreading activation algorithm
                <br>• Right-click block reference to add forward link concepts
              </p>
            </div>
          </div>
        </div>

        <!-- Quick Card Creation -->
        <div class="guide-section">
          <h4>⚡ Quick Card Creation</h4>
          
          <div class="symbol-list">
            <div class="symbol-item">
              <code class="symbol-code">&gt;&gt;</code>
              <div class="symbol-info">
                <div class="symbol-name">Forward Card</div>
                <div class="symbol-example">Question &gt;&gt; Answer</div>
              </div>
            </div>

            <div class="symbol-item">
              <code class="symbol-code">&lt;&lt;</code>
              <div class="symbol-info">
                <div class="symbol-name">Reverse Card</div>
                <div class="symbol-example">Answer &lt;&lt; Question</div>
              </div>
            </div>

            <div class="symbol-item">
              <code class="symbol-code">&lt;&gt;</code>
              <div class="symbol-info">
                <div class="symbol-name">Bidirectional Card</div>
                <div class="symbol-example">Term &lt;&gt; Definition (generates two cards)</div>
              </div>
            </div>

            <div class="symbol-item">
              <code class="symbol-code">;;</code>
              <div class="symbol-info">
                <div class="symbol-name">Descriptor Card</div>
                <div class="symbol-example">Property ;; Description</div>
                <div class="symbol-note">💡 Requires parent block to reference concept document</div>
              </div>
            </div>

            <div class="symbol-item">
              <code class="symbol-code">&#123;&#123;cloze&#125;&#125;</code>
              <div class="symbol-info">
                <div class="symbol-name">Cloze Card</div>
                <div class="symbol-example">Text&#123;&#123;blank&#125;&#125; or ==highlight== or SiYuan mark</div>
                <div class="symbol-note">💡 Multiple clozes generate multiple cards</div>
              </div>
            </div>
          </div>

          <div class="guide-tip">
            <strong>💡 Template Card Creation:</strong> Use ordered lists for batch card creation, sharing the same block ID.
            <br>• Right-click parent list item → Block menu → Plugin → siyuanmemo → Create list template card
            <br>• Supports question supplements and hints: hint→question
          </div>
        </div>

        <!-- Card Planning -->
        <div class="guide-section">
          <h4>📅 Card Planning</h4>
          
          <div class="entry-list">
            <div class="entry-item">
              <div class="entry-header">
                <span class="entry-icon">📊</span>
                <span class="entry-name">Sort</span>
              </div>
              <p class="entry-desc">
                Sort queue cards in the browser, affecting review order.
                <br>• Click field to sort or right-click to sort
              </p>
            </div>

            <div class="entry-item">
              <div class="entry-header">
                <span class="entry-icon">⏩</span>
                <span class="entry-name">Advance</span>
              </div>
              <p class="entry-desc">
                Right-click card and select [Advance] to reduce due date.
              </p>
            </div>

            <div class="entry-item">
              <div class="entry-header">
                <span class="entry-icon">⏸️</span>
                <span class="entry-name">Postpone</span>
              </div>
              <p class="entry-desc">
                Right-click card and select [Postpone] to increase due date.
              </p>
            </div>

            <div class="entry-item">
              <div class="entry-header">
                <span class="entry-icon">📈</span>
                <span class="entry-name">Spread Workload</span>
              </div>
              <p class="entry-desc">
                Toolbar [Spread Workload] button evenly distributes review tasks.
                <br>• All flashcards: Can choose to handle backlog or future reviews
                <br>• Queue view: Collects due cards by default
              </p>
            </div>
          </div>
        </div>

        <!-- SRS Browser -->
        <div class="guide-section">
          <h4>🗂️ SRS Browser</h4>
          <p class="guide-intro">Sidebar flashcard browser, manages all cards and queues.</p>
          
          <div class="entry-list">
            <div class="entry-item">
              <p class="entry-desc">
                • Top left: Queue area, click queue to view cards
                <br>• Bottom left: Document area, shows document containing cards
                <br>• Right side: Preview area, previews blocks corresponding to cards (double-click to unlock)
                <br>• Right-click menu: Remove, sort, postpone, advance, and other operations
              </p>
            </div>
          </div>
        </div>

        <!-- Version Info -->
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
import { ref, computed, onMounted } from 'vue';
import type { FilterGroupDefinition, FSRSParameters, QueueSettings, SchedulerConfig } from '../../types';
import { getTodayRange, formatTodayRange } from '../../utils/dateUtils';  // 🆕 导入日期工具

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
  (e: 'repair-dates'): void;  // 🆕 数据修复事件
  (e: 'optimize-parameters', config: any): Promise<any>;  // 🆕 参数优化事件
}>();

const props = defineProps<{
  fsrsSettings?: FSRSParameters;
  queueSettings?: QueueSettings;
  schedulerSettings?: SchedulerConfig;  // 🆕 新增
  riffIntegrationSettings?: any;  // 🆕 Riff 集成配置
  incrementalSettings?: { autoCardEnabled: boolean };
  quickCardSettings?: any;  // 🆕 快速制卡配置
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
    optimize: (config: any) => Promise<any>;
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
  quickCard: {  // 🆕 快速制卡设置
    enabled: boolean;
  };
}

const settings = ref<Settings>({
  requestRetention: 0.9,
  maximumInterval: 365,
  enableShortTerm: true,
  params: [...DEFAULT_PARAMS],
  dayStartHour: 4,  // 🆕 默认值：凌晨4点
  quickCard: {  // 🆕 默认值
    enabled: false,
  },
});

// 🆕 快速制卡设置
const quickCardSettings = ref({
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
  defaultScheduler: 'fsrs-v5',
  topicScheduler: 'a-factor-v2',
  itemScheduler: 'fsrs-v5',
});

// 调度器说明
const schedulerDescriptions: Record<string, string> = {
  'fsrs-v5': '现代算法，准确预测遗忘曲线，推荐使用',
  'sm15': 'SuperMemo 15 算法，完整的遗忘曲线系统',
  'a-factor-v2': '改进的 A-Factor，动态调整难度',
};

// 🆕 Riff 集成配置（固定启用，不可配置）
const riffIntegrationConfig = ref({
  useLocalScheduler: true,
  incrementalSync: {
    enabled: true,
    triggers: ['plugin-start', 'browser-open', 'review-open'] as Array<'plugin-start' | 'browser-open' | 'review-open'>,
    useBlacklist: true,
    autoDetectCardType: true,
  },
  fullSync: {
    enabled: true,
    interval: 86400000,  // 24小时
    cleanupBlacklist: true,
  },
  deleteSync: {
    enabled: true,
    useBlacklistFallback: true,
  },
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

// 加载设置
function loadSettings() {
  if (props.fsrsSettings) {
    settings.value = {
      requestRetention: props.fsrsSettings.requestRetention,
      maximumInterval: props.fsrsSettings.maximumInterval,
      enableShortTerm: props.fsrsSettings.enableShortTerm,
      params: [...props.fsrsSettings.weights],
      dayStartHour: props.fsrsSettings.dayStartHour ?? 4,  // 🆕 加载 dayStartHour 配置
      quickCard: {  // 🆕 初始化 quickCard 字段
        enabled: props.quickCardSettings?.enabled ?? false,
      },
    };
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
  }

  // 🆕 加载调度器配置
  if (props.schedulerSettings) {
    schedulerConfig.value = {
      defaultScheduler: props.schedulerSettings.defaultScheduler || 'fsrs-v6',
      topicScheduler: props.schedulerSettings.topicScheduler || 'a-factor-v2',
      itemScheduler: props.schedulerSettings.itemScheduler || 'fsrs-v6',
    };
  }

  // 🆕 加载 Riff 集成配置（始终使用固定配置，不从 props 加载）
  // Riff 数据同步是插件必要功能，始终启用
  riffIntegrationConfig.value = {
    useLocalScheduler: true,
    incrementalSync: {
      enabled: true,
      triggers: ['plugin-start', 'browser-open', 'review-open'],
      useBlacklist: true,
      autoDetectCardType: true,
    },
    fullSync: {
      enabled: true,
      interval: 86400000,
      cleanupBlacklist: true,
    },
    deleteSync: {
      enabled: true,
      useBlacklistFallback: true,
    },
  };

  // 更新触发器复选框状态（虽然不显示，但保持数据一致性）
  triggers.value = {
    pluginStart: true,
    browserOpen: true,
    reviewOpen: true,
  };
}

// 保存设置
function saveSettings() {
  const queues: QueueSettings = {
    ...queueSettings.value,
  };

  // 🆕 从复选框状态构建 triggers 数组
  const triggersArray: Array<'plugin-start' | 'browser-open' | 'review-open'> = [];
  if (triggers.value.pluginStart) triggersArray.push('plugin-start');
  if (triggers.value.browserOpen) triggersArray.push('browser-open');
  if (triggers.value.reviewOpen) triggersArray.push('review-open');

  emit('save', {
    ...settings.value,
    queues,
    // 🆕 保存快速制卡配置（使用 settings.quickCard，因为模板绑定的是这个）
    quickCard: {
      enabled: settings.value.quickCard.enabled,  // 🔧 修复：使用 settings.quickCard 而不是 quickCardSettings
      enabledSymbols: quickCardSettings.value.enabledSymbols,
      debounceDelay: quickCardSettings.value.debounceDelay,
      descriptorUseXiuyuan: quickCardSettings.value.descriptorUseXiuyuan,
    },
    // 🆕 保存调度器配置
    scheduler: {
      defaultScheduler: schedulerConfig.value.defaultScheduler,
      topicScheduler: schedulerConfig.value.topicScheduler,
      itemScheduler: schedulerConfig.value.itemScheduler,
    },
    // 🆕 保存 Riff 集成配置
    riffIntegration: {
      useLocalScheduler: riffIntegrationConfig.value.useLocalScheduler,
      incrementalSync: {
        ...riffIntegrationConfig.value.incrementalSync,
        triggers: triggersArray,
      },
      fullSync: riffIntegrationConfig.value.fullSync,
      deleteSync: riffIntegrationConfig.value.deleteSync,
    },
  });
}

// 重置默认
function resetSettings() {
  settings.value = {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableShortTerm: true,
    params: [...DEFAULT_PARAMS],
    dayStartHour: 4,  // 🆕 重置为默认值4
    quickCard: {  // 🆕 重置快速制卡设置
      enabled: false,
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
  
  console.log('[SiYuanMemo][Settings] dayStartHour changed:', settings.value.dayStartHour);
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
    emit('repair-dates' as any);
  } catch (err) {
    console.error('[SiYuanMemo][SettingsPanel] Failed to repair dates:', err);
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

