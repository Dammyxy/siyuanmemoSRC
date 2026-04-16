<template>
  <div class="settings-panel">
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

        <div v-show="isActiveSubTab('card', 'topic-derivation')" class="settings-subtab-panel">
        <h3 v-if="settings.quickCard.enabled">{{ t('topicDerivationTitle', 'Topic 下继续制卡') }}</h3>

        <div v-if="settings.quickCard.enabled" class="form-item">
          <label>{{ t('topicDerivationEnabled', '启用 Topic 下继续制卡') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="settings.quickCard.topicDerivation.enabled">
          </div>
          <p class="form-hint">
            {{ t('topicDerivationEnabledHint', '当当前块本身已经属于某个 Topic，或当前块位于 Topic 子文档内时，继续高亮或符号制卡会保留原 Topic，并在其下新增练习子文档和卡片。这不是摘录流程，而是沿用已有 Topic 继续制卡。') }}
          </p>
        </div>

        <div
          v-if="settings.quickCard.enabled && settings.quickCard.topicDerivation.enabled"
          class="form-item"
        >
          <label>{{ t('topicDerivationStorageMode', '继续制卡内容存放位置') }}</label>
          <div class="form-control">
            <select v-model="settings.quickCard.topicDerivation.storageMode" class="scheduler-select">
              <option value="workbench">{{ t('topicDerivationStorageWorkbench', '工作台文档（默认）') }}</option>
              <option value="source-child">{{ t('topicDerivationStorageSourceChild', '直接挂在源文档下') }}</option>
            </select>
          </div>
          <p class="form-hint">
            {{ t('topicDerivationStorageModeHint', '工作台模式会把继续制卡生成的内容集中收纳到源文档的“摘抄工作台”下；源文档模式则直接挂在当前 Topic 下。') }}
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
          <p class="form-hint">
            {{ t('progressiveAltXExcerptEnabledHint', '开启后插件会注册 ⌥⇧X 为摘抄命令；思源原生 Alt+X 仍用于最近外观，可在思源快捷键设置中修改插件命令。') }}
          </p>
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
                ? t('progressiveStorageTargetBlockHint', '固定库模式下可填写文档块 ID，摘录会创建到该文档树下；留空则自动使用 SiYuanMemo 摘录库。')
                : progressiveUsesSourceChildStorage
                  ? t('progressiveStorageTargetBlockIgnoredSourceChildHint', '原文档模式下不使用目标块 ID，摘录会直接创建到来源文档目录下。')
                  : t('progressiveStorageTargetBlockIgnoredHint', '今日日记模式下暂不使用目标块 ID，留空即可。')
            }}
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
          <label>{{ t('aiMaxToolRounds', '最大工具轮数') }}</label>
          <div class="form-control">
            <input type="number" min="1" max="8" step="1" v-model.number="aiSettings.chatDefaults.maxToolRounds">
          </div>
          <p class="form-hint">
            {{ t('aiMaxToolRoundsHint', '避免模型无限循环调用工具；达到上限后会暂停并展示已有结果。') }}
          </p>
        </div>

        <div class="form-item">
          <label>{{ t('aiEnableWriteTools', '启用写入意图工具') }}</label>
          <div class="form-control">
            <input type="checkbox" v-model="aiSettings.toolPolicies.groupDefaults['flashcard-write']">
          </div>
          <p class="form-hint">
            {{ t('aiEnableWriteToolsHint', '写入思源、制卡、摘录或 daily note 的工具始终逐次审批；关闭时不会注入模型。') }}
          </p>
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

        <div
          v-for="preset in aiPromptPresetCards"
          :key="preset.settingKey"
          class="ai-prompt-preset-card"
        >
          <div class="ai-prompt-preset-card__head">
            <div>
              <div class="ai-prompt-preset-card__title">{{ preset.title }}</div>
              <p class="ai-prompt-preset-card__summary">{{ preset.audience }}</p>
            </div>
            <button class="btn-small" type="button" @click="resetAiPromptTemplate(preset.settingKey)">
              {{ t('aiRestoreRecommendedPrompt', '恢复推荐模板') }}
            </button>
          </div>

          <div class="ai-prompt-preset-card__grid">
            <div class="ai-prompt-preset-card__row ai-prompt-preset-card__row--status">
              <span>{{ t('aiPromptCurrentStatus', '当前状态') }}</span>
              <p class="ai-prompt-preset-card__status-copy">
                <span
                  class="ai-prompt-preset-card__status-badge"
                  :class="`ai-prompt-preset-card__status-badge--${preset.usageState}`"
                >
                  {{ preset.usageLabel }}
                </span>
              </p>
              <p class="ai-prompt-preset-card__status-hint">{{ preset.usageHint }}</p>
            </div>
            <div class="ai-prompt-preset-card__row">
              <span>{{ t('aiPromptAudience', '适用对象') }}</span>
              <p>{{ preset.audience }}</p>
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

          <div class="ai-prompt-preset-card__editor">
            <label class="ai-prompt-preset-card__editor-label">
              {{ getPromptEditorLabel(preset.settingKey) }}
            </label>
            <p class="form-hint form-hint--section">{{ preset.usageHint }}</p>
            <label class="ai-prompt-preset-card__editor-label ai-prompt-preset-card__editor-label--sub">
              {{ t('aiBaseRunPrompt', 'Skill 基础 Prompt') }}
            </label>
            <p class="form-hint form-hint--section">
              {{ t('aiBehaviorPromptHint', '系统会自动附加结构化输出规则；这里主要描述角色、目标、语气和偏好。') }}
            </p>
            <textarea
              v-model="aiSettings.prompts.skills.conceptCoach.baseRun"
              :rows="8"
              class="form-textarea"
            ></textarea>
            <details class="ai-prompt-preset-card__contract">
              <summary>{{ t('aiPromptShowSystemContract', '查看系统自动附加的结构化规则') }}</summary>
              <p class="form-hint form-hint--section">{{ preset.systemContractSummary }}</p>
              <ul class="ai-prompt-preset-card__contract-list">
                <li v-for="line in preset.systemContractLines" :key="line">{{ line }}</li>
              </ul>
            </details>
            <div
              v-for="tab in aiPromptTabs"
              :key="tab.id"
              class="ai-prompt-preset-card__tab-editor"
            >
              <label class="ai-prompt-preset-card__editor-label ai-prompt-preset-card__editor-label--sub">
                {{ tab.title }} · {{ t('aiBehaviorPrompt', '行为 Prompt') }}
              </label>
              <textarea
                v-model="aiSettings.prompts.skills.conceptCoach.tabs[tab.id].run"
                :rows="5"
                class="form-textarea"
              ></textarea>
              <label class="ai-prompt-preset-card__editor-label ai-prompt-preset-card__editor-label--sub">
                {{ tab.title }} · {{ t('aiFollowUpPrompt', '追问 Prompt') }}
              </label>
              <textarea
                v-model="aiSettings.prompts.skills.conceptCoach.tabs[tab.id].followUp"
                :rows="4"
                class="form-textarea"
              ></textarea>
            </div>
          </div>
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

        <article
          v-for="(skill, skillIndex) in aiSettings.userSkills"
          :key="`${skill.id}-${skillIndex}`"
          class="ai-user-skill-card"
        >
          <div class="ai-user-skill-card__head">
            <div>
              <strong>{{ skill.title || t('untitledSkill', '未命名 Skill') }}</strong>
              <p class="form-hint form-hint--section">{{ skill.mode === 'structured' ? t('structuredSkillHint', '按 section 返回结构化 JSON，并使用通用 renderer 展示。') : t('chatSkillHint', '复用统一聊天 runtime，可调用已授权工具组。') }}</p>
            </div>
            <div class="ai-user-skill-card__actions">
              <label class="ai-user-skill-card__toggle">
                <input type="checkbox" v-model="skill.enabled">
                <span>{{ t('enabled', '启用') }}</span>
              </label>
              <button class="btn-small" type="button" @click="duplicateUserSkill(skillIndex)">{{ t('duplicate', '复制') }}</button>
              <button class="btn-small btn-danger" type="button" @click="removeUserSkill(skillIndex)">{{ t('delete', '删除') }}</button>
            </div>
          </div>

          <div class="form-item">
            <label>ID</label>
            <div class="form-control">
              <input type="text" v-model="skill.id">
            </div>
            <p class="form-hint">{{ t('aiSkillIdHint', '保存时会自动归一化成 user:&lt;slug&gt;，并避开内置 skill id。') }}</p>
          </div>

          <div class="form-item">
            <label>{{ t('title', '标题') }}</label>
            <div class="form-control">
              <input type="text" v-model="skill.title">
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('description', '简介') }}</label>
            <div class="form-control">
              <textarea v-model="skill.brief" rows="2" class="form-textarea"></textarea>
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('mode', '模式') }}</label>
            <div class="form-control">
              <select v-model="skill.mode" class="scheduler-select">
                <option value="chat">chat</option>
                <option value="structured">structured</option>
              </select>
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('aiBaseRunPrompt', 'Skill 基础 Prompt') }}</label>
            <div class="form-control">
              <textarea v-model="skill.systemPromptTemplate" rows="5" class="form-textarea"></textarea>
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('composerPlaceholder', '输入预设') }}</label>
            <div class="form-control">
              <textarea v-model="skill.composerPreset" rows="2" class="form-textarea"></textarea>
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('primaryAction', '主按钮文案') }}</label>
            <div class="form-control">
              <input type="text" v-model="skill.primaryActionLabel">
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('tools', '工具组') }}</label>
            <div class="ai-user-skill-tools">
              <label
                v-for="option in userSkillToolGroupOptions"
                :key="option.key"
                class="ai-user-skill-tools__option"
              >
                <input
                  type="checkbox"
                  :checked="skill.defaultToolGroups.includes(option.key)"
                  @change="($event) => {
                    const checked = ($event.target as HTMLInputElement).checked;
                    skill.defaultToolGroups = checked
                      ? Array.from(new Set([...skill.defaultToolGroups, option.key]))
                      : skill.defaultToolGroups.filter((entry) => entry !== option.key);
                  }"
                >
                <strong>{{ option.label }}</strong>
                <span>{{ option.hint }}</span>
              </label>
            </div>
          </div>

          <div class="form-item">
            <label>{{ t('surfaceHints', 'Surface 提示') }}</label>
            <div class="ai-user-skill-surface">
              <label>
                <span>{{ t('compactTitle', '紧凑标题') }}</span>
                <input type="text" v-model="skill.surfaceHints!.compactTitle">
              </label>
              <label>
                <span>{{ t('composerRows', '输入框行数') }}</span>
                <input type="number" min="2" max="10" step="1" v-model.number="skill.surfaceHints!.composerRows">
              </label>
              <label class="ai-user-skill-card__toggle">
                <input type="checkbox" v-model="skill.surfaceHints!.hideTabs">
                <span>{{ t('hideTabs', '隐藏 tabs') }}</span>
              </label>
            </div>
          </div>

          <div v-if="skill.mode === 'structured'" class="ai-user-skill-sections">
            <div class="ai-user-skill-sections__head">
              <strong>{{ t('sections', 'Sections') }}</strong>
              <button class="btn-small" type="button" @click="addUserSkillSection(skill)">{{ t('addSection', '新增 Section') }}</button>
            </div>
            <div
              v-for="(section, sectionIndex) in skill.sections"
              :key="`${section.id}-${sectionIndex}`"
              class="ai-user-skill-section-card"
            >
              <div class="ai-user-skill-section-card__head">
                <strong>{{ section.title || t('untitledSection', '未命名 Section') }}</strong>
                <button class="btn-small btn-danger" type="button" @click="removeUserSkillSection(skill, sectionIndex)">{{ t('delete', '删除') }}</button>
              </div>
              <div class="form-item">
                <label>ID</label>
                <div class="form-control">
                  <input type="text" v-model="section.id">
                </div>
              </div>
              <div class="form-item">
                <label>{{ t('title', '标题') }}</label>
                <div class="form-control">
                  <input type="text" v-model="section.title">
                </div>
              </div>
              <div class="form-item">
                <label>{{ t('responseKey', '响应 key') }}</label>
                <div class="form-control">
                  <input type="text" v-model="section.responseKey">
                </div>
              </div>
              <div class="form-item">
                <label>{{ t('renderer', 'Renderer') }}</label>
                <div class="form-control">
                  <select v-model="section.renderer" class="scheduler-select">
                    <option v-for="option in userSkillRendererOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                  </select>
                </div>
              </div>
              <div class="form-item">
                <label>{{ t('emptyHint', '空态提示') }}</label>
                <div class="form-control">
                  <input type="text" v-model="section.emptyHint">
                </div>
              </div>
              <div class="form-item">
                <label>{{ t('aiBehaviorPrompt', '行为 Prompt') }}</label>
                <div class="form-control">
                  <textarea v-model="section.runPrompt" rows="3" class="form-textarea"></textarea>
                </div>
              </div>
              <div class="form-item">
                <label>{{ t('aiFollowUpPrompt', '追问 Prompt') }}</label>
                <div class="form-control">
                  <textarea v-model="section.followUpPrompt" rows="3" class="form-textarea"></textarea>
                </div>
              </div>
              <label class="ai-user-skill-card__toggle">
                <input type="checkbox" v-model="section.required">
                <span>{{ t('required', '必填 section') }}</span>
              </label>
            </div>
          </div>
        </article>
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
  AI_PROMPT_PRESET_DESCRIPTORS,
  getRecommendedPromptTemplateForSetting,
  type AIPromptSettingKey,
} from '@/application/services/AIPromptComposer';
import { getPromptContractForSetting } from '@/application/services/AIPromptContractRegistry';
import { getAIWorkbenchSkillTabs } from '@/application/services/AIWorkbenchSkillRegistry';
import {
  ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  normalizeConfiguredCaptureStorageSettings as normalizeCaptureStorageSettings,
  normalizeAISettings,
  normalizeAIUserSkills,
  normalizeAIPromptContractVersion,
  normalizeAIPromptTemplates,
  type ConfiguredCaptureStorageSettings,
  DEFAULT_AI_SETTINGS,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_SETTINGS,
  FSRS_WEIGHT_COUNT,
  type AIConceptCoachPromptTemplates,
  type AISettings,
  type FilterGroupDefinition,
  type FSRSParameters,
  type QueueSettings,
  type SchedulerConfig,
  type QuickCardSettings,
  type UISettings,
} from '../../types';
import type { AIChatToolGroupKey, AIUserSkillDefinition, AIUserSkillSectionDefinition } from '@/types/ai';
import { getTodayRange, formatTodayRange } from '../../utils/dateUtils';  // 🆕 导入日期工具
import { createLogger } from '@/utils/logger';

type OptimizationConfig = Record<string, unknown>;
type ConflictResolutionStrategy = 'merge' | 'prefer-local' | 'prefer-remote';
type CleanupMode = 'safe' | 'full';
type AIPromptUsageState = 'recommended' | 'custom' | 'empty';
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

type UserSkillMode = 'chat' | 'structured';

const logger = createLogger('SettingsPanel');

const DEFAULT_PARAMS = [...DEFAULT_FSRS_WEIGHTS];

function createDefaultQuickCardSettings(): QuickCardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS.quickCard)) as QuickCardSettings;
}

function mergeQuickCardSettings(source?: Partial<QuickCardSettings>): QuickCardSettings {
  const defaults = createDefaultQuickCardSettings();
  return {
    ...defaults,
    ...(source || {}),
    flashcard: {
      ...defaults.flashcard,
      ...(source?.flashcard || {}),
    },
    enabledSymbols: {
      ...defaults.enabledSymbols,
      ...(source?.enabledSymbols || {}),
    },
    debounceDelay: {
      ...defaults.debounceDelay,
      ...(source?.debounceDelay || {}),
    },
    topicDerivation: {
      ...defaults.topicDerivation,
      ...(source?.topicDerivation || {}),
    },
    descriptorUseXiuyuan: source?.descriptorUseXiuyuan ?? defaults.descriptorUseXiuyuan,
    flashcardSeededFromSiyuan: source?.flashcardSeededFromSiyuan ?? defaults.flashcardSeededFromSiyuan,
  };
}

function createDefaultQueueSettings(): QueueSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS.queues)) as QueueSettings;
}

function createDefaultAISettings(): AISettings {
  return JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS)) as AISettings;
}

function createDefaultUISettings(): UISettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS.ui)) as UISettings;
}

function mergeUISettings(source?: Partial<UISettings>): UISettings {
  const defaults = createDefaultUISettings();
  return {
    ...defaults,
    ...(source || {}),
  };
}

function createDefaultConfiguredCaptureStorageSettings(
  source?: Partial<ConfiguredCaptureStorageSettings>,
): ConfiguredCaptureStorageSettings {
  return normalizeCaptureStorageSettings(source, {
    allowSourceChild: true,
    fallback: DEFAULT_SETTINGS.progressiveReading.storage,
  });
}

function mergeConfiguredCaptureStorageSettings(
  source: Partial<ConfiguredCaptureStorageSettings> | undefined,
  defaults: ConfiguredCaptureStorageSettings,
): ConfiguredCaptureStorageSettings {
  return normalizeCaptureStorageSettings(source, {
    allowSourceChild: true,
    fallback: defaults,
  });
}

function mergeAISettings(source?: Partial<AISettings>): AISettings {
  const legacyAwareSource = (source || {}) as Partial<AISettings> & {
    promptProfiles?: unknown;
    draftStorage?: unknown;
  };
  const {
    promptProfiles: _legacyPromptProfiles,
    draftStorage: _legacyDraftStorage,
    ...sourceWithoutLegacy
  } = legacyAwareSource;
  return normalizeAISettings({
    ...sourceWithoutLegacy,
    promptContractVersion: normalizeAIPromptContractVersion(sourceWithoutLegacy.promptContractVersion)
      || ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  });
}

function resetAiPromptToRecommended(settingsState: AISettings, settingKey: AIPromptSettingKey): void {
  settingsState.prompts.skills.conceptCoach = getRecommendedPromptTemplateForSetting(settingKey);
}

function mergeQueueSettings(source?: Partial<QueueSettings>): QueueSettings {
  const defaults = createDefaultQueueSettings();
  return {
    ...defaults,
    ...(source || {}),
    neuralWandering: {
      ...defaults.neuralWandering,
      ...(source?.neuralWandering || {}),
      weights: {
        ...defaults.neuralWandering.weights,
        ...(source?.neuralWandering?.weights || {}),
      },
    },
    neuralRoam: {
      ...defaults.neuralRoam,
      ...(source?.neuralRoam || {}),
      history: {
        ...defaults.neuralRoam?.history,
        ...(source?.neuralRoam?.history || {}),
      },
      hyperspace: {
        ...defaults.neuralRoam?.hyperspace,
        ...(source?.neuralRoam?.hyperspace || {}),
        treeChannels: {
          ...defaults.neuralRoam?.hyperspace.treeChannels,
          ...(source?.neuralRoam?.hyperspace?.treeChannels || {}),
        },
      },
    },
    filterGroup: {
      ...defaults.filterGroup,
      ...(source?.filterGroup || {}),
    },
  };
}

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
  progressiveReadingSettings?: Partial<typeof DEFAULT_SETTINGS.progressiveReading>;
  aiSettings?: Partial<AISettings>;
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
  optimizationHandlers?: {  // 🆕 参数优化处理器
    optimize: (config: OptimizationConfig) => Promise<OptimizationConfig>;
  };
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

type SettingsTabKey = 'learning' | 'review' | 'card' | 'capture-sync' | 'neural' | 'ai' | 'maintenance' | 'about';
type SettingsSubTabKey = string;

interface SettingsSubTabDefinition {
  key: SettingsSubTabKey;
  label: string;
  disabled?: boolean;
}

function normalizeSettingsTabKey(tab?: string): SettingsTabKey {
  switch (tab) {
  case 'learning':
  case 'review':
  case 'card':
  case 'capture-sync':
  case 'neural':
  case 'ai':
  case 'maintenance':
  case 'about':
    return tab;
  case 'fsrs':
  case 'general':
  case 'params':
  case 'study':
  default:
    return 'learning';
  }
}

const tabs = computed<Array<{ key: SettingsTabKey; label: string; icon: string; section: 'primary' | 'secondary' }>>(() => [
  { key: 'learning', label: t('settingsStudyTab', '学习与调度'), icon: '#iconSettings', section: 'primary' },
  { key: 'review', label: t('settingsReviewQueueTab', '复习与队列'), icon: '#iconSettings', section: 'primary' },
  { key: 'card', label: t('settingsCardTab', '制卡'), icon: '#iconSettings', section: 'primary' },
  { key: 'capture-sync', label: t('settingsCaptureSyncTab', '摘录与同步'), icon: '#iconSettings', section: 'primary' },
  { key: 'neural', label: t('settingsNeuralTab', '神经漫游'), icon: '#iconSettings', section: 'primary' },
  { key: 'ai', label: t('settingsAiTab', 'AI 工作台'), icon: '#iconSparkles', section: 'primary' },
  { key: 'maintenance', label: t('settingsMaintenanceTab', '维护'), icon: '#iconSettings', section: 'secondary' },
  { key: 'about', label: t('settingsAboutTab', '关于'), icon: '#iconInfo', section: 'secondary' },
]);

const activeTab = ref<SettingsTabKey>(normalizeSettingsTabKey(props.defaultTab));
const activeSubTabByTab = ref<Record<SettingsTabKey, SettingsSubTabKey>>({
  learning: 'fsrs',
  review: 'surface',
  card: 'quick-card',
  'capture-sync': 'entry',
  neural: 'history',
  ai: 'provider',
  maintenance: 'block-attrs',
  about: 'about',
});
const primaryTabs = computed(() => tabs.value.filter((tab) => tab.section === 'primary'));
const secondaryTabs = computed(() => tabs.value.filter((tab) => tab.section === 'secondary'));
const showSettingsFooter = computed(() => activeTab.value !== 'maintenance' && activeTab.value !== 'about');
const settingsContentRef = ref<HTMLElement | null>(null);

const queueSettings = ref<QueueSettings>(createDefaultQueueSettings());
const aiSettings = ref<AISettings>(createDefaultAISettings());
const uiSettings = ref<UISettings>(createDefaultUISettings());
const aiPromptTabs = getAIWorkbenchSkillTabs('concept-coach');
const userSkillToolGroupOptions: Array<{ key: AIChatToolGroupKey; label: string; hint: string }> = [
  { key: 'context-read', label: 'context-read', hint: '读取当前卡片、选中块和手工材料。' },
  { key: 'siyuan-read', label: 'siyuan-read', hint: '检索和读取思源块内容。' },
  { key: 'review-read', label: 'review-read', hint: '读取复习状态和当前队列。' },
  { key: 'web', label: 'web', hint: '抓取网页或调用搜索后端。' },
  { key: 'vars', label: 'vars', hint: '读写会话内变量缓存。' },
  { key: 'flashcard-write', label: 'flashcard-write', hint: '写工具始终逐次审批。' },
];
const userSkillRendererOptions: Array<{ key: AIUserSkillSectionDefinition['renderer']; label: string }> = [
  { key: 'markdown', label: 'Markdown' },
  { key: 'list', label: 'List' },
  { key: 'cards', label: 'Cards' },
  { key: 'keyValue', label: 'Key / Value' },
];

function isConceptCoachPromptEmpty(template: AIConceptCoachPromptTemplates): boolean {
  return String(template.baseRun || '').trim().length === 0
    && aiPromptTabs.every((tab) => {
      const pair = template.tabs[tab.id];
      return String(pair.run || '').trim().length === 0 && String(pair.followUp || '').trim().length === 0;
    });
}

function areConceptCoachPromptsEqual(left: AIConceptCoachPromptTemplates, right: AIConceptCoachPromptTemplates): boolean {
  return String(left.baseRun || '').trim() === String(right.baseRun || '').trim()
    && aiPromptTabs.every((tab) => {
      const leftPair = left.tabs[tab.id];
      const rightPair = right.tabs[tab.id];
      return String(leftPair.run || '').trim() === String(rightPair.run || '').trim()
        && String(leftPair.followUp || '').trim() === String(rightPair.followUp || '').trim();
    });
}

function resolveAiPromptUsageState(settingKey: AIPromptSettingKey): AIPromptUsageState {
  const currentValue = aiSettings.value.prompts.skills.conceptCoach;
  if (isConceptCoachPromptEmpty(currentValue)) {
    return 'empty';
  }

  return areConceptCoachPromptsEqual(currentValue, getRecommendedPromptTemplateForSetting(settingKey))
    ? 'recommended'
    : 'custom';
}

function getAiPromptUsageCopy(settingKey: AIPromptSettingKey): {
  usageState: AIPromptUsageState;
  usageLabel: string;
  usageHint: string;
} {
  const usageState = resolveAiPromptUsageState(settingKey);
  switch (usageState) {
    case 'custom':
      return {
        usageState,
        usageLabel: t('aiPromptStatusCustom', '当前使用自定义覆盖'),
        usageHint: t('aiPromptStatusCustomHint', '下面显示的是你当前保存或正在编辑的行为 Prompt 和追问 Prompt；结构化规则会由系统自动附加。'),
      };
    case 'empty':
      return {
        usageState,
        usageLabel: t('aiPromptStatusEmpty', '当前编辑区为空'),
        usageHint: t('aiPromptStatusEmptyHint', '当前这组 Prompt 为空；你可以直接填写，或点击恢复推荐模板。'),
      };
    case 'recommended':
    default:
      return {
        usageState: 'recommended',
        usageLabel: t('aiPromptStatusRecommended', '当前使用推荐模板'),
        usageHint: t('aiPromptStatusRecommendedHint', '下面显示的是当前内置推荐的行为 Prompt 和追问 Prompt；结构化规则会由系统自动附加。'),
      };
  }
}

const aiPromptPresetCards = computed(() => AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => ({
  ...descriptor,
  title: t(descriptor.titleKey, descriptor.titleFallback),
  audience: t(descriptor.audienceKey, descriptor.audienceFallback),
  behavior: t(descriptor.behaviorKey, descriptor.behaviorFallback),
  output: t(descriptor.outputKey, descriptor.outputFallback),
  systemContractSummary: getPromptContractForSetting(descriptor.settingKey).summary,
  systemContractLines: getPromptContractForSetting(descriptor.settingKey).runtimeLines,
  ...getAiPromptUsageCopy(descriptor.settingKey),
})));

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
  progressiveAltXExcerptEnabled: boolean;
  progressiveStorage: ConfiguredCaptureStorageSettings;
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
  quickCard: createDefaultQuickCardSettings(),
  progressiveAltXExcerptEnabled: false,
  progressiveStorage: createDefaultConfiguredCaptureStorageSettings(DEFAULT_SETTINGS.progressiveReading.storage),
});

const subTabsByTab = computed<Record<SettingsTabKey, SettingsSubTabDefinition[]>>(() => ({
  learning: [
    { key: 'fsrs', label: t('settingsSubtabFsrsParams', 'FSRS 参数') },
    { key: 'scheduler', label: t('settingsSubtabScheduler', '调度器') },
    { key: 'day-start', label: t('settingsSubtabDayStart', '每日刷新') },
  ],
  review: [
    { key: 'surface', label: t('settingsSubtabReviewSurface', '复习界面') },
    { key: 'automation', label: t('settingsSubtabQueueAutomation', '队列自动化') },
    { key: 'ordering', label: t('settingsSubtabQueueOrdering', '排序与插入') },
  ],
  card: [
    { key: 'quick-card', label: t('settingsSubtabQuickCard', '监听符号制卡') },
    {
      key: 'topic-derivation',
      label: t('settingsSubtabTopicDerivation', 'Topic 下继续制卡'),
      disabled: !settings.value.quickCard.enabled,
    },
  ],
  'capture-sync': [
    { key: 'entry', label: t('settingsSubtabExcerptEntry', '摘录入口') },
    { key: 'storage', label: t('settingsSubtabStorage', '存放位置') },
    { key: 'conflict', label: t('settingsSubtabConflict', '冲突处理') },
  ],
  neural: [
    { key: 'history', label: t('settingsSubtabNeuralHistory', '轨迹历史') },
    { key: 'channels', label: t('settingsSubtabHyperspaceChannels', '传播通道') },
    { key: 'range', label: t('settingsSubtabHyperspaceRange', '扩散范围') },
    { key: 'weights', label: t('settingsSubtabHyperspaceWeights', '传播权重') },
  ],
  ai: [
    { key: 'provider', label: t('settingsSubtabAiProvider', '模型接入') },
    { key: 'runtime', label: t('settingsSubtabAiRuntime', '聊天与工具') },
    { key: 'built-in-skill', label: t('settingsSubtabAiBuiltInSkill', '内置 Skill') },
    { key: 'user-skills', label: t('settingsSubtabAiUserSkills', '用户 Skill') },
  ],
  maintenance: [
    { key: 'block-attrs', label: t('blockAttrsCleanupTitle', '块属性清理') },
  ],
  about: [
    { key: 'about', label: t('settingsAboutTab', '关于') },
  ],
}));

const activeTabLabel = computed(() => tabs.value.find((tab) => tab.key === activeTab.value)?.label || '');
const activeSubTabs = computed(() => subTabsByTab.value[activeTab.value] || []);
const activeSubTabKey = computed(() => {
  const selectedKey = activeSubTabByTab.value[activeTab.value];
  const selected = activeSubTabs.value.find((subTab) => subTab.key === selectedKey && !subTab.disabled);
  if (selected) {
    return selected.key;
  }

  return activeSubTabs.value.find((subTab) => !subTab.disabled)?.key || activeSubTabs.value[0]?.key || '';
});

function ensureActiveSubTab(tabKey = activeTab.value): void {
  const availableSubTabs = subTabsByTab.value[tabKey] || [];
  const selectedKey = activeSubTabByTab.value[tabKey];
  const selected = availableSubTabs.find((subTab) => subTab.key === selectedKey && !subTab.disabled);
  if (selected) {
    return;
  }

  const fallback = availableSubTabs.find((subTab) => !subTab.disabled) || availableSubTabs[0];
  if (fallback) {
    activeSubTabByTab.value = {
      ...activeSubTabByTab.value,
      [tabKey]: fallback.key,
    };
  }
}

async function scrollSettingsContentToTop(): Promise<void> {
  await nextTick();
  settingsContentRef.value?.scrollTo?.({ top: 0 });
}

function selectSubTab(subTabKey: SettingsSubTabKey): void {
  const target = activeSubTabs.value.find((subTab) => subTab.key === subTabKey);
  if (!target || target.disabled) {
    return;
  }

  activeSubTabByTab.value = {
    ...activeSubTabByTab.value,
    [activeTab.value]: subTabKey,
  };
  void scrollSettingsContentToTop();
}

function isActiveSubTab(tabKey: SettingsTabKey, subTabKey: SettingsSubTabKey): boolean {
  return activeTab.value === tabKey && activeSubTabKey.value === subTabKey;
}

watch(activeTab, async () => {
  ensureActiveSubTab();
  await scrollSettingsContentToTop();
});

watch(() => props.defaultTab, (tab) => {
  activeTab.value = normalizeSettingsTabKey(tab);
});

watch(() => settings.value.quickCard.enabled, (enabled) => {
  if (!enabled && activeSubTabByTab.value.card === 'topic-derivation') {
    activeSubTabByTab.value = {
      ...activeSubTabByTab.value,
      card: 'quick-card',
    };
  }
});

function resetAiPromptTemplate(settingKey: AIPromptSettingKey): void {
  resetAiPromptToRecommended(aiSettings.value, settingKey);
}

function getPromptEditorLabel(settingKey: AIPromptSettingKey): string {
  switch (settingKey) {
    case 'conceptCoach':
      return t('aiConceptCoachPrompt', 'AI 理解与制卡 Prompt');
    default:
      return t('aiConceptCoachPrompt', 'AI 理解与制卡 Prompt');
  }
}

function createUserSkillSection(index = 0): AIUserSkillSectionDefinition {
  return {
    id: `section-${index + 1}`,
    title: `Section ${index + 1}`,
    emptyHint: '这个 section 暂时没有可展示内容。',
    runPrompt: `生成第 ${index + 1} 个 section。`,
    followUpPrompt: `基于第 ${index + 1} 个 section 回答用户追问。`,
    responseKey: `section${index + 1}`,
    renderer: 'markdown',
    required: true,
  };
}

function createUserSkill(mode: UserSkillMode, index = aiSettings.value.userSkills.length): AIUserSkillDefinition {
  return normalizeAIUserSkills([{
    id: `skill-${index + 1}`,
    title: mode === 'structured' ? `结构化 Skill ${index + 1}` : `聊天 Skill ${index + 1}`,
    brief: mode === 'structured' ? '按 section 生成结构化结果。' : '在统一会话里使用上下文和工具聊天。',
    enabled: true,
    mode,
    systemPromptTemplate: mode === 'structured'
      ? '你是一个结构化学习助手。请按给定 sections 返回 JSON。'
      : '你是一个学习助手。请基于当前上下文和工具回答用户。',
    composerPreset: mode === 'structured' ? '请基于当前材料运行这个 Skill。' : '请继续聊天或贴入材料。',
    primaryActionLabel: mode === 'structured' ? '运行 Skill' : '开始聊天',
    defaultToolGroups: ['context-read', 'vars'],
    sections: mode === 'structured' ? [createUserSkillSection(0)] : [],
    surfaceHints: {
      hideTabs: mode === 'chat',
      composerRows: mode === 'chat' ? 5 : 4,
      compactTitle: '',
    },
    version: 1,
  }])[0];
}

function addUserSkill(mode: UserSkillMode): void {
  aiSettings.value.userSkills = [
    ...aiSettings.value.userSkills,
    createUserSkill(mode),
  ];
}

function duplicateUserSkill(index: number): void {
  const current = aiSettings.value.userSkills[index];
  if (!current) {
    return;
  }
  aiSettings.value.userSkills.splice(index + 1, 0, createUserSkill(current.mode, aiSettings.value.userSkills.length));
  aiSettings.value.userSkills[index + 1] = normalizeAIUserSkills([{
    ...current,
    id: `${current.id}-copy`,
    title: `${current.title} Copy`,
  }])[0];
}

function removeUserSkill(index: number): void {
  aiSettings.value.userSkills.splice(index, 1);
}

function addUserSkillSection(skill: AIUserSkillDefinition): void {
  skill.sections.push(createUserSkillSection(skill.sections.length));
}

function removeUserSkillSection(skill: AIUserSkillDefinition, index: number): void {
  skill.sections.splice(index, 1);
}

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
    triggers: ['plugin-start'] as Array<'plugin-start' | 'browser-open'>,
    useBlacklist: true,
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
  storageConflictResolution: 'merge' as ConflictResolutionStrategy,
});

// 🆕 触发器复选框状态（用于 UI 绑定）
const triggers = ref({
  pluginStart: true,
  browserOpen: false,
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

const captureStorageNotebookOptions = computed(() => (props.captureStorageNotebooks || [])
  .map((notebook) => ({
    id: String(notebook.id || '').trim(),
    name: String(notebook.name || '').trim() || String(notebook.id || '').trim(),
  }))
  .filter((notebook) => notebook.id.length > 0));

const progressiveUsesSourceChildStorage = computed(() => settings.value.progressiveStorage.mode === 'source-child');
const progressiveUsesLibraryStorage = computed(() => settings.value.progressiveStorage.mode === 'library');

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
      quickCard: mergeQuickCardSettings(props.quickCardSettings),
      progressiveAltXExcerptEnabled: props.progressiveReadingSettings?.altXExcerptEnabled === true,
      progressiveStorage: mergeConfiguredCaptureStorageSettings(
        props.progressiveReadingSettings?.storage,
        DEFAULT_SETTINGS.progressiveReading.storage,
      ),
    };
    
    // 🔍 调试日志：检查初始化后的 settings.quickCard
    logger.debug('Initialized settings.quickCard', { quickCard: settings.value.quickCard });
  }

  settings.value.quickCard = mergeQuickCardSettings(props.quickCardSettings);
  settings.value.progressiveAltXExcerptEnabled = props.progressiveReadingSettings?.altXExcerptEnabled === true;
  settings.value.progressiveStorage = mergeConfiguredCaptureStorageSettings(
    props.progressiveReadingSettings?.storage,
    DEFAULT_SETTINGS.progressiveReading.storage,
  );
  
  if (props.queueSettings) {
    const incoming = JSON.parse(JSON.stringify(props.queueSettings));
    queueSettings.value = mergeQueueSettings(incoming);

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
      (trigger): trigger is 'plugin-start' | 'browser-open' =>
        trigger === 'plugin-start' || trigger === 'browser-open'
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
      interval: typeof incomingFullSync.interval === 'number' ? incomingFullSync.interval : 86400000,
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
  };

  aiSettings.value = mergeAISettings(props.aiSettings);
  uiSettings.value = mergeUISettings(props.uiSettings);
}

// 保存设置
function saveSettings() {
  const prompts = normalizeAIPromptTemplates(aiSettings.value.prompts);
  const primaryProvider = {
    ...aiSettings.value.providers[0],
    baseUrl: String(aiSettings.value.baseUrl || '').trim(),
    apiKey: String(aiSettings.value.apiKey || '').trim(),
    models: [{
      ...(aiSettings.value.providers[0]?.models?.[0] || {}),
      id: String(aiSettings.value.model || '').trim(),
    }],
  };
  const normalizedAI = normalizeAISettings({
    ...aiSettings.value,
    userSkills: normalizeAIUserSkills(aiSettings.value.userSkills),
    providers: [
      primaryProvider,
      ...aiSettings.value.providers.slice(1),
    ],
    defaultModelId: String(aiSettings.value.model || aiSettings.value.defaultModelId || '').trim(),
    promptContractVersion: ACTIVE_AI_PROMPT_CONTRACT_VERSION,
    prompts,
  });
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
  const triggersArray: Array<'plugin-start' | 'browser-open'> = [];
  if (triggers.value.pluginStart) triggersArray.push('plugin-start');
  if (triggers.value.browserOpen) triggersArray.push('browser-open');

  const {
    addToOutstandingEveryNth: _spacingFromForm,
    autoSortEnabled: _autoSortEnabled,
    autoPostponeEnabled: _autoPostponeEnabled,
    autoPostponeSkipTopN: _autoPostponeSkipTopN,
    progressiveAltXExcerptEnabled: _progressiveAltXExcerptEnabled,
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
    progressiveReading: {
      altXExcerptEnabled: settings.value.progressiveAltXExcerptEnabled,
      storage: mergeConfiguredCaptureStorageSettings(
        settings.value.progressiveStorage,
        DEFAULT_SETTINGS.progressiveReading.storage,
      ),
    },
    ai: {
      ...normalizedAI,
      promptContractVersion: ACTIVE_AI_PROMPT_CONTRACT_VERSION,
      prompts,
    },
    ui: {
      ...uiSettings.value,
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
    quickCard: createDefaultQuickCardSettings(),
    progressiveAltXExcerptEnabled: false,
    progressiveStorage: createDefaultConfiguredCaptureStorageSettings(DEFAULT_SETTINGS.progressiveReading.storage),
  };
  queueSettings.value = createDefaultQueueSettings();
  aiSettings.value = createDefaultAISettings();
  uiSettings.value = createDefaultUISettings();
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

.ai-prompt-preset-card {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid var(--b3-border-color);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(250, 250, 255, 0.98), rgba(245, 246, 252, 0.98));
}

.ai-prompt-preset-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-prompt-preset-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.ai-prompt-preset-card__summary {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

.ai-prompt-preset-card__grid {
  display: grid;
  gap: 10px;
}

.ai-prompt-preset-card__row {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--b3-border-color);
}

.ai-prompt-preset-card__row span,
.ai-prompt-preset-card__editor-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--b3-theme-on-surface-light);
}

.ai-prompt-preset-card__row p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.ai-prompt-preset-card__row--status {
  gap: 6px;
}

.ai-prompt-preset-card__status-copy,
.ai-prompt-preset-card__status-hint {
  margin: 0;
}

.ai-prompt-preset-card__status-hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
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

.ai-prompt-preset-card__actions {
  display: flex;
  justify-content: flex-start;
}

.ai-prompt-preset-card__editor {
  display: grid;
  gap: 8px;
}

.ai-prompt-preset-card__contract {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px dashed var(--b3-border-color);
  background: rgba(255, 255, 255, 0.72);
}

.ai-prompt-preset-card__contract summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.ai-prompt-preset-card__contract-list {
  margin: 8px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface-light);
}

.ai-prompt-preset-card__editor-label--sub {
  margin-top: 4px;
}

.ai-user-skill-toolbar {
  margin-top: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-user-skill-toolbar__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-user-skill-card,
.ai-user-skill-section-card {
  margin-top: 14px;
  border: 1px solid #e5e9f2;
  border-radius: 12px;
  background: #fbfcff;
  padding: 14px;
}

.ai-user-skill-card__head,
.ai-user-skill-section-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ai-user-skill-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-user-skill-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ai-user-skill-tools {
  display: grid;
  gap: 10px;
}

.ai-user-skill-tools__option {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid #e3e8f4;
  border-radius: 10px;
  background: #fff;
}

.ai-user-skill-tools__option span {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.ai-user-skill-surface {
  display: grid;
  gap: 10px;
}

.ai-user-skill-surface label {
  display: grid;
  gap: 6px;
}

.ai-user-skill-sections {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.ai-user-skill-sections__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
}
</style>

