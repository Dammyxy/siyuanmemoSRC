<template>
  <div class="settings-panel siyuanmemo-settings-theme">
    <!-- 设置导航 -->
    <div class="settings-shell">
      <aside class="settings-tabs">
        <div class="settings-tabs__group">
          <button
            v-for="tab in primaryTabs"
            :key="tab.key"
            type="button"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <svg><use :xlink:href="tab.icon"></use></svg>
            <span class="settings-tab__label">{{ tab.label }}</span>
          </button>
        </div>

        <div class="settings-tabs__group settings-tabs__group--secondary">
          <button
            v-for="tab in secondaryTabs"
            :key="tab.key"
            type="button"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <svg><use :xlink:href="tab.icon"></use></svg>
            <span class="settings-tab__label">{{ tab.label }}</span>
          </button>
        </div>
      </aside>

      <div class="settings-main">
        <nav
          class="settings-subtabs"
          role="tablist"
          :aria-label="activeTabLabel"
        >
          <button
            v-for="subTab in activeSubTabs"
            :key="`${activeTab}-${subTab.key}`"
            type="button"
            class="settings-subtab"
            :class="{ 'settings-subtab--active': activeSubTabKey === subTab.key }"
            :disabled="subTab.disabled"
            role="tab"
            :aria-selected="activeSubTabKey === subTab.key"
            @click="selectSubTab(subTab.key)"
          >
            {{ subTab.label }}
          </button>
        </nav>

        <div ref="settingsContentRef" class="settings-content">
          <div v-show="activeTab === 'learning'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('learning', 'fsrs')" class="settings-subtab-panel">
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

        <div class="form-item">
          <label>{{ t('modelParams', `模型参数 (${FSRS_WEIGHT_COUNT})`) }}</label>
          <div class="params-preview">
            <code>{{ paramsPreview }}</code>
          </div>
          <p class="form-hint">{{ t('modelParamsHint', '使用优化器可以根据你的复习数据自动优化这些参数') }}</p>
        </div>
        </div>

        <div v-show="isActiveSubTab('learning', 'scheduler')" class="settings-subtab-panel">
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

        <div class="form-item">
          <label>{{ t('srsV2LearningSteps', '学习步骤（分钟）') }}</label>
          <div class="form-control">
            <input
              type="text"
              :value="schedulerConfig.srsV2.learningStepsMinutes.join(', ')"
              @change="handleSrsV2LearningStepsChange"
            >
          </div>
          <p class="form-hint">{{ t('srsV2LearningStepsHint', '用逗号分隔，例如 1, 10。') }}</p>
        </div>

        <div class="form-item">
          <label>{{ t('srsV2RelearningSteps', '重学步骤（分钟）') }}</label>
          <div class="form-control">
            <input
              type="text"
              :value="schedulerConfig.srsV2.relearningStepsMinutes.join(', ')"
              @change="handleSrsV2RelearningStepsChange"
            >
          </div>
          <p class="form-hint">{{ t('srsV2RelearningStepsHint', '答错进入 Relearning 后使用，默认 10。') }}</p>
        </div>

        <div class="form-item">
          <label>{{ t('newCardsPerDay', '每日新卡上限') }}</label>
          <div class="form-control">
            <input type="number" min="0" max="9999" step="1" v-model.number="settings.newCardsPerDay">
            <span class="form-unit">{{ t('cardsUnit', '张') }}</span>
          </div>
          <p class="form-hint">{{ t('newCardsPerDayHint', '0 表示今天不引入新卡。') }}</p>
        </div>

        <div class="form-item">
          <label>{{ t('reviewsPerDay', '每日复习上限') }}</label>
          <div class="form-control">
            <input type="number" min="0" max="9999" step="1" v-model.number="settings.reviewsPerDay">
            <span class="form-unit">{{ t('cardsUnit', '张') }}</span>
          </div>
          <p class="form-hint">{{ t('reviewsPerDayHint', '0 表示不限制正式 Review 数量；Learning/Relearning 仍优先显示。') }}</p>
        </div>

        <div class="form-item">
          <label>{{ t('filteredReviewDefault', '未来卡筛选复习默认行为') }}</label>
          <div class="form-control">
            <select v-model="schedulerConfig.srsV2.filteredReviewDefault" class="scheduler-select">
              <option value="preview-only">{{ t('filteredPreviewOnly', '只预览，不重排') }}</option>
              <option value="reschedule">{{ t('filteredReschedule', '显式重排') }}</option>
            </select>
          </div>
          <p class="form-hint">{{ t('filteredReviewDefaultHint', '默认建议只预览；重排只在用户明确要改正式排期时使用。') }}</p>
        </div>
        </div>

        <div v-show="isActiveSubTab('learning', 'day-start')" class="settings-subtab-panel">
        <h3>{{ t('dayStartHour', '每日刷新时间') }}</h3>

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
        </div>
            </section>
          </div>

          <div v-show="activeTab === 'review'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('review', 'surface')" class="settings-subtab-panel">
        <h3>{{ t('reviewWindowSectionTitle', '复习与队列') }}</h3>

        <div class="form-item">
          <label>{{ t('reviewOpenInNewTabByDefault', '复习界面默认以新页签打开') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="uiSettings.reviewOpenInNewTabByDefault">
          </div>
          <p class="form-hint">
            {{ t('reviewOpenInNewTabByDefaultHint', '桌面端从全局复习入口启动时，默认在新页签中打开复习界面。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('reviewOpenFullscreenByDefault', '复习界面默认全屏打开') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="uiSettings.reviewOpenFullscreenByDefault">
          </div>
          <p class="form-hint">
            {{ t('reviewOpenFullscreenByDefaultHint', '只对桌面端对话框模式生效；若同时选择新页签打开，则此选项会被忽略。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('reviewSourceBlockRefreshEnabled', '实时刷新复习源块（高级）') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="uiSettings.reviewSourceBlockRefreshEnabled">
          </div>
          <p class="form-hint">
            {{ t('reviewSourceBlockRefreshEnabledHint', '默认关闭。开启后使用共享 transaction 监听，在当前卡片依赖块被其他编辑器修改时刷新复习正文；多个复习面共用一个 ws-main 监听。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('arenaEnabled', '启用 Arena 竞技场（实验）') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="arenaSettings.enabled">
          </div>
          <p class="form-hint">
            {{ t('arenaEnabledHint', '关闭后不运行 AI/SRS Arena 记录、复习建议或管理器入口；开启后才会写入 arena/store.json。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('arenaSrsWriteEnabled', '允许 Arena 写入正式排期（实验）') }}</label>
          <div class="form-control">
            <input
              type="checkbox"
              :checked="!arenaSettings.srs.advisoryOnly"
              @change="handleArenaSrsWriteEnabledChange"
            >
          </div>
          <p class="form-hint">
            {{ t('arenaSrsWriteEnabledHint', '默认关闭。开启后仍需达到样本阈值，才允许综合调度器进入写入路径。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('enableDebugLogs', '启用调试日志') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="uiSettings.enableDebugLogs">
          </div>
          <p class="form-hint">
            {{ t('enableDebugLogsHint', '在浏览器控制台显示详细的调试信息（开发用，关闭可提升性能）') }}
          </p>
        </div>
        </div>

        <div v-show="isActiveSubTab('review', 'automation')" class="settings-subtab-panel">
        <h3>{{ t('queueAutomationSectionTitle', '队列自动化') }}</h3>

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
        </div>

        <div v-show="isActiveSubTab('review', 'ordering')" class="settings-subtab-panel">
        <h3>{{ t('queueOrderingSectionTitle', '队列排序与插入') }}</h3>

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
        </div>
            </section>
          </div>

          <div v-show="activeTab === 'card'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('card', 'quick-card')" class="settings-subtab-panel">
        <h3>{{ t('quickCardTitle', '监听符号制卡') }}</h3>

        <div class="form-item">
          <label>{{ t('quickCardEnabled', '启用监听符号制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.enabled">
          </div>
          <p class="form-hint">
            {{ t('quickCardEnabledHint', '启用后，插件会监听块内容变化，自动检测符号并创建卡片。默认关闭，避免误触发。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('topicDerivationEnabled', '已有 Topic 内启用符号继续制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.topicDerivation.enabled">
          </div>
          <p class="form-hint">
            {{ t('topicDerivationEnabledHint', '只影响监听符号制卡链路；当当前块已经属于某个 Topic，或位于 Topic 子文档内时，继续输入符号制卡会沿用原 Topic 并在其下新增 Item。不会影响 ⌥⇧Z 手动创建 Item。') }}
          </p>
        </div>

        <p v-if="settings.quickCard.enabled" class="form-hint form-hint--section">
          ✅ {{ t('quickCardSymbolsInfo', '支持的符号类型') }}：&gt;&gt;, &lt;&lt;, &lt;&gt;, ::, ;;, &#123;&#123;&#125;&#125;, &gt;&gt;&gt;
        </p>

        <p v-if="settings.quickCard.enabled" class="form-hint form-hint--section">
          {{ t('quickCardFlashcardHint', '只影响 SiyuanMemo 对新卡的 Topic/Item 识别，不回写思源原生设置。') }}
        </p>

        <div v-if="settings.quickCard.enabled" class="form-item">
          <label>{{ t('quickCardFlashcardMarkLabel', '标记制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.flashcard.mark">
          </div>
          <p class="form-hint">
            {{ t('quickCardFlashcardMarkHint', '启用后支持标记制卡，标记的文本被识别为挖空填空') }}
          </p>
        </div>

        <div v-if="settings.quickCard.enabled" class="form-item">
          <label>{{ t('quickCardFlashcardListLabel', '列表块制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.flashcard.list">
          </div>
          <p class="form-hint">
            {{ t('quickCardFlashcardListHint', '启用后支持列表块制卡，列表的第一个列表项被识别为问题，子列表识别为答案') }}
          </p>
        </div>

        <div v-if="settings.quickCard.enabled" class="form-item">
          <label>{{ t('quickCardFlashcardHeadingLabel', '标题块制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.flashcard.heading">
          </div>
          <p class="form-hint">
            {{ t('quickCardFlashcardHeadingHint', '启用后支持标题块制卡，标题块被识别为问题，下方块识别为答案') }}
          </p>
        </div>

        <div v-if="settings.quickCard.enabled" class="form-item">
          <label>{{ t('quickCardFlashcardSuperBlockLabel', '超级块制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.flashcard.superBlock">
          </div>
          <p class="form-hint">
            {{ t('quickCardFlashcardSuperBlockHint', '启用后支持超级块制卡，超级块的第一个子块被识别为问题，其余子块识别为答案') }}
          </p>
        </div>
        </div>

            </section>
          </div>

          <div v-show="activeTab === 'capture-sync'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('capture-sync', 'entry')" class="settings-subtab-panel">
        <h3>{{ t('progressiveReadingSettingsTitle', '渐进阅读') }}</h3>

        <div class="form-item">
          <label>{{ t('progressiveAltXExcerptEnabled', '启用摘抄快捷键（默认 ⌥⇧X）') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.progressiveAltXExcerptEnabled">
          </div>
        </div>
        </div>

        <div v-show="isActiveSubTab('capture-sync', 'storage')" class="settings-subtab-panel">
        <h3>{{ t('progressiveStorageSectionTitle', '存放位置') }}</h3>

        <div class="form-item">
          <label>{{ t('progressiveStorageModeLabel', '摘录存放位置') }}</label>
          <div class="form-control">
            <select v-model="settings.progressiveStorage.mode" class="scheduler-select">
              <option value="source-child">{{ t('captureStorageModeSourceChild', '在原文档块目录下') }}</option>
              <option value="library">{{ t('captureStorageModeLibrary', '固定库') }}</option>
              <option value="daily-note">{{ t('captureStorageModeDailyNote', '今日日记') }}</option>
            </select>
          </div>
          <p class="form-hint">
            {{
              t(
                'progressiveStorageModeHint',
                '可选择跟随原文档创建摘录子文档、集中到固定库，或写进所选笔记本当天的 Daily Notes。'
              )
            }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('captureStorageNotebookLabel', '目标笔记本') }}</label>
          <div class="form-control">
            <select
              v-model="settings.progressiveStorage.notebookId"
              class="scheduler-select"
              :disabled="progressiveUsesSourceChildStorage"
            >
              <option value="">{{ t('captureStorageNotebookPlaceholder', '请选择笔记本') }}</option>
              <option
                v-for="notebook in captureStorageNotebookOptions"
                :key="`progressive-${notebook.id}`"
                :value="notebook.id"
              >
                {{ notebook.name }}
              </option>
            </select>
          </div>
          <p class="form-hint">
            {{
              progressiveUsesSourceChildStorage
                ? t('progressiveStorageNotebookIgnoredHint', '原文档模式会跟随来源文档创建摘录子文档，不使用固定目标笔记本。')
                : t('captureStorageNotebookHint', '这里是手动固定目标笔记本，不会自动跟随当前文档或来源文档切换。')
            }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('captureStorageTargetBlockIdLabel', '目标块 ID（可选）') }}</label>
          <div class="form-control">
            <input
              type="text"
              v-model="settings.progressiveStorage.targetBlockId"
              :disabled="!progressiveUsesLibraryStorage"
            >
          </div>
          <p class="form-hint">
            {{
              progressiveUsesLibraryStorage
                ? t('progressiveStorageTargetBlockHint', '固定库模式下可填写文档块 ID，摘录会创建到该文档树下；留空则自动使用 SiYuanMemo Topic 库。')
                : progressiveUsesSourceChildStorage
                  ? t('progressiveStorageTargetBlockIgnoredSourceChildHint', '原文档模式下不使用目标块 ID，摘录会直接创建到来源文档目录下。')
                  : t('progressiveStorageTargetBlockIgnoredHint', '今日日记模式下暂不使用目标块 ID，留空即可。')
            }}
          </p>
        </div>

        <h3>{{ t('topicDerivationTitle', 'Item 存放位置') }}</h3>

        <div class="form-item">
          <label>{{ t('topicDerivationStorageMode', 'Item 存放位置') }}</label>
          <div class="form-control">
            <select v-model="settings.quickCard.topicDerivation.storageMode" class="scheduler-select">
              <option value="workbench">{{ t('topicDerivationStorageWorkbench', '工作台文档（默认）') }}</option>
              <option value="source-child">{{ t('topicDerivationStorageSourceChild', '直接挂在源文档下') }}</option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('topicDerivationStorageModeHint', '作用于已有 Topic 内派生 Item，包括 ⌥⇧Z 创建 Item 与符号继续制卡；不影响普通摘录创建 Topic。工作台模式会把生成的 Item 集中收纳到源文档的“Topic 工作台”下；源文档模式则直接挂在当前 Topic 下。') }}
          </p>
        </div>
        </div>

        <div v-show="isActiveSubTab('capture-sync', 'conflict')" class="settings-subtab-panel">
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
        </div>
            </section>
          </div>

          <div v-show="activeTab === 'maintenance'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('maintenance', 'block-attrs')" class="settings-subtab-panel">
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
        </div>
            </section>
          </div>

          <div v-show="activeTab === 'neural'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('neural', 'history')" class="settings-subtab-panel">
        <h3>{{ t('neuralHistorySettingsTitle', '轨迹历史') }}</h3>
        <p class="form-hint form-hint--section">
          {{ t('neuralHistorySettingsIntro', '控制神经漫游跨重启保留的轨迹历史上限。更大的历史有助于回溯路径，但会增加持久化体积。') }}
        </p>

        <div class="form-item">
          <label>{{ t('neuralHistoryMaxEntries', '轨迹历史上限') }}</label>
          <div class="form-control">
            <input type="number" min="200" max="5000" step="100" v-model.number="queueSettings.neuralRoam!.history.maxEntries">
          </div>
          <p class="form-hint">
            {{ t('neuralHistoryMaxEntriesHint', '建议范围 200-5000。浏览器默认只渲染最近窗口，较大的历史不会直接把全部节点挂到 DOM。') }}
          </p>
        </div>
        </div>

        <div v-show="isActiveSubTab('neural', 'channels')" class="settings-subtab-panel">
        <h3>{{ t('hyperspaceSettingsTitle', 'Hyperspace / 超空间远征') }}</h3>
        <p class="form-hint form-hint--section">
          {{ t('neuralSettingsIntro', '当前可配置的是 Hyperspace Expedition / 超空间远征模式 的传播参数；Orbit / 轨道环绕模式 暂不提供独立设置项。') }}
        </p>

        <h4>{{ t('hyperspaceChannelsSection', '传播通道') }}</h4>

        <div class="form-item">
          <label>{{ t('hyperspaceEnableBlockTree', '启用块树传播') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="queueSettings.neuralRoam!.hyperspace.treeChannels.blockTree">
          </div>
          <p class="form-hint">
            {{ t('hyperspaceEnableBlockTreeHint', '允许通过块的父子与同级结构传播。默认关闭，避免把普通排版结构误当知识树。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceEnableDocumentTree', '启用文档树传播') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="queueSettings.neuralRoam!.hyperspace.treeChannels.documentTree">
          </div>
          <p class="form-hint">
            {{ t('hyperspaceEnableDocumentTreeHint', '允许通过文档父子与同级关系传播。默认关闭，适合明确把文档层级当知识树使用的库。') }}
          </p>
        </div>
        </div>

        <div v-show="isActiveSubTab('neural', 'range')" class="settings-subtab-panel">
        <h3>{{ t('hyperspaceSettingsTitle', 'Hyperspace / 超空间远征') }}</h3>
        <h4>{{ t('hyperspaceRangeSection', '扩散范围') }}</h4>

        <div class="form-item">
          <label>{{ t('hyperspaceMaxLayersPerRepetition', '每次复习扩层数') }}</label>
          <div class="form-control">
            <input type="number" min="1" max="5" step="1" v-model.number="queueSettings.neuralRoam!.hyperspace.maxLayersPerRepetition">
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceMaxTotalDepth', '最大传播深度') }}</label>
          <div class="form-control">
            <input type="number" min="1" max="16" step="1" v-model.number="queueSettings.neuralRoam!.hyperspace.maxTotalDepth">
          </div>
        </div>
        </div>

        <div v-show="isActiveSubTab('neural', 'weights')" class="settings-subtab-panel">
        <h3>{{ t('hyperspaceSettingsTitle', 'Hyperspace / 超空间远征') }}</h3>
        <h4>{{ t('hyperspaceWeightsSection', '传播权重') }}</h4>

        <div class="form-item">
          <label>{{ t('hyperspaceConceptLinkPriority', '概念链接权重') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.conceptLinkGroupPriority">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.conceptLinkGroupPriority.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceElementLinkPriority', '块链接权重') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.elementLinkGroupPriority">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.elementLinkGroupPriority.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceTreeChildPriority', '子节点传导权重') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.treeChildGroupPriority">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.treeChildGroupPriority.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceTreeParentPriority', '父节点传导权重') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.treeParentGroupPriority">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.treeParentGroupPriority.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceTreeSiblingPriority', '同级传导基础权重') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.treeSiblingBaseGroupPriority">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.treeSiblingBaseGroupPriority.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceSiblingDistancePenalty', '同级距离衰减') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="5" step="0.05" v-model.number="queueSettings.neuralRoam!.hyperspace.siblingDistancePenalty">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.siblingDistancePenalty.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceRootParentProbability', '文章根父节点导通概率') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.articleRootParentConductionProbability">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.articleRootParentConductionProbability.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceActivationCarryDecay', '激活携带衰减') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.activationCarryDecay">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.activationCarryDecay.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('hyperspaceRaceRandomness', '竞争随机性') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="1" step="0.01" v-model.number="queueSettings.neuralRoam!.hyperspace.raceRandomness">
            <span class="form-value">{{ queueSettings.neuralRoam!.hyperspace.raceRandomness.toFixed(2) }}</span>
          </div>
          <p class="form-hint">
            {{ t('hyperspaceRaceRandomnessHint', '值越大，前沿候选之间越容易出现轻微顺序波动；值越小，结果越稳定。') }}
          </p>
        </div>
        </div>
            </section>
          </div>

          <div v-show="activeTab === 'ai'" class="settings-section">
            <section class="settings-card">
        <div v-show="isActiveSubTab('ai', 'provider')" class="settings-subtab-panel">
        <h3>{{ t('aiSettingsTitle', 'AI 工作台') }}</h3>
        <p class="form-hint form-hint--section">
          {{ t('aiSettingsIntro', '统一配置 AI 理解与制卡面板使用的模型、API 与 Prompt。结构化结果默认停留在工作台，不会自动写回原文。') }}
        </p>

        <div class="form-item">
          <label>{{ t('aiEnabled', '启用 AI 功能') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="aiSettings.enabled">
          </div>
          <p class="form-hint">
            {{ t('aiEnabledHint', '关闭后入口仍保留，但执行前会提示先启用 AI。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('aiBaseUrl', 'Base URL') }}</label>
          <div class="form-control">
            <input type="text" v-model="aiSettings.baseUrl">
          </div>
          <p class="form-hint">
            {{ t('aiBaseUrlHint', '使用 OpenAI 兼容 Chat Completions 服务地址，例如 https://api.openai.com/v1。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('aiApiKey', 'API Key') }}</label>
          <div class="form-control">
            <input type="password" v-model="aiSettings.apiKey">
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiModel', '模型名') }}</label>
          <div class="form-control">
            <input type="text" v-model="aiSettings.model">
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiProviderProtocol', 'Provider 协议') }}</label>
          <div class="form-control">
            <select v-model="aiSettings.providers[0].protocol" class="scheduler-select">
              <option value="openai-compatible">OpenAI Compatible</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude Messages</option>
              <option value="gemini">Gemini GenerateContent</option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('aiProviderProtocolHint', '内部会按协议适配消息、工具调用和结构化输出；DeepSeek 等兼容服务可继续使用 OpenAI Compatible。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('aiTimeoutMs', '超时时间（毫秒）') }}</label>
          <div class="form-control">
            <input type="number" min="1000" max="300000" step="1000" v-model.number="aiSettings.timeoutMs">
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiTemperature', 'Temperature') }}</label>
          <div class="form-control">
            <input type="range" min="0" max="2" step="0.05" v-model.number="aiSettings.temperature">
            <span class="form-value">{{ aiSettings.temperature.toFixed(2) }}</span>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiDefaultOutputLanguage', '默认输出语言') }}</label>
          <div class="form-control">
            <input type="text" v-model="aiSettings.defaultOutputLanguage">
          </div>
        </div>
        </div>

        <div v-show="isActiveSubTab('ai', 'runtime')" class="settings-subtab-panel">
        <h4>{{ t('aiChatRuntimeSettings', '聊天与工具 Runtime') }}</h4>

        <div class="form-item">
          <label>{{ t('aiDefaultSkill', 'Standalone 默认 Skill') }}</label>
          <div class="form-control">
            <select v-model="aiSettings.chatDefaults.defaultSkillId" class="scheduler-select">
              <option value="general-chat">{{ t('generalChat', '通用 AI 聊天') }}</option>
              <option value="concept-coach">{{ t('conceptCoach', 'AI 理解与制卡') }}</option>
            </select>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiReviewDefaultSkill', 'Review 默认 Skill') }}</label>
          <div class="form-control">
            <select v-model="aiSettings.chatDefaults.reviewDefaultSkillId" class="scheduler-select">
              <option value="general-chat">{{ t('generalChat', '通用 AI 聊天') }}</option>
              <option value="concept-coach">{{ t('conceptCoach', 'AI 理解与制卡') }}</option>
            </select>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiMaxToolRounds', '最大工具轮数') }}</label>
          <div class="form-control">
            <input type="number" min="1" max="8" step="1" v-model.number="aiSettings.chatDefaults.maxToolRounds">
          </div>
          <p class="form-hint">
            {{ t('aiMaxToolRoundsHint', '避免模型无限循环调用工具；达到上限后会暂停并展示已有结果。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('aiToolManager', '工具默认启用与审批') }}</label>
          <section class="ai-settings-manager">
            <div class="ai-settings-manager__head">
              <div>
                <strong>{{ t('aiToolManagerSummaryTitle', '工具组管理器') }}</strong>
                <p class="form-hint form-hint--section">
                  {{ t('aiToolManagerHint', '组开关决定是否把整组工具注入模型；单工具开关控制默认可用性；审批策略可按工具覆盖。写入型工具即使启用，也会在运行时单独请求确认。') }}
                </p>
              </div>
              <button
                class="btn-small ai-settings-manager__action"
                type="button"
                @click="openToolPermissionManager()"
              >
                {{ t('aiManageToolPermissions', '管理工具执行权限') }}
              </button>
            </div>

            <div class="ai-tool-group-list">
              <article
                v-for="group in aiToolGroupsForSettings"
                :key="group.key"
                class="ai-tool-group-card"
              >
                <div class="ai-tool-group-card__head">
                  <label class="ai-tool-group-card__toggle">
                    <input type="checkbox" v-model="aiSettings.toolPolicies.groupDefaults[group.key]">
                    <div>
                      <strong>{{ group.title }}</strong>
                      <span>{{ group.description }}</span>
                    </div>
                  </label>

                  <div class="ai-tool-group-card__actions">
                    <div class="ai-tool-group-card__meta" :aria-label="t('aiToolGroupMetadata', '工具组状态')">
                      <span class="ai-meta-chip ai-meta-chip--count">{{ group.tools.length }} {{ t('tools', '工具') }}</span>
                      <span v-if="group.isWriteRisk" class="ai-meta-chip ai-meta-chip--warn">
                        {{ t('aiWriteRisk', '写入风险') }}
                      </span>
                      <span v-if="group.overrideCount > 0" class="ai-meta-chip ai-meta-chip--accent">
                        {{ t('aiToolOverridesCount', '{count} 个审批覆盖').replace('{count}', String(group.overrideCount)) }}
                      </span>
                    </div>
                    <button
                      class="btn-small ai-tool-group-card__manage"
                      type="button"
                      @click.stop="openToolPermissionManager(group.key)"
                    >
                      {{ t('aiManageToolPermissions', '管理工具执行权限') }}
                    </button>
                    <button
                      class="btn-small ai-tool-group-card__expand"
                      type="button"
                      @click="toggleAiToolGroupExpand(group.key)"
                    >
                      {{ isAiToolGroupExpanded(group.key)
                        ? t('aiCollapseGroup', '收起工具')
                        : t('aiExpandGroup', '展开工具') }}
                    </button>
                  </div>
                </div>

                <div v-if="isAiToolGroupExpanded(group.key)" class="ai-tool-group-card__body">
                  <article
                    v-for="tool in group.tools"
                    :key="tool.name"
                    class="ai-tool-row"
                  >
                    <label class="ai-tool-row__toggle">
                      <input
                        type="checkbox"
                        :checked="isAiToolEnabled(tool.name, tool.enabledByDefault)"
                        @change="setAiToolEnabled(tool.name, ($event.target as HTMLInputElement).checked)"
                      >
                      <div>
                        <strong>{{ tool.title }}</strong>
                        <span>{{ tool.description }}</span>
                      </div>
                    </label>

                    <div class="ai-tool-row__meta">
                      <code>{{ tool.name }}</code>
                      <span v-if="hasToolPermissionOverride(tool.name)" class="ai-meta-chip ai-meta-chip--accent">
                        {{ t('aiToolOverrideBadge', '已覆盖审批') }}
                      </span>
                    </div>
                  </article>
                </div>
              </article>
            </div>
          </section>
        </div>

        <div class="form-item">
          <label>{{ t('aiWebSearchBackend', '网页搜索后端') }}</label>
          <div class="form-control">
            <select v-model="aiSettings.webSearch.backend" class="scheduler-select">
              <option value="none">{{ t('disabled', '不启用') }}</option>
              <option value="tavily">Tavily</option>
              <option value="bocha">Bocha</option>
              <option value="google-cse">Google CSE</option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('aiWebSearchBackendHint', '未配置搜索后端时，只开放 URL 抓取 FetchWebPage，不伪装成可搜索网页。') }}
          </p>
        </div>

        <div v-if="aiSettings.webSearch.backend !== 'none'" class="form-item">
          <label>{{ t('aiWebSearchApiKey', '网页搜索 API Key') }}</label>
          <div class="form-control">
            <input type="password" v-model="aiSettings.webSearch.apiKey">
          </div>
        </div>

        <div v-if="aiSettings.webSearch.backend === 'google-cse'" class="form-item">
          <label>{{ t('aiGoogleCseId', 'Google CSE ID') }}</label>
          <div class="form-control">
            <input type="text" v-model="aiSettings.webSearch.googleCseId">
          </div>
        </div>
        </div>

        <div v-show="isActiveSubTab('ai', 'built-in-skill')" class="settings-subtab-panel">
        <h4>{{ t('aiPromptTemplates', 'Skill 管理') }}</h4>

        <div class="form-item">
          <label>{{ t('selfTestDefaultCreationMode', '自测卡片默认制卡模式') }}</label>
          <div class="form-control">
            <select v-model="aiSettings.conceptCoach.selfTest.defaultCreationMode" class="scheduler-select">
              <option v-for="mode in selfTestModeDescriptors" :key="mode.mode" :value="mode.mode">
                {{ mode.label }}
              </option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('selfTestDefaultCreationModeHint', '工作台切换模式后会记住到这里，并据此约束“自测卡片”tab 的结构化回复格式与制卡工具。') }}
          </p>
          <div class="form-example">
            <div class="example-label">{{ t('selfTestModeFormats', '各模式格式约定') }}</div>
            <div class="example-value">
              <ul class="ai-self-test-mode-list">
                <li v-for="mode in selfTestModeDescriptors" :key="mode.mode">
                  <strong>{{ mode.label }}</strong>
                  <span>{{ mode.summary }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="ai-prompt-card-list">
          <article
            v-for="preset in aiPromptPresetCards"
            :key="preset.settingKey"
            class="ai-prompt-preset-card ai-prompt-preset-card--compact"
          >
            <div class="ai-prompt-preset-card__head">
              <div>
                <div class="ai-prompt-preset-card__title-row">
                  <div class="ai-prompt-preset-card__title">{{ preset.title }}</div>
                  <span
                    class="ai-prompt-preset-card__status-badge"
                    :class="`ai-prompt-preset-card__status-badge--${preset.usageState}`"
                  >
                    {{ preset.usageLabel }}
                  </span>
                </div>
                <p class="ai-prompt-preset-card__summary">{{ preset.audience }}</p>
              </div>
              <div class="ai-prompt-preset-card__actions">
                <button class="btn-small" type="button" @click="resetAiPromptTemplate(preset.settingKey)">
                  {{ t('aiRestoreRecommendedPrompt', '恢复推荐模板') }}
                </button>
                <button
                  class="btn-small ai-prompt-preset-card__edit-action"
                  type="button"
                  @click="openBuiltInPromptEditor(preset.settingKey)"
                >
                  {{ t('aiEditPrompt', '编辑 Prompt') }}
                </button>
              </div>
            </div>

            <div class="ai-prompt-preset-card__grid">
              <div class="ai-prompt-preset-card__row ai-prompt-preset-card__row--status">
                <span>{{ t('aiPromptCurrentStatus', '当前状态') }}</span>
                <p class="ai-prompt-preset-card__status-hint">{{ preset.usageHint }}</p>
              </div>
              <div class="ai-prompt-preset-card__row">
                <span>{{ t('aiPromptBehavior', '默认行为') }}</span>
                <p>{{ preset.behavior }}</p>
              </div>
              <div class="ai-prompt-preset-card__row">
                <span>{{ t('aiPromptOutput', '输出特点') }}</span>
                <p>{{ preset.output }}</p>
              </div>
            </div>
          </article>
        </div>
        </div>

        <div v-show="isActiveSubTab('ai', 'user-skills')" class="settings-subtab-panel">
        <div class="ai-user-skill-toolbar">
          <div>
            <strong>{{ t('aiUserSkills', '用户自定义 Skill') }}</strong>
            <p class="form-hint form-hint--section">
              {{ t('aiUserSkillsHint', '第一版只支持声明式 Skill：Prompt、工具组、结构化 sections 和通用 renderer，不支持 JS/HTML/自定义写工具。') }}
            </p>
          </div>
          <div class="ai-user-skill-toolbar__actions">
            <button class="btn-small" type="button" @click="addUserSkill('chat')">
              {{ t('aiAddChatSkill', '新增聊天 Skill') }}
            </button>
            <button class="btn-small" type="button" @click="addUserSkill('structured')">
              {{ t('aiAddStructuredSkill', '新增结构化 Skill') }}
            </button>
          </div>
        </div>

        <div v-if="aiSettings.userSkills.length === 0" class="form-example">
          <div class="example-label">{{ t('aiNoUserSkills', '还没有用户 Skill') }}</div>
          <div class="example-value">
            {{ t('aiNoUserSkillsHint', '可以先加一个聊天 Skill 做专用助手，或加一个结构化 Skill 生成你自己的 section 结果。') }}
          </div>
        </div>

        <AiSettingsDraggableList
          v-if="aiSettings.userSkills.length > 0"
          :items="aiSettings.userSkills"
          @reorder="handleUserSkillReorder"
        >
          <template #item="{ item: skill, index: skillIndex, isDragOver }">
            <article
              class="ai-user-skill-card ai-user-skill-card--summary"
              :class="{ 'ai-user-skill-card--drag-over': isDragOver }"
            >
              <div class="ai-user-skill-card__head">
                <div>
                  <div class="ai-user-skill-card__title-row">
                    <strong>{{ skill.title || t('untitledSkill', '未命名 Skill') }}</strong>
                    <span class="ai-meta-chip ai-meta-chip--code">{{ skill.mode }}</span>
                    <span
                      class="ai-meta-chip"
                      :class="skill.enabled ? 'ai-meta-chip--accent' : 'ai-meta-chip--muted'"
                    >
                      {{ skill.enabled ? t('enabled', '启用') : t('disabled', '关闭') }}
                    </span>
                  </div>
                  <p class="form-hint form-hint--section">
                    {{ skill.brief || (skill.mode === 'structured'
                      ? t('structuredSkillHint', '按 section 返回结构化 JSON，并使用通用 renderer 展示。')
                      : t('chatSkillHint', '复用统一聊天 runtime，可调用已授权工具组。')) }}
                  </p>
                </div>
                <div class="ai-user-skill-card__actions">
                  <label class="ai-user-skill-card__toggle">
                    <input type="checkbox" v-model="skill.enabled">
                    <span>{{ t('enabled', '启用') }}</span>
                  </label>
                  <button class="btn-small" type="button" @click="openUserSkillEditor(skill, { index: skillIndex })">
                    {{ t('edit', '编辑') }}
                  </button>
                  <button class="btn-small" type="button" @click="duplicateUserSkill(skillIndex)">{{ t('duplicate', '复制') }}</button>
                  <button class="btn-small btn-danger" type="button" @click="removeUserSkill(skillIndex)">{{ t('delete', '删除') }}</button>
                </div>
              </div>

              <div class="ai-user-skill-card__meta">
                <span class="ai-meta-chip ai-meta-chip--code">{{ skill.id }}</span>
                <span class="ai-meta-chip">
                  {{ t('primaryAction', '主按钮文案') }}: {{ skill.primaryActionLabel || t('create', '创建') }}
                </span>
                <span class="ai-meta-chip">
                  {{ t('sections', 'Sections') }}: {{ skill.sections.length }}
                </span>
                <span v-if="skill.surfaceHints?.compactTitle" class="ai-meta-chip">
                  {{ skill.surfaceHints.compactTitle }}
                </span>
              </div>

              <div class="ai-user-skill-card__chips">
                <span
                  v-for="groupKey in skill.defaultToolGroups"
                  :key="`${skill.id}-${groupKey}`"
                  class="ai-meta-chip"
                >
                  {{ userSkillToolGroupLabelMap[groupKey] || groupKey }}
                </span>
              </div>
            </article>
          </template>
        </AiSettingsDraggableList>
        </div>
            </section>
          </div>

          <div v-show="activeTab === 'about'" class="settings-section about-section">
            <section class="settings-card guide-section">
          <div v-show="isActiveSubTab('about', 'about')" class="settings-subtab-panel">
          <h4>ℹ️ About</h4>
          <p class="about-info">
            Dedicated to the past, present, and future of the SiYuan and spaced repetition community.
          </p>
          </div>
            </section>
          </div>
        </div>

        <div v-if="showSettingsFooter" class="settings-footer">
          <div class="form-actions settings-footer__actions">
        <button class="btn-primary" @click="saveSettings">{{ t('saveSettings', '保存设置') }}</button>
        <button class="btn-secondary" @click="resetSettings">{{ t('resetDefault', '重置默认') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  AI_CHAT_TOOL_DESCRIPTORS,
  AI_CHAT_TOOL_GROUPS,
} from '@/application/services/AIChatToolRegistry';
import {
  type ArenaSettings,
} from '@/types/arena';
import {
  listSelfTestModeDescriptors,
} from '@/application/services/AIPromptContractRegistry';
import { getAIWorkbenchSkillTabs } from '@/application/services/AIWorkbenchSkillRegistry';
import {
  DEFAULT_SETTINGS,
  FSRS_WEIGHT_COUNT,
  type AISettings,
  type FSRSParameters,
  type QueueSettings,
  type SchedulerConfig,
  type QuickCardSettings,
  type UISettings,
} from '../../types';
import type {
  AIChatToolGroupKey,
} from '@/types/ai';
import { createLogger } from '@/utils/logger';
import AiSettingsDraggableList from '@/ui/settings/ai/AiSettingsDraggableList.vue';
import {
  DEFAULT_SETTINGS_SUBTAB_SELECTION,
  buildSettingsSubTabsByTab,
  buildSettingsTabs,
  ensureActiveSettingsSubTabSelection,
  isSettingsSubTabActive,
  normalizeSettingsTabKey,
  resolveSettingsNavigationViewModel,
  selectSettingsSubTab,
  type SettingsSubTabKey,
  type SettingsSubTabSelection,
  type SettingsTabKey,
} from './settingsPanelViewModel';
import {
  SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS,
  buildSettingsAIPromptPresetCards,
  buildSettingsAIUserSkillToolGroupLabelMap,
} from './settingsAIViewModel';
import {
  buildSettingsSavePayload,
  type SettingsFormState as Settings,
  type SettingsPanelSavePayload,
} from './settingsSavePayload';
import type {
  SettingsBlockAttrsCleanupMode as CleanupMode,
  SettingsBlockAttrsCleanupRunResult as CleanupRunResult,
  SettingsBlockAttrsCleanupScanResult as CleanupScanResult,
} from './settingsMaintenanceViewModel';
import {
  createDefaultAISettings,
  createDefaultArenaSettings,
  createDefaultQueueSettings,
  createDefaultSettingsFormState,
  createDefaultUISettings,
} from './settingsStateDefaults';
import {
  createDefaultSettingsRiffIntegrationState,
  createDefaultSettingsSchedulerConfig,
  resolveSettingsPanelLoadState,
} from './settingsLoadState';
import {
  buildSettingsCaptureStorageNotebookOptions,
  buildSettingsParamsPreview,
  buildSettingsTodayRangeText,
  isSettingsLibraryStorage,
  isSettingsSourceChildStorage,
} from './settingsFormViewModel';
import { useSettingsAIDialogs } from './settingsAIDialogs';
import { useSettingsMaintenanceCommands } from './settingsMaintenanceCommands';
import { useSettingsFormCommands } from './settingsFormCommands';

const logger = createLogger('SettingsPanel');

// Emits
const emit = defineEmits<{
  (e: 'save', settings: SettingsPanelSavePayload): void;
  (e: 'close'): void;
  (e: 'scan-block-attrs-cleanup', mode: CleanupMode, resolve?: (result: CleanupScanResult) => void, reject?: (error: Error) => void): void;
  (e: 'run-block-attrs-cleanup', mode: CleanupMode, resolve?: (result: CleanupRunResult) => void, reject?: (error: Error) => void): void;
}>();

const props = defineProps<{
  fsrsSettings?: FSRSParameters;
  queueSettings?: QueueSettings;
  newCardsPerDay?: number;
  reviewsPerDay?: number;
  priorityRandomness?: number;
  schedulerSettings?: SchedulerConfig;  // 🆕 新增
  riffIntegrationSettings?: Record<string, unknown>;  // 🆕 Riff 集成配置
  incrementalSettings?: { autoCardEnabled: boolean };
  quickCardSettings?: Partial<QuickCardSettings>;  // 🆕 快速制卡配置
  progressiveReadingSettings?: Partial<typeof DEFAULT_SETTINGS.progressiveReading>;
  aiSettings?: Partial<AISettings>;
  arenaSettings?: Partial<ArenaSettings>;
  uiSettings?: Partial<UISettings>;
  captureStorageNotebooks?: Array<{ id: string; name: string; icon?: string }>;
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

const activeTab = ref<SettingsTabKey>(normalizeSettingsTabKey(props.defaultTab));
const activeSubTabByTab = ref<SettingsSubTabSelection>({ ...DEFAULT_SETTINGS_SUBTAB_SELECTION });
const tabs = computed(() => buildSettingsTabs(t));
const subTabsByTab = computed(() => buildSettingsSubTabsByTab(t));
const navigationViewModel = computed(() => resolveSettingsNavigationViewModel({
  tabs: tabs.value,
  subTabsByTab: subTabsByTab.value,
  activeTab: activeTab.value,
  selectedSubTabs: activeSubTabByTab.value,
}));
const primaryTabs = computed(() => navigationViewModel.value.primaryTabs);
const secondaryTabs = computed(() => navigationViewModel.value.secondaryTabs);
const activeTabLabel = computed(() => navigationViewModel.value.activeTabLabel);
const activeSubTabs = computed(() => navigationViewModel.value.activeSubTabs);
const activeSubTabKey = computed(() => navigationViewModel.value.activeSubTabKey);
const showSettingsFooter = computed(() => navigationViewModel.value.showSettingsFooter);
const settingsContentRef = ref<HTMLElement | null>(null);

const queueSettings = ref<QueueSettings>(createDefaultQueueSettings());
const aiSettings = ref<AISettings>(createDefaultAISettings());
const arenaSettings = ref<ArenaSettings>(createDefaultArenaSettings());
const uiSettings = ref<UISettings>(createDefaultUISettings());
const aiPromptTabs = getAIWorkbenchSkillTabs('concept-coach');
const selfTestModeDescriptors = listSelfTestModeDescriptors();
const expandedAiToolGroups = ref<Record<string, boolean>>({});
const userSkillToolGroupOptions = SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS;
const userSkillToolGroupLabelMap = computed<Record<string, string>>(
  () => buildSettingsAIUserSkillToolGroupLabelMap(userSkillToolGroupOptions),
);
const aiToolGroupsForSettings = computed(() => AI_CHAT_TOOL_GROUPS.map((group) => {
  const tools = AI_CHAT_TOOL_DESCRIPTORS.filter((tool) => tool.group === group.key);
  const overrideCount = tools.filter((tool) => hasToolPermissionOverride(tool.name)).length;
  return {
    ...group,
    tools,
    overrideCount,
    isWriteRisk: group.key === 'siyuan-write' || group.key === 'flashcard-write',
  };
}));

function isAiToolEnabled(toolName: string, fallback: boolean): boolean {
  const override = aiSettings.value.toolPolicies.toolDefaults[toolName];
  return override !== false && (override === true || fallback);
}

function setAiToolEnabled(toolName: string, enabled: boolean): void {
  aiSettings.value.toolPolicies.toolDefaults = {
    ...aiSettings.value.toolPolicies.toolDefaults,
    [toolName]: enabled,
  };
}

function hasToolPermissionOverride(toolName: string): boolean {
  return Boolean(
    aiSettings.value.toolPolicies.executionPolicies[toolName]
    || aiSettings.value.toolPolicies.resultApprovalPolicies[toolName],
  );
}

function toggleAiToolGroupExpand(groupKey: AIChatToolGroupKey): void {
  expandedAiToolGroups.value = {
    ...expandedAiToolGroups.value,
    [groupKey]: !expandedAiToolGroups.value[groupKey],
  };
}

function isAiToolGroupExpanded(groupKey: AIChatToolGroupKey): boolean {
  return expandedAiToolGroups.value[groupKey] === true;
}

const aiPromptPresetCards = computed(() => buildSettingsAIPromptPresetCards({
  aiSettings: aiSettings.value,
  aiPromptTabs,
  t,
}));

const {
  openToolPermissionManager,
  openBuiltInPromptEditor,
  openUserSkillEditor,
  handleUserSkillReorder,
  resetAiPromptTemplate,
  addUserSkill,
  duplicateUserSkill,
  removeUserSkill,
  destroySettingsAIDialogs,
} = useSettingsAIDialogs({
  aiSettings,
  aiPromptTabs,
  aiPromptPresetCards,
  t,
  getI18n: () => props.i18n || {},
});

const settings = ref<Settings>(createDefaultSettingsFormState());

function ensureActiveSubTab(tabKey = activeTab.value): void {
  activeSubTabByTab.value = ensureActiveSettingsSubTabSelection({
    tab: tabKey,
    selectedSubTabs: activeSubTabByTab.value,
    subTabsByTab: subTabsByTab.value,
  });
}

async function scrollSettingsContentToTop(): Promise<void> {
  await nextTick();
  settingsContentRef.value?.scrollTo?.({ top: 0 });
}

function selectSubTab(subTabKey: SettingsSubTabKey): void {
  const nextSelection = selectSettingsSubTab({
    activeTab: activeTab.value,
    requestedSubTab: subTabKey,
    selectedSubTabs: activeSubTabByTab.value,
    subTabsByTab: subTabsByTab.value,
  });
  if (!nextSelection) {
    return;
  }

  activeSubTabByTab.value = nextSelection;
  void scrollSettingsContentToTop();
}

function isActiveSubTab(tabKey: SettingsTabKey, subTabKey: SettingsSubTabKey): boolean {
  return isSettingsSubTabActive({
    activeTab: activeTab.value,
    activeSubTabKey: activeSubTabKey.value,
    tab: tabKey,
    subTab: subTabKey,
  });
}

watch(activeTab, async () => {
  ensureActiveSubTab();
  await scrollSettingsContentToTop();
});

watch(() => props.defaultTab, (tab) => {
  activeTab.value = normalizeSettingsTabKey(tab);
});

const schedulerConfig = ref(createDefaultSettingsSchedulerConfig());

// 调度器说明
const schedulerDescriptions: Record<string, string> = {
  'fsrs-v6': '现代算法，准确预测遗忘曲线，推荐使用',
  'sm15': 'Arena Challenger 15，完整的遗忘曲线系统',
  'a-factor-v2': '改进的 A-Factor，动态调整难度',
};

// 🆕 Riff 集成配置
const riffIntegrationConfig = ref(createDefaultSettingsRiffIntegrationState());

// 🆕 触发器复选框状态（用于 UI 绑定）
const triggers = ref({
  pluginStart: true,
  browserOpen: false,
});

const {
  resetSettings,
  handleSrsV2LearningStepsChange,
  handleSrsV2RelearningStepsChange,
  handleArenaSrsWriteEnabledChange,
  handleDayStartHourChange,
  handleAddToOutstandingEveryNthChange,
  handleAutoPostponeSkipTopNChange,
  handlePriorityRandomnessChange,
  setDayStartHour,
} = useSettingsFormCommands({
  settings,
  queueSettings,
  schedulerConfig,
  aiSettings,
  arenaSettings,
  uiSettings,
  logger,
});

// 参数预览
const paramsPreview = computed(() => buildSettingsParamsPreview(settings.value.params));

// 🆕 计算"今天"范围的显示文本
const todayRangeText = computed(() => buildSettingsTodayRangeText(settings.value.dayStartHour));

const captureStorageNotebookOptions = computed(() => buildSettingsCaptureStorageNotebookOptions(
  props.captureStorageNotebooks,
));

const progressiveUsesSourceChildStorage = computed(() => isSettingsSourceChildStorage(settings.value.progressiveStorage.mode));
const progressiveUsesLibraryStorage = computed(() => isSettingsLibraryStorage(settings.value.progressiveStorage.mode));

const {
  blockAttrsCleanupMode,
  blockAttrsCleanupScanResult,
  blockAttrsCleanupRunResult,
  blockAttrsCleanupBusy,
  blockAttrsCleanupError,
  blockAttrsCleanupHasScan,
  blockAttrsCleanupAttrRows,
  handleScanBlockAttrsCleanup,
  handleRunBlockAttrsCleanup,
} = useSettingsMaintenanceCommands({
  t,
  scanBlockAttrsCleanup: (mode) => new Promise((resolve, reject) => {
    emit('scan-block-attrs-cleanup', mode, resolve, reject);
  }),
  runBlockAttrsCleanup: (mode) => new Promise((resolve, reject) => {
    emit('run-block-attrs-cleanup', mode, resolve, reject);
  }),
});

// 加载设置
function loadSettings() {
  // 🔍 调试日志：检查接收到的 quickCardSettings
  logger.debug('Loading settings with quickCardSettings', { quickCardSettings: props.quickCardSettings });
  const loadedState = resolveSettingsPanelLoadState({
    fsrsSettings: props.fsrsSettings,
    queueSettings: props.queueSettings,
    newCardsPerDay: props.newCardsPerDay,
    reviewsPerDay: props.reviewsPerDay,
    priorityRandomness: props.priorityRandomness,
    schedulerSettings: props.schedulerSettings,
    riffIntegrationSettings: props.riffIntegrationSettings,
    quickCardSettings: props.quickCardSettings,
    progressiveReadingSettings: props.progressiveReadingSettings,
    aiSettings: props.aiSettings,
    arenaSettings: props.arenaSettings,
    uiSettings: props.uiSettings,
    currentSettings: settings.value,
    currentQueueSettings: queueSettings.value,
    currentSchedulerConfig: schedulerConfig.value,
    currentRiffIntegrationConfig: riffIntegrationConfig.value,
  });

  settings.value = loadedState.settings;
  queueSettings.value = loadedState.queueSettings;
  schedulerConfig.value = loadedState.schedulerConfig;
  riffIntegrationConfig.value = loadedState.riffIntegrationConfig;
  triggers.value = loadedState.triggers;
  aiSettings.value = loadedState.aiSettings;
  arenaSettings.value = loadedState.arenaSettings;
  uiSettings.value = loadedState.uiSettings;

  logger.debug('Initialized settings.quickCard', { quickCard: settings.value.quickCard });
}

// 保存设置
function saveSettings() {
  const settingsToSave = buildSettingsSavePayload({
    settings: settings.value,
    queueSettings: queueSettings.value,
    schedulerConfig: schedulerConfig.value,
    riffIntegrationConfig: riffIntegrationConfig.value,
    triggers: triggers.value,
    aiSettings: aiSettings.value,
    arenaSettings: arenaSettings.value,
    uiSettings: uiSettings.value,
  });
  
  // 🔍 调试日志：检查 quickCard 配置
  logger.debug('Saving settings with quickCard', { quickCard: settingsToSave.quickCard });
  
  emit('save', settingsToSave);
}

onMounted(() => {
  loadSettings();
});

onBeforeUnmount(() => {
  destroySettingsAIDialogs();
});
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

.settings-shell {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-tabs {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 240px;
  padding: 20px 18px;
  border-right: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.settings-tabs__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-tabs__group--secondary {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid var(--b3-border-color);
}

.settings-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.settings-subtabs {
  display: flex;
  gap: 8px;
  min-height: 58px;
  padding: 12px 30px 0;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.settings-subtab {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.settings-subtab:hover:not(:disabled),
.settings-subtab:focus-visible {
  background: var(--b3-list-hover);
  color: var(--b3-theme-on-background);
  outline: none;
}

.settings-subtab:focus-visible {
  box-shadow: inset 0 0 0 2px var(--b3-theme-primary);
}

.settings-subtab--active {
  border-color: var(--b3-border-color);
  border-bottom-color: var(--b3-theme-surface);
  background: var(--b3-theme-surface);
  color: var(--b3-theme-primary);
}

.settings-subtab:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.settings-subtab-panel {
  display: block;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

.settings-tab:hover {
  background: var(--b3-list-hover);
}

.settings-tab--active {
  background: var(--b3-theme-primary);
  color: white;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
}

.settings-tab svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.settings-tab__label {
  flex: 1;
}

.settings-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 30px 32px;
}

.settings-footer {
  padding: 16px 30px 20px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.settings-footer__actions {
  justify-content: flex-end;
}

.settings-section {
  display: grid;
  gap: 20px;
}

.settings-card {
  padding: 24px 26px;
  border: 1px solid var(--b3-border-color);
  border-radius: 18px;
  background: var(--b3-theme-surface);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
}

.settings-card h3 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
}

.settings-card h4 {
  margin: 18px 0 10px 0;
  font-size: 16px;
  font-weight: 500;
}

.form-item {
  margin-bottom: 24px;
}

.form-item label {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 500;
}

.form-control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.form-control--stacked {
  align-items: stretch;
}

.form-control input[type="range"] {
  flex: 1;
  min-width: 180px;
  height: 6px;
  border-radius: 999px;
  background: var(--b3-border-color);
  outline: none;
  -webkit-appearance: none;
}

.form-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--b3-theme-primary);
  cursor: pointer;
}

.form-control input[type="number"] {
  width: 132px;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  font-size: 15px;
}

.form-control input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.form-value {
  min-width: 52px;
  font-size: 15px;
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.form-hint {
  margin: 8px 0 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--b3-theme-on-surface-light);
}

.form-hint--section {
  margin-bottom: 18px;
}

.params-preview {
  padding: 14px 16px;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  overflow-x: auto;
}

.params-preview code {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
  line-height: 1.8;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.btn-primary, .btn-secondary {
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
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
.form-control input[type="text"],
.form-control input[type="password"] {
  min-height: 42px;
  width: min(100%, 420px);
  padding: 10px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  font-size: 15px;
}

.form-textarea {
  width: 100%;
  min-height: 140px;
  padding: 12px 14px;
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  font-family: var(--b3-font-family-code, monospace);
}

.settings-foldout {
  display: grid;
  gap: 12px;
  padding: 12px 14px;
  border: 1px dashed var(--b3-border-color);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.settings-foldout summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.settings-foldout[open] {
  background: rgba(255, 255, 255, 0.88);
}

.ai-settings-manager,
.ai-prompt-card-list,
.ai-tool-group-list {
  display: grid;
  gap: 14px;
}

.ai-settings-manager {
  margin-top: 4px;
}

.ai-settings-manager__head,
.ai-user-skill-toolbar,
.ai-user-skill-card__head,
.ai-tool-group-card__head,
.ai-prompt-preset-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-settings-manager__action {
  flex-shrink: 0;
}

.ai-tool-group-card,
.ai-prompt-preset-card,
.ai-user-skill-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--b3-border-color);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(250, 250, 255, 0.98), rgba(245, 246, 252, 0.98));
}

.ai-tool-group-card__toggle,
.ai-tool-row__toggle {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.ai-tool-group-card__toggle strong,
.ai-tool-row__toggle strong,
.ai-prompt-preset-card__title,
.ai-user-skill-card__title-row strong {
  font-size: 15px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.ai-tool-group-card__toggle span,
.ai-tool-row__toggle span,
.ai-prompt-preset-card__summary {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

.ai-tool-group-card__actions,
.ai-prompt-preset-card__actions,
.ai-user-skill-toolbar__actions,
.ai-user-skill-card__actions,
.ai-user-skill-card__meta,
.ai-user-skill-card__chips,
.ai-tool-row__meta,
.ai-tool-group-card__meta,
.ai-prompt-preset-card__title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-tool-group-card__body,
.ai-prompt-preset-card__grid {
  display: grid;
  gap: 10px;
}

.ai-tool-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--b3-border-color);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
}

.ai-tool-row__meta {
  align-items: center;
  justify-content: flex-end;
}

.ai-tool-row__meta code,
.ai-meta-chip--code {
  font-family: var(--b3-font-family-code, monospace);
}

.ai-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid rgba(76, 110, 245, 0.14);
  border-radius: 999px;
  background: rgba(76, 110, 245, 0.08);
  color: var(--b3-theme-on-background);
  font-size: 12px;
  font-weight: 600;
}

.ai-meta-chip--accent {
  color: var(--b3-theme-primary);
  border-color: rgba(76, 110, 245, 0.2);
  background: rgba(76, 110, 245, 0.12);
}

.ai-meta-chip--warn {
  color: #9a4d00;
  border-color: rgba(255, 183, 77, 0.34);
  background: rgba(255, 183, 77, 0.2);
}

.ai-meta-chip--muted {
  color: var(--b3-theme-on-surface-light);
  border-color: rgba(127, 140, 141, 0.2);
  background: rgba(127, 140, 141, 0.12);
}

.ai-prompt-preset-card__row {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--b3-border-color);
}

.ai-prompt-preset-card__row span {
  font-size: 13px;
  font-weight: 600;
  color: var(--b3-theme-on-surface-light);
}

.ai-prompt-preset-card__row p,
.ai-prompt-preset-card__status-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.ai-prompt-preset-card__status-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
}

.ai-prompt-preset-card__status-badge--recommended {
  color: var(--b3-theme-primary);
  background: rgba(76, 110, 245, 0.1);
  border-color: rgba(76, 110, 245, 0.18);
}

.ai-prompt-preset-card__status-badge--custom {
  color: #a55d00;
  background: rgba(255, 183, 77, 0.18);
  border-color: rgba(255, 183, 77, 0.3);
}

.ai-prompt-preset-card__status-badge--empty {
  color: var(--b3-theme-on-surface-light);
  background: rgba(127, 140, 141, 0.12);
  border-color: rgba(127, 140, 141, 0.2);
}

.ai-user-skill-card--summary {
  margin-top: 0;
}

.ai-user-skill-card--drag-over {
  transform: translateY(-2px);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.08);
}

.ai-user-skill-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-user-skill-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  max-width: 360px;
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
  margin-top: 10px;
  padding: 12px 14px;
  background-color: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  font-size: 13px;
}

.example-label {
  color: var(--b3-theme-on-surface-light);
  margin-right: 8px;
}

.example-value {
  color: var(--b3-theme-primary);
  font-family: monospace;
  line-height: 1.7;
}

.form-quick-actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.quick-label {
  font-size: 13px;
  color: var(--b3-theme-on-surface-light);
}

.btn-small {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid var(--b3-theme-surface-lighter);
  border-radius: 999px;
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
  max-width: 880px;
}

.guide-section {
  margin-bottom: 32px;
}

.guide-section h4 {
  margin: 0 0 12px 0;
  font-size: 18px;
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
  padding: 0;
  line-height: 1.8;
  font-size: 15px;
  color: var(--b3-theme-on-surface-light);
}

.about-info strong {
  color: var(--b3-theme-on-background);
  font-size: 15px;
}

.ai-tool-manager {
  display: grid;
  gap: 14px;
}

.ai-tool-group {
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  padding: 14px;
  background: var(--b3-theme-surface);
}

.ai-tool-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ai-tool-group__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.ai-tool-group__count {
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.ai-tool-group__desc {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

.ai-tool-group__tools {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ai-tool-card {
  border: 1px solid var(--b3-border-color);
  border-radius: 7px;
  padding: 12px;
  background: var(--b3-theme-background);
}

.ai-tool-card__title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ai-tool-card__title strong {
  display: block;
  color: var(--b3-theme-on-background);
  font-size: 13px;
}

.ai-tool-card__title span {
  display: block;
  margin-top: 2px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.ai-tool-card__desc {
  margin: 10px 0 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.6;
}

.ai-tool-card__policies {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.ai-tool-card__policies label {
  display: grid;
  gap: 6px;
}

.ai-tool-card__policies span {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.ai-self-test-mode-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
}

.ai-self-test-mode-list li {
  display: grid;
  gap: 2px;
}

.ai-self-test-mode-list strong {
  color: var(--b3-theme-on-background);
  font-size: 13px;
}

.ai-self-test-mode-list span {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 980px) {
  .settings-tabs {
    width: 214px;
    padding: 18px 14px;
  }

  .settings-subtabs,
  .settings-content,
  .settings-footer {
    padding-left: 22px;
    padding-right: 22px;
  }

  .ai-settings-manager__head,
  .ai-tool-group-card__head,
  .ai-prompt-preset-card__head,
  .ai-user-skill-toolbar,
  .ai-user-skill-card__head {
    flex-direction: column;
  }
}

@media (max-width: 760px) {
  .settings-shell {
    flex-direction: column;
  }

  .settings-tabs {
    width: 100%;
    gap: 12px;
    padding: 16px 18px;
    border-right: none;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .settings-tabs__group {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .settings-tabs__group--secondary {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  .settings-tab {
    width: auto;
  }

  .settings-subtabs {
    min-height: 56px;
    padding: 10px 18px 0;
  }

  .settings-content {
    padding: 20px 18px 24px;
  }

  .settings-footer {
    padding: 14px 18px 18px;
  }

  .settings-card {
    padding: 20px;
  }

  .ai-tool-row,
  .ai-user-skill-card__actions {
    flex-direction: column;
    align-items: stretch;
  }
}

/* F-Misc style pass: flat settings manager, light rows, native-feeling density. */
.settings-shell {
  border: none;
  border-radius: 0;
  background: var(--b3-theme-background);
  box-shadow: none;
}

.settings-tabs {
  width: 248px;
  gap: 6px;
  padding: 16px 10px;
  background: var(--b3-theme-surface);
}

.settings-tab {
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 6px;
  color: var(--b3-theme-on-surface);
  font-size: 14px;
  font-weight: 400;
}

.settings-tab--active {
  border-color: var(--b3-border-color);
  background: var(--b3-list-hover);
  color: var(--b3-theme-primary);
  box-shadow: none;
}

.settings-subtabs {
  gap: 36px;
  min-height: 46px;
  padding: 0 42px;
  align-items: flex-end;
  background: var(--b3-theme-background);
}

.settings-subtab {
  min-height: 44px;
  padding: 0 2px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  font-size: 14px;
  font-weight: 400;
}

.settings-subtab--active {
  border-bottom-color: var(--b3-theme-primary);
  background: transparent;
}

.settings-content {
  padding: 22px 42px 32px;
  background: var(--b3-theme-background);
}

.settings-card {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.settings-card h3 {
  margin-bottom: 14px;
  color: var(--b3-theme-primary);
  font-size: 16px;
  font-weight: 700;
}

.settings-card h4 {
  margin: 22px 0 10px;
  padding-bottom: 7px;
  border-bottom: 1px dashed var(--b3-theme-primary);
  color: var(--b3-theme-primary);
  font-size: 16px;
  font-weight: 700;
}

.form-item {
  margin-bottom: 0;
  padding: 12px 0 16px;
  border-bottom: 1px solid var(--b3-border-color);
}

.form-item label {
  margin-bottom: 7px;
  font-size: 14px;
  font-weight: 500;
}

.form-hint {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.6;
}

.form-control select,
.form-control input[type="text"],
.form-control input[type="password"],
.form-control input[type="number"] {
  min-height: 34px;
  border-radius: 4px;
  background: var(--b3-theme-background);
  font-size: 14px;
}

.form-textarea {
  border-radius: 4px;
  background: var(--b3-theme-background);
}

.btn-primary,
.btn-secondary,
.btn-small {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  box-shadow: none;
  font-size: 13px;
}

.settings-footer {
  padding: 12px 42px;
  background: var(--b3-theme-background);
}

.settings-foldout {
  border-style: solid;
  border-radius: 4px;
  background: var(--b3-theme-surface);
}

.ai-settings-manager,
.ai-prompt-card-list,
.ai-tool-group-list {
  gap: 8px;
}

.ai-settings-manager__head {
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
}

.ai-settings-manager__head strong {
  color: var(--b3-theme-primary);
}

.ai-tool-group-card,
.ai-prompt-preset-card,
.ai-user-skill-card {
  gap: 0;
  padding: 0;
  border-radius: 4px;
  background: var(--b3-theme-background);
  box-shadow: none;
  overflow: hidden;
}

.ai-tool-group-card__head,
.ai-prompt-preset-card__head,
.ai-user-skill-card__head {
  align-items: center;
  padding: 10px 12px;
  background: var(--b3-theme-background);
}

.ai-tool-group-card__head:hover,
.ai-prompt-preset-card:hover,
.ai-user-skill-card:hover {
  background: var(--b3-theme-surface-light);
}

.ai-tool-group-card__toggle,
.ai-tool-row__toggle {
  align-items: center;
  gap: 8px;
}

.ai-tool-group-card__toggle strong,
.ai-tool-row__toggle strong,
.ai-prompt-preset-card__title,
.ai-user-skill-card__title-row strong {
  font-size: 14px;
}

.ai-tool-group-card__toggle span,
.ai-tool-row__toggle span,
.ai-prompt-preset-card__summary {
  margin-top: 2px;
  font-size: 12px;
}

.ai-tool-group-card__meta,
.ai-user-skill-card__meta,
.ai-user-skill-card__chips,
.ai-prompt-preset-card__title-row {
  gap: 6px;
}

.ai-tool-group-card__meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  padding: 0;
}

.ai-tool-group-card__actions {
  align-items: center;
  gap: 6px;
}

.ai-tool-group-card__body {
  gap: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface-lighter);
}

.ai-tool-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.36fr) minmax(0, 1fr);
  align-items: center;
  padding: 6px 0 6px 24px;
  border: none;
  border-radius: 0;
  background: transparent;
}

.ai-tool-row + .ai-tool-row {
  border-top: 1px solid var(--b3-border-color);
}

.ai-tool-row__meta {
  justify-content: flex-start;
}

.ai-meta-chip,
.ai-prompt-preset-card__status-badge {
  padding: 1px 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  font-size: 12px;
}

.ai-meta-chip--count {
  color: var(--b3-theme-on-surface-light);
}

.ai-prompt-preset-card {
  padding: 10px 14px 12px;
}

.ai-prompt-preset-card__grid {
  gap: 0;
  margin-top: 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  overflow: hidden;
}

.ai-prompt-preset-card__row {
  padding: 10px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
}

.ai-prompt-preset-card__row + .ai-prompt-preset-card__row {
  border-top: 1px solid var(--b3-border-color);
}

.ai-user-skill-card {
  padding: 8px 12px;
}

@media (max-width: 980px) {
  .settings-subtabs,
  .settings-content,
  .settings-footer {
    padding-left: 22px;
    padding-right: 22px;
  }
}

@media (max-width: 760px) {
  .settings-tabs {
    padding: 12px 14px;
  }

  .settings-subtabs {
    min-height: 46px;
    padding-top: 0;
  }

  .settings-card {
    padding: 0;
  }

  .ai-tool-row {
    grid-template-columns: 1fr;
  }
}
</style>
