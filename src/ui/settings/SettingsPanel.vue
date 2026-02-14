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

        <!-- 🆕 启用调试日志 -->
        <div class="form-item">
          <label>{{ t('enableDebugLogs', '启用调试日志') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="uiSettings.enableDebugLogs" @change="handleDebugLogsChange">
          </div>
          <p class="form-hint">{{ t('enableDebugLogsHint', '在浏览器控制台显示详细的调试信息（开发用，关闭可提升性能）') }}</p>
        </div>

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

        <div class="fn__hr"></div>

        <!-- 🆕 参数优化 -->
        <h3>{{ t('parameterOptimization', '参数优化') }}</h3>
        
        <div class="form-item">
          <label>{{ t('optimizeParameters', '优化 FSRS 参数') }}</label>
          <p class="form-hint">{{ t('optimizeParametersHint', '根据你的复习历史数据自动优化 FSRS 参数，提高算法准确性。需要至少 100 条复习记录。') }}</p>
          
          <div class="form-control">
            <button 
              class="b3-button b3-button--outline" 
              @click="handleOptimizeParameters"
              :disabled="isOptimizing"
            >
              {{ isOptimizing ? t('optimizing', '优化中...') : t('startOptimization', '开始优化') }}
            </button>
          </div>
          
          <!-- 优化进度 -->
          <div v-if="isOptimizing" class="optimization-progress">
            <div class="progress-bar">
              <div class="progress-bar__fill" :style="{ width: optimizationProgress + '%' }"></div>
            </div>
            <p class="progress-text">{{ t('optimizationProgress', '优化进度') }}: {{ optimizationProgress }}%</p>
          </div>
          
          <!-- 优化结果 -->
          <div v-if="optimizationResult" class="optimization-result">
            <div class="result-header">
              <span class="result-icon">✅</span>
              <span class="result-title">{{ t('optimizationComplete', '优化完成') }}</span>
            </div>
            <div class="result-stats">
              <div class="result-stat">
                <span class="stat-label">{{ t('reviewCount', '复习记录数') }}:</span>
                <span class="stat-value">{{ optimizationResult.reviewCount }}</span>
              </div>
              <div class="result-stat">
                <span class="stat-label">{{ t('duration', '耗时') }}:</span>
                <span class="stat-value">{{ formatDuration(optimizationResult.duration) }}</span>
              </div>
            </div>
            <div class="result-params">
              <label>{{ t('optimizedParams', '优化后的参数') }}:</label>
              <div class="params-preview">
                <code>{{ formatWeights(optimizationResult.weights) }}</code>
              </div>
            </div>
            <div class="result-actions">
              <button class="btn-primary" @click="applyOptimizedParams">
                {{ t('applyParams', '应用优化参数') }}
              </button>
              <button class="btn-secondary" @click="discardOptimizedParams">
                {{ t('discard', '放弃') }}
              </button>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-primary" @click="saveSettings">{{ t('saveSettings', '保存设置') }}</button>
          <button class="btn-secondary" @click="resetSettings">{{ t('resetDefault', '重置默认') }}</button>
        </div>
      </div>



      <!-- 🆕 Riff 集成配置 -->
      <div v-show="activeTab === 'riff'" class="settings-section">
        <h3>{{ t('riffIntegrationTitle', 'Riff 集成配置') }}</h3>
        
        <!-- 高阶模式详细配置 -->
        <div class="advanced-config">
          <div class="fn__hr"></div>
          
          <h4>{{ t('schedulerSettingsTitle', '调度器设置') }}</h4>
          
          <!-- 默认调度器 -->
          <div class="form-item">
            <label>{{ t('defaultScheduler', '默认调度器') }}</label>
            <div class="form-control">
              <select v-model="schedulerConfig.defaultScheduler" class="scheduler-select">
                <option value="fsrs-v5">{{ t('schedulerFsrsV5', 'FSRS v5 (推荐)') }}</option>
                <option value="sm2">{{ t('schedulerSm2', 'SM-2') }}</option>
                <option value="sm15">{{ t('schedulerSm15', 'SM-15') }}</option>
                <option value="a-factor-v2">{{ t('schedulerAFactorV2', 'A-Factor v2') }}</option>
              </select>
            </div>
            <p class="form-hint">
              💡 {{ schedulerDescriptions[schedulerConfig.defaultScheduler] }}
            </p>
          </div>

          <!-- Topic 调度器 -->
          <div class="form-item">
            <label>{{ t('topicScheduler', 'Topic 卡片调度器') }}</label>
            <div class="form-control">
              <select v-model="schedulerConfig.topicScheduler" class="scheduler-select">
                <option value="a-factor">{{ t('schedulerAFactor', 'A-Factor (原始)') }}</option>
                <option value="a-factor-v2">{{ t('schedulerAFactorV2Recommended', 'A-Factor v2 (推荐)') }}</option>
              </select>
            </div>
            <p class="form-hint">
              💡 {{ t('topicSchedulerHint', '适合阅读材料，动态调整难度因子') }}
            </p>
          </div>

          <!-- Item 调度器 -->
          <div class="form-item">
            <label>{{ t('itemScheduler', 'Item 卡片调度器') }}</label>
            <div class="form-control">
              <select v-model="schedulerConfig.itemScheduler" class="scheduler-select">
                <option value="fsrs-v5">{{ t('schedulerFsrsV5Recommended', 'FSRS v5 (推荐)') }}</option>
                <option value="sm2">{{ t('schedulerSm2', 'SM-2') }}</option>
                <option value="sm15">{{ t('schedulerSm15', 'SM-15') }}</option>
              </select>
            </div>
            <p class="form-hint">
              💡 {{ t('itemSchedulerHint', '适合问答卡片，精确间隔计算') }}
            </p>
          </div>
          
          <div class="fn__hr"></div>
          
          <h4>{{ t('incrementalSyncConfig', '增量同步配置') }}</h4>
          <div class="form-item">
            <label>
              <input type="checkbox" v-model="riffIntegrationConfig.incrementalSync.enabled" />
              {{ t('enableIncrementalSync', '启用增量同步') }}
            </label>
          </div>
          
          <div v-if="riffIntegrationConfig.incrementalSync.enabled" class="sub-config">
            <div class="form-item">
              <label>{{ t('syncTriggers', '触发时机') }}</label>
              <div class="form-control" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                <label>
                  <input type="checkbox" v-model="triggers.pluginStart" />
                  {{ t('triggerPluginStart', '插件启动时') }}
                </label>
                <label>
                  <input type="checkbox" v-model="triggers.browserOpen" />
                  {{ t('triggerBrowserOpen', 'SRS 浏览器打开时') }}
                </label>
                <label>
                  <input type="checkbox" v-model="triggers.reviewOpen" />
                  {{ t('triggerReviewOpen', '复习界面打开时') }}
                </label>
              </div>
            </div>
            
            <div class="form-item">
              <label>
                <input type="checkbox" v-model="riffIntegrationConfig.incrementalSync.useBlacklist" />
                {{ t('useBlacklist', '使用黑名单过滤已删除卡片') }}
              </label>
              <p class="form-hint">{{ t('useBlacklistHint', '黑名单会记录本地删除的卡片，避免重复同步') }}</p>
            </div>

            <div class="form-item">
              <label>
                <input type="checkbox" v-model="riffIntegrationConfig.incrementalSync.autoDetectCardType" />
                {{ t('autoDetectCardType', '自动检测卡片类型') }}
              </label>
              <p class="form-hint">{{ t('autoDetectCardTypeHint', '自动识别 Topic（主题）和 Item（卡片）类型') }}</p>
            </div>
          </div>

          <div class="fn__hr"></div>
          
          <h4>{{ t('fullSyncConfig', '全量同步配置') }}</h4>
          <div class="form-item">
            <label>
              <input type="checkbox" v-model="riffIntegrationConfig.fullSync.enabled" />
              {{ t('enableFullSync', '启用全量同步') }}
            </label>
          </div>
          
          <div v-if="riffIntegrationConfig.fullSync.enabled" class="sub-config">
            <div class="form-item">
              <label>{{ t('syncInterval', '同步间隔') }}</label>
              <div class="form-control">
                <select v-model.number="riffIntegrationConfig.fullSync.interval">
                  <option :value="43200000">{{ t('interval12h', '12小时') }}</option>
                  <option :value="86400000">{{ t('interval24h', '24小时') }}</option>
                  <option :value="172800000">{{ t('interval48h', '48小时') }}</option>
                  <option :value="604800000">{{ t('interval7d', '7天') }}</option>
                </select>
              </div>
              <p class="form-hint">{{ t('syncIntervalHint', '全量同步会对比本地和 Riff 的所有卡片，检测双向删除') }}</p>
            </div>
            
            <div class="form-item">
              <label>
                <input type="checkbox" v-model="riffIntegrationConfig.fullSync.cleanupBlacklist" />
                {{ t('cleanupBlacklist', '全量同步后清理黑名单') }}
              </label>
              <p class="form-hint">{{ t('cleanupBlacklistHint', '清理黑名单中 Riff 已不存在的卡片 ID') }}</p>
            </div>
          </div>

          <div class="fn__hr"></div>
          
          <h4>{{ t('deleteSyncConfig', '删除同步配置') }}</h4>
          <div class="form-item">
            <label>
              <input type="checkbox" v-model="riffIntegrationConfig.deleteSync.enabled" />
              {{ t('enableDeleteSync', '启用双向删除同步') }}
            </label>
            <p class="form-hint">{{ t('enableDeleteSyncHint', '在插件中删除卡片时，同步删除 Riff 中的对应卡片') }}</p>
          </div>
          
          <div v-if="riffIntegrationConfig.deleteSync.enabled" class="sub-config">
            <div class="form-item">
              <label>
                <input type="checkbox" v-model="riffIntegrationConfig.deleteSync.useBlacklistFallback" />
                {{ t('useBlacklistFallback', '删除失败时使用黑名单作为后备') }}
              </label>
              <p class="form-hint">{{ t('useBlacklistFallbackHint', '如果删除 Riff 卡片失败（如网络问题），将卡片加入黑名单') }}</p>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-primary" @click="saveSettings">{{ t('saveSettings', '保存设置') }}</button>
        </div>
      </div>

      <!-- 练习模式 -->
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
        
        <div class="fn__hr"></div>
        
        <!-- 🆕 数据维护 -->
        <h3>{{ t('dataMaintenance', '数据维护') }}</h3>
        
        <div class="form-item">
          <label>{{ t('repairInvalidDates', '修复无效日期') }}</label>
          <div class="form-control">
            <button 
              class="b3-button b3-button--outline" 
              @click="handleRepairDates"
              :disabled="isRepairing"
            >
              {{ isRepairing ? t('repairing', '修复中...') : t('repairNow', '立即修复') }}
            </button>
          </div>
          <p class="form-hint">
            {{ t('repairInvalidDatesHint', '扫描并修复所有卡片中的无效日期（如"上次复习"显示为1月1日的问题）。修复后会自动保存。') }}
          </p>
          <p v-if="repairResult" class="form-result" :class="{ 'form-result--success': repairResult.fixed > 0 }">
            {{ repairResult.fixed > 0 
              ? t('repairSuccess', `已修复 ${repairResult.fixed}/${repairResult.total} 张卡片`) 
              : t('repairNoIssues', `检查完成，未发现问题（共 ${repairResult.total} 张卡片）`) 
            }}
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
  uiSettings?: { enableDebugLogs: boolean };  // 🆕 新增
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
  { key: 'riff', label: t('riffTab', 'Riff 集成'), icon: '#iconCloud' },  // 🆕 Riff 集成
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
  dayStartHour: number;  // 🆕 每日刷新时间
}

const settings = ref<Settings>({
  requestRetention: 0.9,
  maximumInterval: 365,
  enableShortTerm: true,
  params: [...DEFAULT_PARAMS],
  autoCardEnabled: false,
  dayStartHour: 4,  // 🆕 默认值：凌晨4点
});

// 🆕 UI 设置
const uiSettings = ref({
  enableDebugLogs: false,
});

// 🆕 调度器配置
const schedulerConfig = ref<SchedulerConfig>({
  defaultScheduler: 'fsrs-v5',
  // enableRiffSync 已废弃，使用 riffIntegration.mode 替代
  topicScheduler: 'a-factor-v2',
  itemScheduler: 'fsrs-v5',
});

// 🆕 Riff 集成配置
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

// 🆕 调度器说明
const schedulerDescriptions: Record<string, string> = {
  'fsrs-v5': '现代算法，准确预测遗忘曲线，自动优化参数',
  'riff': '思源笔记原生调度器，与系统深度集成',
  'sm2': '经典算法，简单稳定，广泛使用',
  'sm15': 'SuperMemo 15 算法，完整的遗忘曲线系统',
  'a-factor-v2': '改进的 A-Factor，动态调整难度',
  'a-factor': '固定难度因子，简单稳定',
};

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
      autoCardEnabled: props.incrementalSettings?.autoCardEnabled ?? false,
      dayStartHour: props.fsrsSettings.dayStartHour ?? 4,  // 🆕 加载 dayStartHour 配置
    };
  }
  
  // 🆕 加载 UI 设置
  if (props.uiSettings) {
    uiSettings.value = {
      enableDebugLogs: props.uiSettings.enableDebugLogs ?? false,
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

  // 🆕 加载调度器配置
  if (props.schedulerSettings) {
    schedulerConfig.value = {
      defaultScheduler: props.schedulerSettings.defaultScheduler || 'fsrs-v5',
      topicScheduler: props.schedulerSettings.topicScheduler || 'a-factor-v2',
      itemScheduler: props.schedulerSettings.itemScheduler || 'fsrs-v5',
    };
  }

  // 🆕 加载 Riff 集成配置
  if (props.riffIntegrationSettings) {
    riffIntegrationConfig.value = {
      useLocalScheduler: props.riffIntegrationSettings.useLocalScheduler ?? true,
      incrementalSync: {
        enabled: props.riffIntegrationSettings.incrementalSync?.enabled ?? true,
        triggers: props.riffIntegrationSettings.incrementalSync?.triggers || ['plugin-start', 'browser-open', 'review-open'],
        useBlacklist: props.riffIntegrationSettings.incrementalSync?.useBlacklist ?? true,
        autoDetectCardType: props.riffIntegrationSettings.incrementalSync?.autoDetectCardType ?? true,
      },
      fullSync: {
        enabled: props.riffIntegrationSettings.fullSync?.enabled ?? true,
        interval: props.riffIntegrationSettings.fullSync?.interval || 86400000,
        cleanupBlacklist: props.riffIntegrationSettings.fullSync?.cleanupBlacklist ?? true,
      },
      deleteSync: {
        enabled: props.riffIntegrationSettings.deleteSync?.enabled ?? true,
        useBlacklistFallback: props.riffIntegrationSettings.deleteSync?.useBlacklistFallback ?? true,
      },
    };

    // 更新触发器复选框状态
    const triggersList = riffIntegrationConfig.value.incrementalSync.triggers;
    triggers.value = {
      pluginStart: triggersList.includes('plugin-start'),
      browserOpen: triggersList.includes('browser-open'),
      reviewOpen: triggersList.includes('review-open'),
    };
  }
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

  // 🆕 从复选框状态构建 triggers 数组
  const triggersArray: Array<'plugin-start' | 'browser-open' | 'review-open'> = [];
  if (triggers.value.pluginStart) triggersArray.push('plugin-start');
  if (triggers.value.browserOpen) triggersArray.push('browser-open');
  if (triggers.value.reviewOpen) triggersArray.push('review-open');

  emit('save', {
    ...settings.value,
    queues,
    incremental: {
      autoCardEnabled: settings.value.autoCardEnabled
    },
    // 🆕 保存调度器配置
    scheduler: {
      defaultScheduler: schedulerConfig.value.defaultScheduler,
      topicScheduler: schedulerConfig.value.topicScheduler,
      itemScheduler: schedulerConfig.value.itemScheduler,
    },
    // 🆕 保存 UI 设置
    ui: {
      enableDebugLogs: uiSettings.value.enableDebugLogs,
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
    autoCardEnabled: false,
    dayStartHour: 4,  // 🆕 重置为默认值4
  };
}

// 🆕 重置调度器设置
function resetSchedulerSettings() {
  schedulerConfig.value = {
    defaultScheduler: 'fsrs-v5',
    topicScheduler: 'a-factor-v2',
    itemScheduler: 'fsrs-v5',
  };
}

// 🆕 处理调试日志开关变化
function handleDebugLogsChange() {
  // 立即应用日志设置
  if (typeof window !== 'undefined') {
    (window as any).FSRS_DISABLE_LOGS = !uiSettings.value.enableDebugLogs;
    
    // 提示用户
    const message = uiSettings.value.enableDebugLogs 
      ? '调试日志已启用，刷新页面后生效'
      : '调试日志已禁用，刷新页面后生效';
    
    console.log(`[SiyuanMemo] ${message}`);
    
    // 如果有 showMessage 方法，显示提示
    if (props.i18n) {
      // 可以在这里添加 toast 提示
    }
  }
}

// 🆕 dayStartHour 变更处理
function handleDayStartHourChange() {
  // 验证范围
  if (settings.value.dayStartHour < 0) {
    settings.value.dayStartHour = 0;
  } else if (settings.value.dayStartHour > 23) {
    settings.value.dayStartHour = 23;
  }
  
  console.log('[Settings] dayStartHour changed:', settings.value.dayStartHour);
}

// 🆕 快速设置 dayStartHour
function setDayStartHour(hour: number) {
  settings.value.dayStartHour = hour;
  handleDayStartHourChange();
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
    console.error('[SettingsPanel] Failed to repair dates:', err);
  } finally {
    isRepairing.value = false;
  }
}

// 🆕 参数优化相关
const isOptimizing = ref(false);
const optimizationProgress = ref(0);
const optimizationResult = ref<{ weights: number[]; duration: number; reviewCount: number } | null>(null);

async function handleOptimizeParameters() {
  if (isOptimizing.value || !props.optimizationHandlers?.optimize) return;
  
  isOptimizing.value = true;
  optimizationProgress.value = 0;
  optimizationResult.value = null;
  
  try {
    // 调用优化处理器
    const result = await props.optimizationHandlers.optimize({
      enableShortTerm: settings.value.enableShortTerm,
      progress: (current: number, total: number) => {
        optimizationProgress.value = Math.round((current / total) * 100);
      },
    });
    
    optimizationResult.value = result;
    optimizationProgress.value = 100;
  } catch (err) {
    console.error('[SettingsPanel] Failed to optimize parameters:', err);
    // 可以在这里显示错误提示
    alert(t('optimizationFailed', '参数优化失败：') + (err as Error).message);
  } finally {
    isOptimizing.value = false;
  }
}

function applyOptimizedParams() {
  if (!optimizationResult.value) return;
  
  // 应用优化后的参数
  settings.value.params = [...optimizationResult.value.weights];
  
  // 清除优化结果
  optimizationResult.value = null;
  optimizationProgress.value = 0;
  
  // 提示用户保存
  alert(t('paramsApplied', '优化参数已应用，请点击"保存设置"按钮保存更改。'));
}

function discardOptimizedParams() {
  optimizationResult.value = null;
  optimizationProgress.value = 0;
}

function formatWeights(weights: number[]): string {
  return weights.map(w => w.toFixed(4)).join(', ');
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
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

/* 🆕 参数优化样式 */
.optimization-progress {
  margin-top: 12px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--b3-theme-surface-lighter);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background: var(--b3-theme-primary);
  transition: width 0.3s ease;
}

.progress-text {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  text-align: center;
}

.optimization-result {
  margin-top: 12px;
  padding: 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
  border: 1px solid var(--b3-theme-primary-lighter);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.result-icon {
  font-size: 20px;
}

.result-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.result-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.result-stat {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.stat-label {
  color: var(--b3-theme-on-surface-light);
}

.stat-value {
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.result-params {
  margin-bottom: 12px;
}

.result-params label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.result-actions .btn-primary,
.result-actions .btn-secondary {
  flex: 1;
}
