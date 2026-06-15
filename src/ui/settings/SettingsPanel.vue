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
          <label>{{ t('srsV2LearnAheadWindow', '提前学习窗口（分钟）') }}</label>
          <div class="form-control">
            <input
              type="number"
              min="0"
              max="1440"
              step="1"
              v-model.number="schedulerConfig.srsV2.learnAhead.windowMinutes"
            >
            <span class="form-unit">{{ t('minutesUnit', '分钟') }}</span>
          </div>
          <p class="form-hint">{{ t('srsV2LearnAheadWindowHint', '普通队列清空后，允许显式提前学习这个窗口内的 Learning/Relearning 卡。') }}</p>
        </div>

        <div class="form-item">
          <label>{{ t('srsV2LearnAheadMaxCards', '提前学习最多卡数') }}</label>
          <div class="form-control">
            <input
              type="number"
              min="0"
              max="500"
              step="1"
              v-model.number="schedulerConfig.srsV2.learnAhead.maxCards"
            >
            <span class="form-unit">{{ t('cardsUnit', '张') }}</span>
          </div>
          <p class="form-hint">{{ t('srsV2LearnAheadMaxCardsHint', '提前学习同时受分钟窗口和最大卡数限制，0 表示不提供提前学习。') }}</p>
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

        <div class="form-item">
          <label>{{ t('progressiveSourceMarkingEnabled', '摘录后标记原文') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.progressiveSourceMarkingEnabled">
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

        <div v-show="isActiveSubTab('maintenance', 'kernel-companion')" class="settings-subtab-panel">
        <h3>{{ t('kernelCompanionTitle', '内核伴生') }}</h3>
        <p class="form-hint form-hint--section">
          {{ t('kernelCompanionIntro', '检查 SiYuanMemo 内核侧 kernel.js 是否已加载，并验证 JSON-RPC 握手。') }}
        </p>

        <div class="form-actions">
          <button
            class="btn-secondary"
            type="button"
            :disabled="kernelCompanionBusy"
            @click="refreshKernelCompanionStatus"
          >
            {{ kernelCompanionBusy ? t('kernelCompanionRefreshing', '刷新中...') : t('kernelCompanionRefresh', '刷新') }}
          </button>
        </div>

        <p v-if="kernelCompanionError" class="form-hint form-hint--warning">
          {{ kernelCompanionError }}
        </p>

        <div v-if="kernelCompanionStatus" class="form-example">
          <div class="example-label">
            {{ kernelCompanionStatus.kind === 'available' ? t('kernelCompanionAvailable', '可用') : t('kernelCompanionUnavailable', '不可用') }}
          </div>
          <div class="example-value">
            {{ kernelCompanionStatus.pluginName }}
            <span v-if="kernelCompanionStatus.pluginState"> | {{ t('kernelCompanionState', '状态') }}: {{ kernelCompanionStatus.pluginState }}</span>
          </div>
          <div v-if="kernelCompanionStatus.kind === 'available'" class="example-value" style="margin-top: 6px;">
            {{ t('kernelCompanionVersion', '版本') }}: {{ kernelCompanionStatus.version || '-' }}
            |
            {{ t('kernelCompanionPlatform', '平台') }}: {{ kernelCompanionStatus.platform || '-' }}
            |
            {{ t('kernelCompanionUptime', '运行时长') }}: {{ formatKernelCompanionUptime(kernelCompanionStatus.uptimeMs) }}
          </div>
          <div v-else class="example-value" style="margin-top: 6px;">
            {{ t('kernelCompanionReason', '原因') }}: {{ kernelCompanionStatus.message || kernelCompanionStatus.reason }}
          </div>
          <div class="example-value" style="margin-top: 6px;">
            {{ t('kernelCompanionMethods', 'RPC 方法') }}:
            <span v-if="kernelCompanionStatus.methods.length === 0">-</span>
            <code
              v-for="method in kernelCompanionStatus.methods"
              :key="method.name"
              style="margin-left: 6px;"
            >
              {{ method.name }}
            </code>
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
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import {
  type ArenaSettings,
} from '@/types/arena';
import {
  DEFAULT_SETTINGS,
  FSRS_WEIGHT_COUNT,
  type FSRSParameters,
  type QueueSettings,
  type SchedulerConfig,
  type QuickCardSettings,
  type UISettings,
} from '../../types';
import { createLogger } from '@/utils/logger';
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
import type { KernelCompanionStatus } from '@/application/ports/KernelCompanionPort';
import {
  type SettingsFormState as Settings,
  type SettingsPanelSavePayload,
} from './settingsSavePayload';
import type {
  SettingsBlockAttrsCleanupMode as CleanupMode,
  SettingsBlockAttrsCleanupRunResult as CleanupRunResult,
  SettingsBlockAttrsCleanupScanResult as CleanupScanResult,
} from './settingsMaintenanceViewModel';
import {
  createDefaultArenaSettings,
  createDefaultQueueSettings,
  createDefaultSettingsFormState,
  createDefaultUISettings,
} from './settingsStateDefaults';
import {
  createDefaultSettingsRiffIntegrationState,
  createDefaultSettingsSchedulerConfig,
} from './settingsLoadState';
import {
  buildSettingsCaptureStorageNotebookOptions,
  buildSettingsParamsPreview,
  buildSettingsTodayRangeText,
  isSettingsLibraryStorage,
  isSettingsSourceChildStorage,
} from './settingsFormViewModel';
import { useSettingsMaintenanceCommands } from './settingsMaintenanceCommands';
import { useSettingsFormCommands } from './settingsFormCommands';
import { useSettingsLoadSaveCommands } from './settingsLoadSaveCommands';

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
  kernelCompanionHandlers?: {
    refresh: () => Promise<KernelCompanionStatus>;
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
const arenaSettings = ref<ArenaSettings>(createDefaultArenaSettings());
const uiSettings = ref<UISettings>(createDefaultUISettings());
const settings = ref<Settings>(createDefaultSettingsFormState());
const kernelCompanionStatus = ref<KernelCompanionStatus | null>(null);
const kernelCompanionBusy = ref(false);
const kernelCompanionError = ref('');
let didAutoRefreshKernelCompanion = false;

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

function isKernelCompanionSubTabActive(): boolean {
  return isActiveSubTab('maintenance', 'kernel-companion');
}

function formatKernelCompanionUptime(uptimeMs?: number): string {
  if (typeof uptimeMs !== 'number' || !Number.isFinite(uptimeMs) || uptimeMs < 0) {
    return '-';
  }
  if (uptimeMs < 1000) {
    return `${Math.round(uptimeMs)}ms`;
  }
  return `${Math.round(uptimeMs / 1000)}s`;
}

async function refreshKernelCompanionStatus(): Promise<void> {
  if (kernelCompanionBusy.value) {
    return;
  }

  kernelCompanionBusy.value = true;
  kernelCompanionError.value = '';
  try {
    if (!props.kernelCompanionHandlers?.refresh) {
      kernelCompanionStatus.value = {
        kind: 'unavailable',
        checkedAt: Date.now(),
        pluginName: 'siyuan-plugin-siyuanmemo',
        methods: [],
        reason: 'not-loaded',
        message: t('kernelCompanionHandlerMissing', '当前前端未接入内核伴生状态查询。'),
      };
      return;
    }
    kernelCompanionStatus.value = await props.kernelCompanionHandlers.refresh();
  } catch (error) {
    kernelCompanionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    kernelCompanionBusy.value = false;
  }
}

async function maybeAutoRefreshKernelCompanionStatus(): Promise<void> {
  if (didAutoRefreshKernelCompanion || !isKernelCompanionSubTabActive()) {
    return;
  }
  didAutoRefreshKernelCompanion = true;
  await refreshKernelCompanionStatus();
}

watch(activeTab, async () => {
  ensureActiveSubTab();
  await scrollSettingsContentToTop();
  await maybeAutoRefreshKernelCompanionStatus();
});

watch(activeSubTabKey, async () => {
  await maybeAutoRefreshKernelCompanionStatus();
});

watch(() => props.defaultTab, (tab) => {
  activeTab.value = normalizeSettingsTabKey(tab);
});

const schedulerConfig = ref(createDefaultSettingsSchedulerConfig());

// 调度器说明
const schedulerDescriptions: Record<string, string> = {
  'fsrs-v6': '现代算法，准确预测遗忘曲线，推荐使用',
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

const {
  loadSettings,
  saveSettings,
} = useSettingsLoadSaveCommands({
  getSource: () => ({
    fsrsSettings: props.fsrsSettings,
    queueSettings: props.queueSettings,
    newCardsPerDay: props.newCardsPerDay,
    reviewsPerDay: props.reviewsPerDay,
    priorityRandomness: props.priorityRandomness,
    schedulerSettings: props.schedulerSettings,
    riffIntegrationSettings: props.riffIntegrationSettings,
    quickCardSettings: props.quickCardSettings,
    progressiveReadingSettings: props.progressiveReadingSettings,
    arenaSettings: props.arenaSettings,
    uiSettings: props.uiSettings,
  }),
  settings,
  queueSettings,
  schedulerConfig,
  riffIntegrationConfig,
  triggers,
  arenaSettings,
  uiSettings,
  save: (settingsToSave) => emit('save', settingsToSave),
  logger,
});

onMounted(() => {
  loadSettings();
});
</script>

<style scoped src="./SettingsPanel.css"></style>
