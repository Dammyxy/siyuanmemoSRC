<template>
  <div class="ai-chat" :class="[isCompact ? 'ai-chat--compact' : 'ai-chat--standalone']">
    <aside v-if="state.historyPanelOpen" class="ai-chat__history">
      <div class="ai-chat__history-head">
        <strong>{{ t('aiSessionHistory', '会话历史') }}</strong>
        <button class="ai-chat__icon-button" type="button" :title="t('close', '关闭')" @click="service.setHistoryPanelOpen(false)">
          <svg><use xlink:href="#iconCloseRound"></use></svg>
        </button>
      </div>
      <input
        v-model="historyQuery"
        class="b3-text-field ai-chat__history-search"
        :placeholder="t('searchSessions', '搜索会话')"
      >
      <div class="ai-chat__history-list">
        <section v-for="group in groupedSessionHistory" :key="group.label" class="ai-chat__history-group">
          <div class="ai-chat__history-group-label">{{ group.label }}</div>
          <article
            v-for="session in group.sessions"
            :key="session.id"
            class="ai-chat__history-item"
            :class="{ 'ai-chat__history-item--active': state.sessionId === session.id }"
          >
            <button class="ai-chat__history-open" type="button" @click="openHistorySession(session.id)">
              <strong>{{ session.title }}</strong>
              <span>{{ sourceLabelFor(session.source) }} · {{ formatTime(session.updatedAt) }}</span>
            </button>
            <div class="ai-chat__history-actions">
              <button class="ai-chat__link-button" type="button" @click="renameHistorySession(session.id, session.title)">{{ t('rename', '重命名') }}</button>
              <button class="ai-chat__link-button" type="button" @click="deleteHistorySession(session.id)">{{ t('delete', '删除') }}</button>
            </div>
          </article>
        </section>
        <p v-if="groupedSessionHistory.length === 0" class="ai-chat__empty-note">{{ t('noAiSessions', '还没有可打开的 AI 会话。') }}</p>
      </div>
    </aside>

    <aside v-if="treePanelOpen" class="ai-chat__tree">
      <div class="ai-chat__history-head">
        <strong>{{ t('conversationTree', '当前分支') }}</strong>
        <button class="ai-chat__icon-button" type="button" :title="t('close', '关闭')" @click="treePanelOpen = false">
          <svg><use xlink:href="#iconCloseRound"></use></svg>
        </button>
      </div>
      <div class="ai-chat__tree-list">
        <button
          v-for="node in activeWorldlineNodes"
          :key="node.id"
          class="ai-chat__tree-item"
          type="button"
          @click="focusTreeNode(node.id)"
        >
          <div class="ai-chat__tree-item-head">
            <strong>{{ treeNodeTitle(node) }}</strong>
            <span>{{ node.scope === 'skill' ? 'skill' : node.tabId }}</span>
          </div>
          <p>{{ previewText(treeNodePreview(node), 84) || t('noContent', '无内容') }}</p>
          <div class="ai-chat__tree-badges">
            <span class="ai-chat__badge">{{ node.versionCount }}v</span>
            <span v-if="node.branchCount > 0" class="ai-chat__badge">{{ node.branchCount }} branches</span>
            <span v-if="node.hidden" class="ai-chat__badge ai-chat__badge--warning">{{ t('hidden', '已隐藏') }}</span>
            <span v-if="node.pinned" class="ai-chat__badge">{{ t('pinned', '已固定') }}</span>
          </div>
        </button>
        <p v-if="activeWorldlineNodes.length === 0" class="ai-chat__empty-note">{{ t('noBranchYet', '当前还没有可展示的树节点。') }}</p>
      </div>
    </aside>

    <div class="ai-chat__main">
      <header class="ai-chat__topbar">
        <div class="ai-chat__topbar-main">
          <strong class="ai-chat__headline">{{ skillTitle }}</strong>
          <span class="ai-chat__subhead">{{ activeTabTitle }}</span>
        </div>

        <div class="ai-chat__topbar-actions">
          <button class="ai-chat__icon-button" type="button" :title="t('history', '历史')" @click="service.setHistoryPanelOpen(!state.historyPanelOpen)">
            <svg><use xlink:href="#iconHistory"></use></svg>
          </button>
          <button class="ai-chat__icon-button" type="button" :title="t('conversationTree', '树视图')" @click="treePanelOpen = !treePanelOpen">
            <span>≡</span>
          </button>
          <button class="ai-chat__icon-button" type="button" :title="state.contextPanelOpen ? t('hideContext', '收起上下文') : t('viewContext', '查看上下文')" @click="service.setContextPanelOpen(!state.contextPanelOpen)">
            <svg><use xlink:href="#iconMore"></use></svg>
          </button>
          <button class="ai-chat__icon-button" type="button" :title="t('newAiSession', '新建会话')" @click="createNewSession">
            <span>+</span>
          </button>
          <button class="ai-chat__icon-button" type="button" :title="`${t('model', '模型')}: ${modelLabel}`" @click="openAiSettings">
            <svg><use xlink:href="#iconSettings"></use></svg>
          </button>
          <button class="ai-chat__icon-button" type="button" :title="t('deleteSession', '删除会话')" @click="deleteCurrentSession">
            <svg><use xlink:href="#iconTrashcan"></use></svg>
          </button>
          <button
            v-if="showInlineClose"
            class="ai-chat__icon-button"
            type="button"
            :title="t('closeAiSidecar', '收起 AI 侧栏')"
            @click="emit('close')"
          >
            <svg><use xlink:href="#iconCloseRound"></use></svg>
          </button>
        </div>
      </header>

      <nav class="ai-chat__skill-switch" :aria-label="t('aiSkillSwitch', 'AI Skill 切换')">
        <button
          v-for="skill in skillChoices"
          :key="skill.id"
          class="ai-chat__skill-pill"
          :class="{ 'ai-chat__skill-pill--active': state.activeSkillId === skill.id }"
          type="button"
          @click="service.setActiveSkill(skill.id)"
        >
          <strong>{{ skill.title }}</strong>
          <span>{{ skill.brief }}</span>
        </button>
      </nav>

      <nav v-if="!activeSkillHideTabs" class="ai-chat__tabs" :aria-label="t('aiSkillStages', 'AI 技能阶段')">
        <button
          v-for="tab in skillTabs"
          :key="tab.id"
          class="ai-chat__tab"
          :class="{ 'ai-chat__tab--active': state.activeTabId === tab.id }"
          type="button"
          @click="service.setActiveTab(tab.id)"
        >
          <strong>{{ tab.title }}</strong>
          <span>{{ tab.emptyHint }}</span>
        </button>
      </nav>

      <section v-if="state.contextPanelOpen" class="ai-chat__context">
        <div class="ai-chat__section-head">
          <strong>{{ t('currentContext', '当前上下文') }}</strong>
          <span v-if="state.contextIsHistorical" class="ai-chat__badge ai-chat__badge--warning">{{ t('historicalContext', '历史上下文') }}</span>
        </div>
        <div class="ai-chat__context-rows">
          <div v-for="row in contextDetailRows" :key="row.key" class="ai-chat__context-row">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>
        <div v-if="currentCard" class="ai-chat__context-card">
          <div class="ai-chat__section-head">
            <strong>{{ t('currentCardSnapshot', '当前卡片') }}</strong>
          </div>
          <p>{{ previewText(currentCard.frontText) || t('noFrontContent', '暂无正面内容') }}</p>
          <p v-if="currentCard.hasAnswerFace && !revealLocked" class="ai-chat__muted">{{ previewText(currentCard.backText) || t('noBackContent', '暂无背面内容') }}</p>
          <p v-if="revealLocked" class="ai-chat__warning">{{ t('revealFirstHint', '当前还未 reveal，为避免绕过提取练习，答案和来源内容先隐藏。') }}</p>
        </div>
      </section>

      <article v-if="state.error" class="ai-chat__banner ai-chat__banner--error">
        <strong>{{ t('aiRunFailedTitle', '这次没有顺利跑通') }}</strong>
        <p>{{ state.error }}</p>
        <details v-if="state.failureDiagnostic" class="ai-chat__banner-details">
          <summary>{{ t('aiFailureDiagnostic', '查看原始响应') }}</summary>
          <pre class="ai-chat__banner-pre">{{ state.failureDiagnostic.content }}</pre>
        </details>
      </article>

      <article v-if="state.legacyNotice" class="ai-chat__banner ai-chat__banner--warning">
        <strong>{{ t('legacyExplainSession', '旧解释会话') }}</strong>
        <p>{{ state.legacyNotice }}</p>
      </article>

      <article v-if="arenaBanner.packTitle || arenaBanner.challengeSummary" class="ai-chat__banner ai-chat__banner--info">
        <strong>{{ arenaBanner.packTitle ? `Arena · ${arenaBanner.packTitle}` : t('arenaAssistant', 'Arena Assistant') }}</strong>
        <p v-if="arenaBanner.challengeSummary">{{ arenaBanner.challengeSummary }}</p>
        <p v-else>{{ t('arenaPackRunning', '当前运行中的 AI 策略包已进入竞技场记录。') }}</p>
        <p v-if="arenaBanner.challengers.length > 0" class="ai-chat__banner-note">
          {{ t('arenaChallengers', '候选挑战者') }}：{{ arenaBanner.challengers.map((item) => item.title).join('、') }}
        </p>
      </article>

      <section class="ai-chat__timeline">
        <article v-if="renderEntries.length === 0 && !visibleRunStatus" class="ai-chat__empty-state">
          <div class="ai-chat__empty-state-body">
            <div class="ai-chat__empty-icon">
              <svg><use xlink:href="#iconSparkles"></use></svg>
            </div>
            <strong class="ai-chat__empty-title">{{ skillTitle }}</strong>
            <p class="ai-chat__empty-brief">{{ skillBrief }}</p>
            <button class="ai-chat__empty-cta" type="button" :disabled="state.isLoading || revealLocked" @click="prepareDefaultSkillPrompt">
              {{ primaryActionLabel }}
            </button>
          </div>
        </article>

        <article
          v-for="entry in renderEntries"
          :key="entry.key"
          class="ai-chat__bubble"
          :class="{
            'ai-chat__bubble--user': entry.primaryMessage.kind === 'user',
            'ai-chat__bubble--error': isFailedAssistantMessage(entry.primaryMessage),
          }"
        >
          <div class="ai-chat__bubble-meta">
            <div>
              <strong>{{ messageSpeaker(entry.primaryMessage) }}</strong>
              <span>{{ formatTime(entry.primaryMessage.createdAt) }}</span>
            </div>
          </div>

          <div
            v-if="messageMeta(entry.primaryMessage)?.hidden || messageMeta(entry.primaryMessage)?.pinned || messageMeta(entry.primaryMessage)?.status === 'interrupted' || messageMeta(entry.primaryMessage)?.status === 'error'"
            class="ai-chat__message-badges"
          >
            <span v-if="messageMeta(entry.primaryMessage)?.hidden" class="ai-chat__badge ai-chat__badge--warning">{{ t('hidden', '已隐藏') }}</span>
            <span v-if="messageMeta(entry.primaryMessage)?.pinned" class="ai-chat__badge">{{ t('pinned', '已固定') }}</span>
            <span v-if="messageMeta(entry.primaryMessage)?.status === 'interrupted'" class="ai-chat__badge ai-chat__badge--warning">{{ t('stopped', '已停止') }}</span>
            <span v-if="messageMeta(entry.primaryMessage)?.status === 'error'" class="ai-chat__badge ai-chat__badge--danger">{{ t('failed', '失败') }}</span>
          </div>

          <template v-if="entry.primaryMessage.kind === 'user' || entry.primaryMessage.kind === 'assistant-text'">
            <RichMarkdownContent class="ai-chat__message-copy" :content="entry.primaryMessage.content" />
            <details v-if="failedMessageDiagnostic(entry.primaryMessage)" class="ai-chat__meta-block ai-chat__meta-block--failure">
              <summary>{{ t('aiFailureDiagnostic', '查看原始响应') }}</summary>
              <pre class="ai-chat__banner-pre">{{ failedMessageDiagnostic(entry.primaryMessage) }}</pre>
            </details>
          </template>
          <template v-else-if="entry.primaryMessage.kind === 'separator'">
            <div class="ai-chat__separator">{{ entry.primaryMessage.label }}</div>
          </template>
          <template v-else-if="entry.primaryMessage.kind === 'assistant-result'">
            <div v-if="entry.primaryMessage.tabId === 'self-test-cards'" class="ai-chat__candidate-list">
              <div class="ai-chat__candidate-toolbar">
                <div>
                  <strong>{{ t('selfTestCardCreation', '自测卡片制卡') }}</strong>
                  <span>
                    {{ selectedCandidateCount(entry.primaryMessage) }}/{{ candidateCards(entry.primaryMessage).length }} {{ t('selected', '已选') }}
                    · {{ messageSelfTestModeDescriptor(entry.primaryMessage).label }}
                  </span>
                </div>
                <div class="ai-chat__candidate-mode-switch" role="group" :aria-label="t('selfTestCreationMode', '自测制卡模式')">
                  <button
                    v-for="mode in selfTestModeDescriptors"
                    :key="mode.mode"
                    class="ai-chat__candidate-mode-pill"
                    :class="{ 'ai-chat__candidate-mode-pill--active': selfTestCreationMode === mode.mode }"
                    type="button"
                    :title="mode.summary"
                    :disabled="state.isLoading || selfTestCardCreationBusy || modeDraftBusy(entry.primaryMessage.id)"
                    @click="setWorkbenchSelfTestMode(mode.mode)"
                  >
                    {{ mode.label }}
                  </button>
                </div>
                <div class="ai-chat__candidate-toolbar-actions">
                  <span class="ai-chat__target-summary">{{ selfTestTargetSummary }}</span>
                  <button class="ai-chat__link-button" type="button" @click="openSelfTestTargetDialog">
                    {{ t('setTarget', '设置位置') }}
                  </button>
                  <button
                    class="ai-chat__link-button"
                    type="button"
                    :disabled="selfTestCardCreationBusy || candidateCards(entry.primaryMessage).length === 0"
                    @click="toggleAllCandidates(entry.primaryMessage)"
                  >
                    {{ allCandidateCardsSelected(entry.primaryMessage) ? t('cancelSelectAll', '取消全选') : t('selectAllShort', '全选') }}
                  </button>
                  <button
                    class="ai-chat__primary-button ai-chat__primary-button--small ai-chat__candidate-create-button"
                    type="button"
                    :disabled="Boolean(selfTestCardCreationDisabledReason(entry.primaryMessage))"
                    :title="selfTestCardCreationDisabledReason(entry.primaryMessage) || createSelectedCardsLabel(selectedCandidateCount(entry.primaryMessage), selfTestCardCreationBusy)"
                    @click="createSelfTestCards(entry.primaryMessage)"
                  >
                    <span class="ai-chat__candidate-create-button-icon">+</span>
                    <span>{{ createSelectedCardsLabel(selectedCandidateCount(entry.primaryMessage), selfTestCardCreationBusy) }}</span>
                  </button>
                </div>
              </div>
              <p v-if="selfTestStaleHint" class="ai-chat__composer-hint ai-chat__composer-hint--warning">
                {{ selfTestStaleHint }}
              </p>
              <p v-if="modeDraftBusy(entry.primaryMessage.id)" class="ai-chat__composer-hint">
                {{ t('generatingPluginDrafts', '正在生成当前插件模式草稿...') }}
              </p>
              <p v-if="modeDraftError(entry.primaryMessage.id)" class="ai-chat__result-note ai-chat__result-note--empty">
                {{ modeDraftError(entry.primaryMessage.id) }}
                <button class="ai-chat__link-button" type="button" :disabled="modeDraftBusy(entry.primaryMessage.id)" @click="ensurePluginModeDraftsForMessage(entry.primaryMessage.id)">
                  {{ t('retryThisRequest', '重试本次') }}
                </button>
              </p>
              <p v-if="selfTestCardCreationDisabledReason(entry.primaryMessage)" class="ai-chat__composer-hint ai-chat__composer-hint--warning">
                {{ selfTestCardCreationDisabledReason(entry.primaryMessage) }}
              </p>
              <p v-if="selfTestCardCreationError" class="ai-chat__result-note ai-chat__result-note--empty">
                {{ selfTestCardCreationError }}
              </p>
              <div v-if="selfTestCreationResult" class="ai-chat__creation-result">
                <strong>{{ t('cardCreationDone', '制卡完成') }}：{{ selfTestCreationResult.createdCount }} {{ t('cardsCount', '张') }}</strong>
                <span>{{ selfTestCreationResult.targetLabel }}</span>
                <details v-if="selfTestCreationResult.itemResults.length > 0">
                  <summary>{{ selfTestCreationResult.itemResults.length }} {{ t('creationItems', '项结果') }}</summary>
                  <ul class="ai-chat__creation-result-list">
                    <li v-for="item in selfTestCreationResult.itemResults" :key="item.candidateId">
                      <div class="ai-chat__creation-result-item-head">
                        <strong>{{ item.summary || item.question || t('candidateDraft', '候选草稿') }}</strong>
                        <span>{{ selfTestModeLabel(item.mode) }} · {{ selfTestCreationStatusLabel(item.status) }}</span>
                      </div>
                      <p v-if="item.insertedRootBlockId">{{ t('insertedRootBlock', '根块') }}：{{ item.insertedRootBlockId }}</p>
                      <p v-if="item.error" class="ai-chat__creation-result-error">{{ item.error }}</p>
                      <p v-if="(item.warnings || []).length > 0">{{ t('warnings', '提示') }}：{{ (item.warnings || []).join('；') }}</p>
                    </li>
                  </ul>
                </details>
                <details v-if="selfTestCardCreationFailures.length > 0">
                  <summary>{{ selfTestCardCreationFailures.length }} {{ t('failedItems', '项失败') }}</summary>
                  <ul>
                    <li v-for="failure in selfTestCardCreationFailures" :key="failure.candidateId">
                      {{ failure.summary || failure.question || t('candidateDraft', '候选草稿') }}：{{ failure.error }}
                    </li>
                  </ul>
                </details>
              </div>
              <article v-for="card in candidateCards(entry.primaryMessage)" :key="card.id" class="ai-chat__candidate-card">
                <label class="ai-chat__candidate-check">
                  <input
                    type="checkbox"
                    :checked="card.selected"
                    @change="toggleCandidate(entry.primaryMessage.id, card.id, $event)"
                  >
                  <span>{{ card.kind }}</span>
                </label>
                <div class="ai-chat__candidate-meta">
                  <span class="ai-chat__badge">{{ card.kind }}</span>
                </div>
                <strong>{{ candidateSummary(card) }}</strong>
                <p v-if="card.legacyQuestion || card.legacyAnswer" class="ai-chat__candidate-legacy">
                  {{ card.legacyQuestion || '' }}<span v-if="card.legacyQuestion && card.legacyAnswer"> -> </span>{{ card.legacyAnswer || '' }}
                </p>
                <RichMarkdownContent class="ai-chat__candidate-preview" :content="candidateDraftMarkdown(card)" />
                <button class="ai-chat__link-button" type="button" @click="openCandidateEditor(entry.primaryMessage, card)">{{ t('edit', '编辑') }}</button>
              </article>
            </div>
            <div v-else-if="entry.primaryMessage.tabId === 'cdf-structure'" class="ai-chat__cdf-list">
              <div class="ai-chat__candidate-toolbar">
                <div>
                  <strong>{{ t('cdfSemanticCreation', 'CDF 语义制卡') }}</strong>
                  <span>
                    {{ selectedCdfAnchorCount(entry.primaryMessage) }}/{{ cdfAnchors(entry.primaryMessage).length }} {{ t('selected', '已选') }}
                    · {{ selectedCdfDefinitionCount(entry.primaryMessage) }} {{ t('definitions', '个定义') }}
                    · {{ selectedCdfDescriptorCount(entry.primaryMessage) }} {{ t('descriptors', '个描述符') }}
                  </span>
                </div>
                <div class="ai-chat__candidate-toolbar-actions">
                  <span class="ai-chat__target-summary">{{ selfTestTargetSummary }}</span>
                  <button class="ai-chat__link-button" type="button" @click="openSelfTestTargetDialog">
                    {{ t('setTarget', '设置位置') }}
                  </button>
                  <button
                    class="ai-chat__link-button"
                    type="button"
                    :disabled="cdfPreviewBusy(entry.primaryMessage.id) || !selfTestTargetMemory"
                    @click="previewCdfMessage(entry.primaryMessage, true)"
                  >
                    {{ cdfPreviewBusy(entry.primaryMessage.id) ? t('resolvingConcepts', '解析中...') : t('resolveConcepts', '解析概念') }}
                  </button>
                  <button
                    class="ai-chat__primary-button ai-chat__primary-button--small ai-chat__candidate-create-button"
                    type="button"
                    :disabled="Boolean(cdfCardCreationDisabledReason(entry.primaryMessage))"
                    :title="cdfCardCreationDisabledReason(entry.primaryMessage) || createSelectedCardsLabel(selectedCdfAnchorCount(entry.primaryMessage), cdfCreationBusy)"
                    @click="createCdfCards(entry.primaryMessage)"
                  >
                    <span class="ai-chat__candidate-create-button-icon">+</span>
                    <span>{{ createSelectedCardsLabel(selectedCdfAnchorCount(entry.primaryMessage), cdfCreationBusy) }}</span>
                  </button>
                </div>
              </div>
              <p v-if="cdfPreviewError(entry.primaryMessage.id)" class="ai-chat__result-note ai-chat__result-note--empty">
                {{ cdfPreviewError(entry.primaryMessage.id) }}
              </p>
              <p v-if="cdfCardCreationDisabledReason(entry.primaryMessage)" class="ai-chat__composer-hint ai-chat__composer-hint--warning">
                {{ cdfCardCreationDisabledReason(entry.primaryMessage) }}
              </p>
              <p v-if="cdfCreationError" class="ai-chat__result-note ai-chat__result-note--empty">
                {{ cdfCreationError }}
              </p>
              <div v-if="cdfCreationResult" class="ai-chat__creation-result">
                <strong>
                  {{ cdfCreationResultTitle(cdfCreationResult) }}：
                  {{ cdfCreationResult.createdDefinitionCount }} {{ t('definitions', '个定义') }}
                  · {{ cdfCreationResult.createdDescriptorCount }} {{ t('descriptors', '个描述符') }}
                  <template v-if="cdfCreationOutcomeSummary(cdfCreationResult)">
                    · {{ cdfCreationOutcomeSummary(cdfCreationResult) }}
                  </template>
                </strong>
                <span>{{ cdfCreationResult.targetLabel }}</span>
                <details v-if="cdfCreationResult.itemResults.length > 0">
                  <summary>{{ cdfCreationResult.itemResults.length }} {{ t('creationItems', '项结果') }}</summary>
                  <ul class="ai-chat__creation-result-list">
                    <li v-for="item in cdfCreationResult.itemResults" :key="item.anchorId">
                      <div class="ai-chat__creation-result-item-head">
                        <strong>{{ item.conceptName }}</strong>
                        <span>{{ cdfCreationStatusLabel(item.status) }}</span>
                      </div>
                      <p v-if="item.conceptBlockId">{{ t('conceptDocument', '概念文档') }}：{{ item.conceptBlockId }}</p>
                      <p v-if="item.insertedRootBlockId">{{ t('insertedRootBlock', '根块') }}：{{ item.insertedRootBlockId }}</p>
                      <p>{{ item.createdDefinitionCount }} {{ t('definitions', '个定义') }} · {{ item.createdDescriptorCount }} {{ t('descriptors', '个描述符') }}</p>
                      <p v-if="item.error" class="ai-chat__creation-result-error">{{ item.error }}</p>
                      <p v-if="(item.warnings || []).length > 0">{{ t('warnings', '提示') }}：{{ (item.warnings || []).join('；') }}</p>
                    </li>
                  </ul>
                </details>
              </div>
              <article
                v-for="anchor in cdfAnchors(entry.primaryMessage)"
                :key="anchor.id"
                class="ai-chat__cdf-anchor"
                :class="{ 'ai-chat__cdf-anchor--disabled': anchor.resolution?.status === 'unresolved' || isCdfResolutionStale(anchor.resolution) }"
              >
                <div class="ai-chat__cdf-anchor-head">
                  <label class="ai-chat__candidate-check">
                    <input
                      type="checkbox"
                      :checked="anchor.selected !== false"
                      @change="toggleCdfAnchor(entry.primaryMessage.id, anchor.id, $event)"
                    >
                    <span>{{ anchor.conceptName }}</span>
                  </label>
                  <span
                    class="ai-chat__badge"
                    :class="{
                      'ai-chat__badge--warning': anchor.resolution?.status === 'unresolved' || isCdfResolutionStale(anchor.resolution),
                      'ai-chat__badge--success': hasUsableCdfResolution(anchor),
                    }"
                  >
                    {{ cdfResolutionLabel(anchor) }}
                  </span>
                </div>
                <p v-if="cdfResolutionReason(anchor)" class="ai-chat__muted ai-chat__cdf-anchor-note">{{ cdfResolutionReason(anchor) }}</p>
                <div class="ai-chat__candidate-toolbar-actions ai-chat__candidate-toolbar-actions--anchor ai-chat__cdf-anchor-actions">
                  <button
                    class="ai-chat__primary-button ai-chat__primary-button--small ai-chat__primary-button--accent"
                    type="button"
                    :disabled="cdfConceptDocumentBusy(entry.primaryMessage.id, anchor.id)"
                    @click="toggleCdfConceptSearch(entry.primaryMessage, anchor)"
                  >
                    {{ cdfSearchOpen(entry.primaryMessage.id, anchor.id) ? t('hideSearch', '收起搜索') : t('searchConceptDocument', '搜索概念文档') }}
                  </button>
                  <button
                    v-if="canCreateCdfConceptDocument(anchor)"
                    class="ai-chat__secondary-button ai-chat__secondary-button--small"
                    type="button"
                    :disabled="cdfConceptDocumentBusy(entry.primaryMessage.id, anchor.id)"
                    @click="createAndBindCdfConceptDocument(entry.primaryMessage, anchor)"
                  >
                    {{ cdfConceptDocumentBusy(entry.primaryMessage.id, anchor.id)
                      ? t('creatingConceptDocument', '新建中...')
                      : t('createConceptDocument', '新建概念卡文档块') }}
                  </button>
                  <button
                    v-if="anchor.resolution?.status === 'resolved-manual'"
                    class="ai-chat__link-button"
                    type="button"
                    :disabled="cdfConceptDocumentBusy(entry.primaryMessage.id, anchor.id)"
                    @click="restoreCdfConceptAutoResolution(entry.primaryMessage, anchor)"
                  >
                    {{ t('restoreAutoResolution', '恢复自动解析') }}
                  </button>
                </div>
                <p v-if="cdfAnchorCreationHint(anchor)" class="ai-chat__composer-hint ai-chat__composer-hint--warning">
                  {{ cdfAnchorCreationHint(anchor) }}
                </p>
                <p v-if="cdfConceptDocumentError(entry.primaryMessage.id, anchor.id)" class="ai-chat__result-note ai-chat__result-note--empty">
                  {{ cdfConceptDocumentError(entry.primaryMessage.id, anchor.id) }}
                </p>
                <section v-if="cdfSearchOpen(entry.primaryMessage.id, anchor.id)" class="ai-chat__cdf-search">
                  <div class="ai-chat__cdf-search-bar">
                    <input
                      :value="cdfSearchQuery(entry.primaryMessage.id, anchor.id)"
                      class="b3-text-field"
                      :placeholder="t('conceptDocSearchPlaceholder', '输入概念标题或路径关键字')"
                      @input="setCdfSearchQuery(entry.primaryMessage.id, anchor.id, ($event.target as HTMLInputElement)?.value || '')"
                      @keydown.enter.prevent="handleCdfSearchEnter(entry.primaryMessage, anchor, $event)"
                    >
                    <button
                      class="ai-chat__primary-button ai-chat__primary-button--small"
                      type="button"
                      :disabled="cdfSearchBusy(entry.primaryMessage.id, anchor.id)"
                      @click="runCdfConceptSearch(entry.primaryMessage, anchor)"
                    >
                      {{ cdfSearchBusy(entry.primaryMessage.id, anchor.id) ? t('searching', '搜索中...') : t('search', '搜索') }}
                    </button>
                  </div>
                  <p v-if="cdfSearchError(entry.primaryMessage.id, anchor.id)" class="ai-chat__result-note ai-chat__result-note--empty">
                    {{ cdfSearchError(entry.primaryMessage.id, anchor.id) }}
                  </p>
                  <p v-else-if="!cdfSearchBusy(entry.primaryMessage.id, anchor.id) && cdfSearchResults(entry.primaryMessage.id, anchor.id).length === 0" class="ai-chat__muted">
                    {{ t('noConceptDocumentResults', '没有找到匹配的概念文档。') }}
                  </p>
                  <div v-else class="ai-chat__cdf-search-results">
                    <button
                      v-for="document in cdfSearchResults(entry.primaryMessage.id, anchor.id)"
                      :key="document.id"
                      class="ai-chat__tree-item"
                      type="button"
                      @click="selectCdfConceptDocument(entry.primaryMessage, anchor, document)"
                    >
                      <div class="ai-chat__tree-item-head">
                        <strong>{{ document.title }}</strong>
                        <span>{{ document.id }}</span>
                      </div>
                      <p>{{ document.hPath }}</p>
                    </button>
                  </div>
                </section>

                <section v-if="anchor.definitionCandidates.length > 0" class="ai-chat__cdf-section">
                  <h4>{{ t('workingDefinitions', '工作定义候选') }}</h4>
                  <label class="ai-chat__cdf-item">
                    <input
                      type="radio"
                      :name="cdfDefinitionGroupName(entry.primaryMessage.id, anchor.id)"
                      :checked="!hasSelectedCdfDefinition(anchor)"
                      :disabled="anchor.selected === false"
                      @change="clearCdfDefinitionSelectionForAnchor(entry.primaryMessage.id, anchor.id)"
                    >
                    <span>{{ t('descriptorOnly', '仅做描述符') }}</span>
                  </label>
                  <label
                    v-for="definition in anchor.definitionCandidates"
                    :key="definition.id"
                    class="ai-chat__cdf-item"
                  >
                    <input
                      type="radio"
                      :name="cdfDefinitionGroupName(entry.primaryMessage.id, anchor.id)"
                      :checked="definition.selected !== false"
                      :disabled="anchor.selected === false"
                      @change="selectCdfDefinition(entry.primaryMessage.id, anchor.id, definition.id)"
                    >
                    <span>{{ definition.text }}</span>
                  </label>
                </section>

                <section v-for="group in anchor.descriptorGroups" :key="group.id" class="ai-chat__cdf-section">
                  <div class="ai-chat__cdf-group-head">
                    <label class="ai-chat__cdf-group-title">
                      <input
                        type="checkbox"
                        :checked="group.selected !== false"
                        :disabled="anchor.selected === false"
                        @change="toggleCdfDescriptorGroup(entry.primaryMessage.id, anchor.id, group.id, $event)"
                      >
                      <strong>{{ group.title }}</strong>
                    </label>
                    <div class="ai-chat__cdf-group-meta">
                      <span class="ai-chat__cdf-group-mode">{{ cdfDescriptorGroupMode(group) }}</span>
                      <span>{{ selectedCdfDescriptorItemsInGroup(group) }}/{{ group.items.length }}</span>
                    </div>
                  </div>
                  <div class="ai-chat__cdf-items ai-chat__cdf-group-children">
                    <label
                      v-for="item in group.items"
                      :key="item.id"
                      class="ai-chat__cdf-item"
                    >
                      <input
                        type="checkbox"
                        :checked="item.selected !== false"
                        :disabled="anchor.selected === false || group.selected === false"
                        @change="toggleCdfDescriptorItem(entry.primaryMessage.id, anchor.id, group.id, item.id, $event)"
                      >
                      <span>{{ item.text }}</span>
                    </label>
                  </div>
                </section>
              </article>
            </div>
            <template v-else>
              <p
                v-if="assistantResultNotice(entry.primaryMessage)"
                class="ai-chat__result-note"
                :class="assistantResultNotice(entry.primaryMessage)?.status === 'empty' ? 'ai-chat__result-note--empty' : 'ai-chat__result-note--partial'"
              >
                {{ assistantResultNotice(entry.primaryMessage)?.text }}
              </p>
              <section v-for="section in assistantSections(entry.primaryMessage)" :key="section.key" class="ai-chat__result-section">
                <h4>{{ section.title }}</h4>
                <RichMarkdownContent v-if="section.kind === 'text'" :content="section.text" />
                <ul v-else-if="section.kind === 'list'">
                  <li v-for="item in section.items" :key="item"><RichMarkdownContent :content="item" /></li>
                </ul>
                <div v-else-if="section.kind === 'cards'" class="ai-chat__candidate-list ai-chat__candidate-list--generic">
                  <article v-for="card in section.cards" :key="card.id" class="ai-chat__candidate-card">
                    <strong>{{ card.question || card.kind || t('card', '卡片') }}</strong>
                    <p>{{ card.answer }}</p>
                  </article>
                </div>
                <dl v-else class="ai-chat__key-values">
                  <template v-for="item in section.keyValues" :key="item.key">
                    <dt>{{ item.key }}</dt>
                    <dd><RichMarkdownContent :content="item.value" /></dd>
                  </template>
                </dl>
              </section>
            </template>
          </template>

          <div v-if="entry.pendingApproval" class="ai-chat__approval-card ai-chat__approval-card--pending">
            <div class="ai-chat__approval-card-head">
              <div>
                <strong>{{ entry.pendingApproval.request.title }}</strong>
                <span>{{ entry.pendingApproval.request.type === 'result' ? t('resultApprovalPending', '结果待确认') : t('executionApprovalPending', '执行待确认') }}</span>
              </div>
              <div class="ai-chat__approval-actions">
                <button class="ai-chat__primary-button" type="button" @click="resolveApproval(entry.pendingApproval.request.id, true)">
                  {{ t('approve', '批准') }}
                </button>
                <button class="ai-chat__link-button" type="button" @click="resolveApproval(entry.pendingApproval.request.id, false)">
                  {{ t('reject', '拒绝') }}
                </button>
              </div>
            </div>
            <p>{{ entry.pendingApproval.request.description }}</p>
            <details class="ai-chat__meta-block">
              <summary>{{ t('requestPayload', '请求内容') }}</summary>
              <pre class="ai-chat__banner-pre">{{ approvalArgsText(entry.pendingApproval.request) }}</pre>
            </details>
            <details v-if="entry.pendingApproval.request.resultText" class="ai-chat__meta-block">
              <summary>{{ t('resultPreview', '结果摘要') }}</summary>
              <pre class="ai-chat__banner-pre">{{ entry.pendingApproval.request.resultText }}</pre>
            </details>
          </div>

          <div v-if="entryHasDetails(entry)" class="ai-chat__step-block">
            <button class="ai-chat__step-toggle" type="button" @click="toggleEntryDetails(entry.key)">
              <span class="ai-chat__step-toggle-arrow" :class="{ 'ai-chat__step-toggle-arrow--open': isEntryExpanded(entry.key) }">▾</span>
              <span>{{ entryDetailsLabel(entry) }}</span>
            </button>
            <div v-if="isEntryExpanded(entry.key)" class="ai-chat__step-panel">
              <template v-for="detail in visibleSupplementalMessages(entry)" :key="detail.id">
                <div v-if="detail.kind === 'tool-log'" class="ai-chat__tool-log ai-chat__tool-log--compact" :class="`ai-chat__tool-log--${detail.status}`">
                  <div class="ai-chat__tool-log-head">
                    <strong>{{ detail.toolName }}</strong>
                    <span>{{ toolLogMeta(detail) }}</span>
                  </div>
                  <p class="ai-chat__muted">{{ detail.resultText || detail.content }}</p>
                  <details v-if="detail.argsText" class="ai-chat__meta-block">
                    <summary>{{ t('requestPayload', '请求内容') }}</summary>
                    <pre class="ai-chat__banner-pre">{{ detail.argsText }}</pre>
                  </details>
                  <details class="ai-chat__meta-block">
                    <summary>{{ t('resultPreview', '结果摘要') }}</summary>
                    <pre class="ai-chat__banner-pre">{{ detail.content }}</pre>
                  </details>
                  <p v-if="detail.argsVarRef || detail.varRef" class="ai-chat__muted">
                    <span v-if="detail.argsVarRef">{{ t('argsCachedAsVar', '参数缓存为') }} {{ detail.argsVarRef }}</span>
                    <span v-if="detail.argsVarRef && detail.varRef"> · </span>
                    <span v-if="detail.varRef">{{ t('cachedAsVar', '完整结果缓存为') }} {{ detail.varRef }}</span>
                  </p>
                </div>
                <div v-else-if="detail.kind === 'approval'" class="ai-chat__approval-card ai-chat__approval-card--compact" :class="`ai-chat__approval-card--${detail.request.status}`">
                  <strong>{{ detail.request.title }}</strong>
                  <p>{{ detail.request.description }}</p>
                  <pre>{{ approvalArgsText(detail.request) }}</pre>
                  <p class="ai-chat__muted">
                    {{ detail.request.status === 'approved' ? t('approved', '已批准') : t('rejected', '已拒绝') }}
                    <span v-if="detail.request.rejectReason"> · {{ detail.request.rejectReason }}</span>
                  </p>
                </div>
                <div v-else-if="detail.kind === 'assistant-text'" class="ai-chat__step-note">
                  <RichMarkdownContent class="ai-chat__message-copy" :content="detail.content" />
                </div>
              </template>
              <details v-if="entryReasoningContent(entry)" class="ai-chat__meta-block">
                <summary>{{ t('reasoning', '推理') }}</summary>
                <RichMarkdownContent class="ai-chat__message-copy" :content="entryReasoningContent(entry) || ''" />
              </details>
              <details v-if="entryDiagnostics(entry).length > 0" class="ai-chat__meta-block">
                <summary>{{ t('runtimeMeta', '运行元信息') }}</summary>
                <pre class="ai-chat__banner-pre">{{ entryDiagnostics(entry).join('\n\n') }}</pre>
              </details>
            </div>
          </div>

          <div v-if="messageContextItems(entry.primaryMessage).length > 0" class="ai-chat__context-chip-list ai-chat__context-chip-list--message">
            <button
              v-for="contextItem in messageContextItems(entry.primaryMessage)"
              :key="contextItem.id"
              class="ai-chat__context-chip"
              type="button"
              @click="previewContextItem(contextItem)"
            >
              <strong>{{ contextItem.title }}</strong>
              <span>{{ contextItem.summary }}</span>
            </button>
          </div>

          <div v-if="canSendAssistantResultToSiyuan(entry.primaryMessage) && sendToSiyuanResult(entry.primaryMessage.id)" class="ai-chat__creation-result">
            <strong>{{ t('sentToSiyuan', '已发送到思源') }}</strong>
            <span>{{ sendToSiyuanResult(entry.primaryMessage.id)?.targetLabel }}</span>
          </div>
          <p v-if="canSendAssistantResultToSiyuan(entry.primaryMessage) && sendToSiyuanError(entry.primaryMessage.id)" class="ai-chat__result-note ai-chat__result-note--empty">
            {{ sendToSiyuanError(entry.primaryMessage.id) }}
          </p>

          <div v-if="entry.primaryMessage.kind !== 'separator'" class="ai-chat__message-toolbar">
            <div class="ai-chat__message-toolbar-meta">
              <span>{{ messageFooterMeta(entry.primaryMessage) }}</span>
            </div>
            <div class="ai-chat__message-toolbar-actions">
              <button class="ai-chat__toolbar-button" type="button" @click="copyMessage(entry.primaryMessage)">{{ t('copy', '复制') }}</button>
              <button
                v-if="canSendAssistantResultToSiyuan(entry.primaryMessage)"
                class="ai-chat__toolbar-button"
                type="button"
                :disabled="sendToSiyuanBusy(entry.primaryMessage.id)"
                @click="sendAssistantResultToSiyuan(entry.primaryMessage)"
              >
                {{ sendToSiyuanBusy(entry.primaryMessage.id) ? t('sendingToSiyuan', '发送中...') : t('sendToSiyuan', '发送到思源') }}
              </button>
              <button v-if="canEditMessage(entry.primaryMessage)" class="ai-chat__toolbar-button" type="button" @click="openTextMessageEditor(entry.primaryMessage)">{{ t('edit', '编辑') }}</button>
              <button v-if="canEditUserMessage(entry.primaryMessage)" class="ai-chat__toolbar-button" type="button" @click="prepareEditedFollowUp(entry.primaryMessage)">{{ t('editAndResend', '编辑后重发') }}</button>
              <button v-if="canEditFailedMessage(entry.primaryMessage)" class="ai-chat__toolbar-button" type="button" :disabled="state.isLoading" @click="prepareFailedMessageEdit(entry.primaryMessage)">{{ t('editAndResend', '编辑后重发') }}</button>
              <button v-if="canRetryFailedMessage(entry.primaryMessage)" class="ai-chat__toolbar-button" type="button" :disabled="state.isLoading || revealLocked" @click="retryFailedMessage(entry.primaryMessage)">{{ t('retryThisRequest', '重试本次') }}</button>
              <button v-if="canRerunMessage(entry.primaryMessage)" class="ai-chat__toolbar-button" type="button" :disabled="state.isLoading || revealLocked" @click="rerunMessage(entry.primaryMessage)">{{ t('rerun', '重跑') }}</button>
              <button class="ai-chat__toolbar-button" type="button" @click="branchFromMessage(entry.primaryMessage)">{{ t('branch', '分支') }}</button>
              <button class="ai-chat__toolbar-button" type="button" @click="toggleMessagePinned(entry.primaryMessage)">
                {{ messageMeta(entry.primaryMessage)?.pinned ? t('unpin', '取消固定') : t('pin', '固定') }}
              </button>
              <div class="ai-chat__bubble-menu ai-chat__bubble-menu--toolbar">
                <button
                  class="ai-chat__bubble-menu-trigger"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  @click.stop="openMessageToolbarMenu(entry.primaryMessage, $event)"
                >
                  •••
                </button>
              </div>
            </div>
          </div>
        </article>

        <article v-if="visibleRunStatus" class="ai-chat__bubble ai-chat__bubble--pending" aria-live="polite">
          <div class="ai-chat__bubble-meta">
            <div>
              <strong>{{ visibleRunStatus.title }}</strong>
              <span>{{ formatTime(visibleRunStatus.startedAt) }}</span>
            </div>
          </div>
          <div class="ai-chat__pending-body">
            <span class="ai-chat__pending-dot" aria-hidden="true"></span>
            <p>{{ visibleRunStatus.description }}</p>
          </div>
        </article>
      </section>

      <footer class="ai-chat__composer">
        <p v-if="followUpDisabledReason" class="ai-chat__composer-hint ai-chat__composer-hint--warning">
          {{ followUpDisabledReason }}
        </p>
        <div v-if="composerContexts.length > 0" class="ai-chat__context-chip-list">
          <button
            v-for="contextItem in composerContexts"
            :key="contextItem.id"
            class="ai-chat__context-chip"
            type="button"
            @click="previewContextItem(contextItem)"
          >
            <strong>{{ contextItem.title }}</strong>
            <span>{{ contextItem.summary }}</span>
          </button>
          <button class="ai-chat__link-button" type="button" @click="service.clearComposerContexts()">{{ t('clear', '清空') }}</button>
        </div>

        <div class="ai-chat__composer-shell">
          <div v-if="contextMenuOpen" ref="contextMenuRef" class="ai-chat__context-menu">
            <button
              v-for="provider in contextProviders"
              :key="provider.key"
              class="ai-chat__context-menu-item"
              type="button"
              @click="handleContextProvider(provider)"
            >
              <strong>{{ provider.title }}</strong>
              <span>{{ provider.description }}</span>
            </button>
          </div>

          <textarea
            ref="composerInputRef"
            v-model="composerValue"
            class="b3-text-field ai-chat__composer-input"
            :placeholder="composerPlaceholder"
            @keydown="handleComposerKeydown"
          ></textarea>

          <div class="ai-chat__composer-footer">
            <div class="ai-chat__composer-left-tools">
              <button
                ref="contextMenuToggleRef"
                class="ai-chat__composer-plus"
                type="button"
                :title="t('useContext', '添加上下文')"
                @click="toggleContextMenu"
              >
                <span>+</span>
              </button>
              <button
                class="ai-chat__composer-expand"
                type="button"
                :title="t('largeEditor', '展开输入框')"
                @click="openComposerEditor"
              >
                {{ t('largeEditor', '展开输入框') }}
              </button>
            </div>

            <button
              class="ai-chat__composer-send"
              :class="{ 'ai-chat__composer-send--stop': state.isLoading }"
              type="button"
              :title="state.isLoading ? t('stopGenerating', '停止生成') : t('send', '发送')"
              :disabled="composerActionDisabled"
              @click="handleComposerAction"
            >
              <span v-if="state.isLoading">{{ t('abort', '中止') }}</span>
              <svg v-else><use xlink:href="#iconForward"></use></svg>
            </button>
          </div>
        </div>
      </footer>
    </div>

    <div v-if="selfTestTargetDialogOpen" class="ai-chat__modal-backdrop" @click.self="closeSelfTestTargetDialog">
      <section class="ai-chat__target-dialog" role="dialog" :aria-label="t('setCardCreationTarget', '设置制卡位置')">
        <div class="ai-chat__history-head">
          <strong>{{ t('setCardCreationTarget', '设置制卡位置') }}</strong>
          <button class="ai-chat__icon-button" type="button" :title="t('close', '关闭')" @click="closeSelfTestTargetDialog">
            <svg><use xlink:href="#iconCloseRound"></use></svg>
          </button>
        </div>
        <div class="ai-chat__target-body">
          <div class="ai-chat__target-mode">
            <button
              type="button"
              class="ai-chat__skill-pill"
              :class="{ 'ai-chat__skill-pill--active': selfTestTargetMode === 'daily-note' }"
              @click="selfTestTargetMode = 'daily-note'"
            >
              <strong>{{ t('dailyNoteTarget', '今日日记') }}</strong>
              <span>{{ t('dailyNoteTargetHint', '写入目标笔记本的今天日记') }}</span>
            </button>
            <button
              type="button"
              class="ai-chat__skill-pill"
              :class="{ 'ai-chat__skill-pill--active': selfTestTargetMode === 'block' }"
              @click="selfTestTargetMode = 'block'"
            >
              <strong>{{ t('blockTarget', '指定块') }}</strong>
              <span>{{ t('blockTargetHint', '写入指定文档或块附近') }}</span>
            </button>
          </div>

          <label class="ai-chat__target-field">
            <span>{{ t('targetNotebook', '目标笔记本') }}</span>
            <select v-model="selfTestTargetNotebookId" class="b3-select" :disabled="selfTestTargetLoading" @change="syncSelfTestNotebookName">
              <option value="">{{ t('selectNotebook', '选择笔记本') }}</option>
              <option v-for="notebook in selfTestTargetNotebooks" :key="notebook.id" :value="notebook.id">
                {{ notebook.name }}
              </option>
            </select>
          </label>

          <label v-if="selfTestTargetMode === 'block'" class="ai-chat__target-field">
            <span>{{ t('targetBlockId', '文档/块 ID') }}</span>
            <input
              v-model="selfTestTargetBlockId"
              class="b3-text-field"
              :placeholder="t('targetBlockIdPlaceholder', '输入目标文档块或普通块 ID')"
            >
          </label>

          <p class="ai-chat__muted">
            {{ selfTestTargetMode === 'daily-note'
              ? t('dailyNoteWriteHint', '会先定位或创建目标笔记本的今日日记，再把候选卡追加到日记末尾。')
              : t('blockWriteHint', '文档、标题、列表、列表项等容器会追加到内部；普通叶子块会插入到其下方。') }}
          </p>
          <p v-if="selfTestTargetError" class="ai-chat__result-note ai-chat__result-note--empty">
            {{ selfTestTargetError }}
          </p>
        </div>
        <div class="ai-chat__target-footer">
          <button class="ai-chat__link-button" type="button" @click="closeSelfTestTargetDialog">{{ t('cancel', '取消') }}</button>
          <button class="ai-chat__primary-button" type="button" :disabled="selfTestTargetLoading" @click="confirmSelfTestTarget">
            {{ t('rememberTarget', '记住位置') }}
          </button>
        </div>
      </section>
    </div>

    <LargeTextEditorDialog
      :open="editorOpen"
      :title="editorTitle"
      :model-value="editorValue"
      :readonly="editorReadonly"
      :placeholder="editorPlaceholder"
      :confirm-label="editorConfirmLabel"
      :confirm-disabled="editorReadonly"
      :cancel-label="t('cancel', '取消')"
      :close-label="t('close', '关闭')"
      @update:model-value="editorValue = $event"
      @confirm="confirmEditor"
      @close="closeEditor"
    />
  </div>
</template>

<script setup lang="ts">
import { Menu } from 'siyuan';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  getSelfTestModeDescriptor,
  listSelfTestModeDescriptors,
} from '@/application/services/AIPromptContractRegistry';
import {
  isPluginSelfTestCreationMode,
  resolveSelfTestCandidateDraftMarkdown,
  summarizeSelfTestCandidateCard,
} from '@/application/services/AISelfTestDraftSupport';
import { formatConceptCoachPerspectiveSectionMarkdown } from '@/application/services/AIWorkbenchResultFormatter';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { AI_CONCEPT_COACH_SKILL_ID } from '@/types/ai';
import RichMarkdownContent from '@/ui/shared/RichMarkdownContent.vue';
import LargeTextEditorDialog from '@/ui/shared/LargeTextEditorDialog.vue';
import type {
  AIAttachedContextItem,
  AICdfAnchor,
  AICdfAnchorResolution,
  AICdfDescriptorGroup,
  AICdfStructure,
  AIConceptCoachCandidateCard,
  AIConceptCoachCardKind,
  AIConceptCoachIntegratedUnderstanding,
  AIConceptCoachNormalizationDiagnostic,
  AIConceptCoachPerspectiveSection,
  AIConceptCoachPerspectives,
  AIConceptCoachRealWorldTriggers,
  AIConceptCoachSelfTestCreationMode,
  AIConceptCoachSelfTestCards,
  AIChatApprovalRequest,
  AIExplainResult,
  AIUserSkillStructuredCard,
  AIUserSkillStructuredKeyValue,
  AIWorkbenchApprovalMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchConceptDocumentSearchResult,
  AIWorkbenchMessage,
  AIWorkbenchNotebookOption,
  AIWorkbenchCdfCreationResult,
  AIWorkbenchRenderEntry,
  AIWorkbenchSendToSiyuanResult,
  AIWorkbenchSelfTestCardCreationResult,
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
  AIWorkbenchSource,
  AIWorkbenchToolLogMessage,
  AIWorkbenchUserMessage,
} from '@/types/ai';

type ContextProvider = {
  key: 'manual-text' | 'selected-content' | 'block-refs' | 'current-document';
  title: string;
  description: string;
  inputKind: 'none' | 'line' | 'area';
};

type AssistantSection =
  | { key: string; title: string; kind: 'text'; text: string }
  | { key: string; title: string; kind: 'list'; items: string[] }
  | { key: string; title: string; kind: 'cards'; cards: AIUserSkillStructuredCard[] }
  | { key: string; title: string; kind: 'keyValue'; keyValues: AIUserSkillStructuredKeyValue[] };

type WindowWithPlugin = Window & {
  siyuanMemoPlugin?: {
    getContext?: () => {
      getDialogManager?: () => {
        openSettingsDialog?: (defaultTab?: string) => Promise<void> | void;
      };
    };
  };
  siyuan?: {
    ws?: {
      app?: {
        plugins?: unknown[];
      };
    };
  };
};

const props = defineProps<{
  service: AIWorkbenchService;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const service = props.service;
const state = service.state;
const arenaBanner = computed(() => service.getArenaBannerModel?.() || {
  packTitle: null,
  challengeSummary: null,
  challengers: [],
});
const historyQuery = ref('');
const treePanelOpen = ref(false);
const expandedEntryKeys = ref<string[]>([]);
const composerValue = ref('');
const composerInputRef = ref<HTMLTextAreaElement | null>(null);
const contextMenuOpen = ref(false);
const contextMenuRef = ref<HTMLElement | null>(null);
const contextMenuToggleRef = ref<HTMLElement | null>(null);

const editorOpen = ref(false);
const editorReadonly = ref(false);
const editorTitle = ref('');
const editorValue = ref('');
const editorPlaceholder = ref('');
const editorConfirmLabel = ref('');
const editingMessageId = ref<string | null>(null);
const editingCandidateId = ref<string | null>(null);
const editingMode = ref<'assistant-text' | 'user-message' | 'composer' | 'context' | 'provider' | 'candidate-card' | null>(null);
const editingSourceUserMessage = ref<AIWorkbenchUserMessage | null>(null);
const pendingProvider = ref<ContextProvider | null>(null);
const selfTestTargetDialogOpen = ref(false);
const selfTestTargetLoaded = ref(false);
const selfTestTargetLoading = ref(false);
const selfTestTargetError = ref('');
const selfTestCardCreationBusy = ref(false);
const selfTestCardCreationError = ref('');
const selfTestTargetNotebooks = ref<AIWorkbenchNotebookOption[]>([]);
const selfTestTargetMemory = ref<AIWorkbenchSelfTestCardTargetMemory | null>(null);
const selfTestCreationResult = ref<AIWorkbenchSelfTestCardCreationResult | null>(null);
const cdfPreviewByMessageId = ref<Record<string, AICdfStructure>>({});
const cdfPreviewKeyByMessageId = ref<Record<string, string>>({});
const cdfPreviewBusyMessageIds = ref<string[]>([]);
const cdfPreviewErrors = ref<Record<string, string>>({});
const cdfCreationBusy = ref(false);
const cdfCreationError = ref('');
const cdfCreationResult = ref<AIWorkbenchCdfCreationResult | null>(null);
const sendToSiyuanBusyMessageIds = ref<string[]>([]);
const sendToSiyuanErrors = ref<Record<string, string>>({});
const sendToSiyuanResults = ref<Record<string, AIWorkbenchSendToSiyuanResult>>({});
const cdfSearchOpenKeys = ref<string[]>([]);
const cdfSearchQueryByKey = ref<Record<string, string>>({});
const cdfSearchBusyKeys = ref<string[]>([]);
const cdfSearchErrors = ref<Record<string, string>>({});
const cdfSearchResultsByKey = ref<Record<string, AIWorkbenchConceptDocumentSearchResult[]>>({});
const cdfConceptDocumentBusyKeys = ref<string[]>([]);
const cdfConceptDocumentErrors = ref<Record<string, string>>({});
const selfTestTargetMode = ref<AIWorkbenchSelfTestCardTargetInput['mode']>('daily-note');
const selfTestTargetNotebookId = ref('');
const selfTestTargetNotebookName = ref('');
const selfTestTargetBlockId = ref('');
const selfTestModeDescriptors = listSelfTestModeDescriptors();
const selfTestCreationMode = ref<AIConceptCoachSelfTestCreationMode>(service.getSelfTestCreationMode?.() || 'list-item');
const selfTestModeDraftBusyMessageIds = ref<string[]>([]);
const selfTestModeDraftErrors = ref<Record<string, string>>({});

function t(key: string, fallback: string): string {
  const value = props.i18n?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLooseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function tryParseStructuredJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveLegacyExplainResult(message: AIWorkbenchAssistantResultMessage): AIExplainResult | null {
  if (message.explainResult && (
    message.explainResult.workingDefinition
    || message.explainResult.whatItTests
    || message.explainResult.whyItsTricky
    || message.explainResult.connections.length > 0
    || message.explainResult.triggers.length > 0
    || message.explainResult.cardIdeas.length > 0
  )) {
    return message.explainResult;
  }
  const raw = tryParseStructuredJson(message.rawContent);
  if (!raw) {
    return message.explainResult || null;
  }
  return {
    workingDefinition: typeof raw.workingDefinition === 'string' ? raw.workingDefinition.trim() : (typeof raw.workDefinition === 'string' ? raw.workDefinition.trim() : ''),
    whatItTests: typeof raw.whatItTests === 'string' ? raw.whatItTests.trim() : (typeof raw.testPoint === 'string' ? raw.testPoint.trim() : ''),
    whyItsTricky: typeof raw.whyItsTricky === 'string' ? raw.whyItsTricky.trim() : (typeof raw.confusionBoundary === 'string' ? raw.confusionBoundary.trim() : ''),
    connections: normalizeLooseStringList(raw.connections ?? raw.knowledgeNetwork),
    triggers: normalizeLooseStringList(raw.triggers ?? raw.recognizeNextTime ?? raw.recallTrigger),
    cardIdeas: normalizeLooseStringList(raw.cardIdeas),
    rawContent: message.rawContent,
  };
}

function previewText(value: string | null | undefined, limit = 180): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function formatTime(value: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function sourceLabelFor(source: AIWorkbenchSource): string {
  switch (source) {
    case 'review':
      return t('reviewTitle', '复习');
    case 'browser':
      return t('browser', '浏览器');
    case 'template-dialog':
      return t('templateCardLabel', '模板制卡');
    default:
      return t('aiWorkbench', 'AI 工作台');
  }
}

function getWindowPlugin() {
  const runtimeWindow = window as WindowWithPlugin;
  if (runtimeWindow.siyuanMemoPlugin) {
    return runtimeWindow.siyuanMemoPlugin;
  }
  const plugins = runtimeWindow.siyuan?.ws?.app?.plugins;
  if (!Array.isArray(plugins)) {
    return null;
  }
  const matched = plugins.find((plugin) => isRecord(plugin) && String(plugin.name || '') === 'siyuan-plugin-siyuanmemo');
  return isRecord(matched) ? matched as WindowWithPlugin['siyuanMemoPlugin'] : null;
}

function getDialogManager() {
  return getWindowPlugin()?.getContext?.()?.getDialogManager?.() || null;
}

const isCompact = computed(() => state.surface !== 'standalone-dialog');
const showInlineClose = computed(() => state.surface === 'review-dialog-sidecar');
const modelLabel = computed(() => service.getCurrentModelLabel?.() || t('unconfiguredModel', '未配置模型'));
const skillChoices = computed(() => service.getSkills?.() || []);
const skillTabs = computed(() => service.getSkillTabs?.() || []);
const skillTitle = computed(() => service.getSkillTitle?.() || t('aiConceptCoachCard', 'AI 理解与制卡'));
const skillBrief = computed(() => service.getSkillBrief?.() || t('aiExplainBrief', '解释这张卡'));
const primaryActionLabel = computed(() => service.getPrimaryActionLabel?.() || t('explainThisContent', '解释此内容'));
const defaultUserPrompt = computed(() => service.getDefaultUserPrompt?.() || t('aiConceptCoachDefaultUserPrompt', '请基于当前材料，完成 AI 理解与制卡：先解释清楚，再生成可自测的候选卡。'));
const activeSkillHideTabs = computed(() => skillChoices.value.find((skill) => skill.id === state.activeSkillId)?.hideTabs === true);
const activeTabTitle = computed(() => service.getActiveTabDescriptor?.().title || skillTabs.value.find((tab) => tab.id === state.activeTabId)?.title || '');
const currentTabHasResult = computed(() => service.hasStructuredResult?.(undefined, state.activeTabId) || Boolean(state.explainResult));
const visibleRunStatus = computed(() => {
  const status = state.runStatus;
  if (!status) {
    return null;
  }
  if (status.mode === 'full-run' || status.tabIds.includes(state.activeTabId)) {
    return status;
  }
  return null;
});
const filteredSessionHistory = computed(() => {
  const query = historyQuery.value.trim().toLowerCase();
  if (!query) {
    return state.sessionHistory;
  }
  return state.sessionHistory.filter((session) => (
    session.title.toLowerCase().includes(query)
    || sourceLabelFor(session.source).toLowerCase().includes(query)
  ));
});
const groupedSessionHistory = computed(() => {
  const groups = new Map<string, typeof filteredSessionHistory.value>();
  for (const session of filteredSessionHistory.value) {
    const label = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(session.updatedAt));
    groups.set(label, [...(groups.get(label) || []), session]);
  }
  return Array.from(groups.entries()).map(([label, sessions]) => ({ label, sessions }));
});
const rawActiveMessages = computed(() => service.getThreadMessages?.(undefined, state.activeTabId) || []);
const renderEntries = computed<AIWorkbenchRenderEntry[]>(() => {
  if (service.getRenderEntries) {
    return service.getRenderEntries(undefined, state.activeTabId);
  }
  return rawActiveMessages.value.map((message) => ({
    key: `${message.id}::render-fallback`,
    primaryMessage: message,
    supplementalMessages: [],
    stepCount: 0,
    pendingApproval: null,
  }));
});
const activeWorldlineNodes = computed(() => service.getActiveTreeWorldline?.() || []);
const composerContexts = computed(() => service.getComposerContexts?.() || state.composerContexts.items);
const contextProviders = computed<ContextProvider[]>(() => (
  (service.getAvailableContextProviders?.() || []) as ContextProvider[]
));
const currentCard = computed(() => state.context?.currentCard || null);
const revealLocked = computed(() => Boolean(
  currentCard.value
  && currentCard.value.explainRequiresReveal
  && !currentCard.value.revealed
));
const contextDetailRows = computed(() => {
  const rows = [
    { key: 'queue', label: t('currentQueue', '当前队列'), value: String(state.context?.queueProgress?.queueLabel || state.context?.queueType || '-') },
    { key: 'blocks', label: t('currentMaterial', '当前材料'), value: String(state.context?.selectedBlockIds.length || state.context?.blocks.length || 0) },
    { key: 'model', label: t('model', '模型'), value: modelLabel.value },
  ];
  const navigationState = state.context?.neuralBatch && 'navigationState' in state.context.neuralBatch
    ? state.context.neuralBatch.navigationState
    : null;
  if (navigationState && typeof navigationState.currentPathIndex === 'number' && typeof navigationState.pathLength === 'number') {
    rows.push({
      key: 'path-position',
      label: t('currentPathPosition', '当前路径位置'),
      value: `${navigationState.currentPathIndex + 1}/${navigationState.pathLength}`,
    });
  }
  return rows;
});
const composerPlaceholder = computed(() => (
  state.activeSkillId === 'general-chat'
    ? t('aiGeneralChatPlaceholder', '直接提问、粘贴 URL，或让 AI 调用工具读取当前上下文。')
    : (
  currentTabHasResult.value
    ? t('aiFollowUpPlaceholder', '继续追问当前阶段，或补充一段材料后再问。')
    : t('aiConceptCoachComposerPlaceholder', '输入你想理解或制卡的内容，按 Enter 发送；Shift+Enter 换行。')
    )
));
const followUpDisabledReason = computed(() => (
  state.activeSkillId === 'general-chat' || !currentTabHasResult.value
    ? null
    : service.getFollowUpDisabledReason?.(undefined, state.activeTabId) || null
));
const sendDisabled = computed(() => {
  if (state.isLoading) {
    return true;
  }
  if (composerValue.value.trim().length === 0) {
    return true;
  }
  if (state.activeSkillId !== 'general-chat' && !currentTabHasResult.value && revealLocked.value) {
    return true;
  }
  return Boolean(followUpDisabledReason.value);
});
const composerActionDisabled = computed(() => (
  state.isLoading
    ? typeof service.cancelCurrentRun !== 'function'
    : sendDisabled.value
));
const selfTestTargetSummary = computed(() => (
  selfTestTargetMemory.value?.targetLabel || t('selfTestTargetNotSet', '尚未设置制卡位置')
));
const selfTestCardCreationFailures = computed(() => (
  selfTestCreationResult.value?.itemResults.filter((item) => item.status === 'failed') || []
));
const cdfPreviewTargetKey = computed(() => {
  const target = selfTestTargetMemory.value;
  if (!target) {
    return '';
  }
  return [
    target.mode,
    target.notebookId,
    target.targetBlockId || '',
  ].join('::');
});

function sectionsFromPerspectives(value: AIConceptCoachPerspectives): AssistantSection[] {
  return [
    { key: 'traits', title: value.traits.title || t('traits', '特性和倾向'), kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.traits) },
    { key: 'contrasts', title: value.contrasts.title || t('contrasts', '辨析异同'), kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.contrasts) },
    { key: 'partsAndWhole', title: value.partsAndWhole.title || t('partsAndWhole', '部分和整体'), kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.partsAndWhole) },
    { key: 'causality', title: value.causality.title || t('causality', '因果关系'), kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.causality) },
    { key: 'significance', title: value.significance.title || t('significance', '意义和影响'), kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.significance) },
  ];
}

function missingSectionLabel(tabId: AIWorkbenchAssistantResultMessage['tabId'], key: string): string {
  if (tabId === 'perspectives') {
    switch (key) {
      case 'traits':
        return t('traits', '特性和倾向');
      case 'contrasts':
        return t('contrasts', '辨析异同');
      case 'partsAndWhole':
        return t('partsAndWhole', '部分和整体');
      case 'causality':
        return t('causality', '因果关系');
      case 'significance':
        return t('significance', '意义和影响');
      default:
        return key;
    }
  }
  if (tabId === 'integrated-understanding') {
    switch (key) {
      case 'essence':
        return t('essence', '本质压缩');
      case 'notWhat':
        return t('notWhat', '它不是什么');
      case 'capabilities':
        return t('capabilities', '学会后能做到');
      default:
        return key;
    }
  }
  return key;
}

function assistantResultNotice(message: AIWorkbenchMessage): { status: AIConceptCoachNormalizationDiagnostic['status']; text: string } | null {
  if (message.kind !== 'assistant-result' || !message.normalizationDiagnostic) {
    return null;
  }
  const diagnostic = message.normalizationDiagnostic;
  if (diagnostic.status === 'full') {
    return null;
  }
  const missing = diagnostic.missingSections
    .map((key) => missingSectionLabel(message.tabId, key))
    .filter(Boolean)
    .join('、');

  if (diagnostic.status === 'empty') {
    const base = t('aiStructuredEmptyResult', '当前阶段没有识别到可展示的结构字段。');
    const detail = missing
      ? `${t('missingSections', '缺少')}：${missing}。`
      : '';
    const shape = diagnostic.rawShape && diagnostic.rawShape !== 'persisted-result'
      ? `${t('rawShape', '原始形状')}：${diagnostic.rawShape}。`
      : '';
    return {
      status: diagnostic.status,
      text: `${base}${detail}${shape}`.trim(),
    };
  }

  return {
    status: diagnostic.status,
    text: `${t('aiStructuredPartialResult', '模型只返回了部分结构，已尽量展示可用内容。')}${missing ? ` ${t('missingSections', '缺少')}：${missing}。` : ''}`.trim(),
  };
}

function assistantSections(message: AIWorkbenchMessage): AssistantSection[] {
  if (message.kind !== 'assistant-result') {
    return [];
  }
  const genericSections = message.genericSectionResult
    ? [message.genericSectionResult]
    : message.genericStructuredResult?.sections.filter((section) => section.id === message.tabId) || [];
  if (genericSections.length > 0) {
    return genericSections
      .map((section): AssistantSection | null => {
        if (section.renderer === 'markdown') {
          return section.text.trim()
            ? { key: section.id, title: section.title, kind: 'text', text: section.text }
            : null;
        }
        if (section.renderer === 'list') {
          return section.items.length > 0
            ? { key: section.id, title: section.title, kind: 'list', items: section.items }
            : null;
        }
        if (section.renderer === 'cards') {
          return section.cards.length > 0
            ? { key: section.id, title: section.title, kind: 'cards', cards: section.cards }
            : null;
        }
        return section.keyValues.length > 0
          ? { key: section.id, title: section.title, kind: 'keyValue', keyValues: section.keyValues }
          : null;
      })
      .filter((section): section is AssistantSection => Boolean(section));
  }
  const legacyResult = !message.conceptCoachResult && !message.tabResult
    ? resolveLegacyExplainResult(message)
    : null;
  if (legacyResult) {
    return [
      { key: 'workingDefinition', title: t('workingDefinition', '工作定义'), kind: 'text' as const, text: legacyResult.workingDefinition },
      { key: 'whatItTests', title: t('whatItTests', '这张卡在考什么'), kind: 'text' as const, text: legacyResult.whatItTests },
      { key: 'whyItsTricky', title: t('whyItsTricky', '为什么容易错'), kind: 'text' as const, text: legacyResult.whyItsTricky },
      { key: 'connections', title: t('connections', '它和现有知识网络的连接'), kind: 'list' as const, items: legacyResult.connections },
      { key: 'triggers', title: t('triggers', '下次什么时候该想起它'), kind: 'list' as const, items: legacyResult.triggers },
      { key: 'cardIdeas', title: t('cardIdeas', '可顺手补的卡'), kind: 'list' as const, items: legacyResult.cardIdeas },
    ].filter((section) => section.kind === 'text' ? section.text.trim().length > 0 : section.items.length > 0);
  }
  if (message.tabId === 'working-definition') {
    const text = typeof message.tabResult === 'string'
      ? message.tabResult
      : message.conceptCoachResult?.workingDefinition || '';
    return [{ key: 'workingDefinition', title: t('workingDefinition', '工作定义'), kind: 'text', text }].filter((section) => section.text.trim());
  }
  if (message.tabId === 'perspectives') {
    return sectionsFromPerspectives((message.tabResult || message.conceptCoachResult?.perspectives) as AIConceptCoachPerspectives)
      .filter((section) => section.kind === 'text' ? section.text.trim().length > 0 : section.items.length > 0);
  }
  if (message.tabId === 'integrated-understanding') {
    const value = (message.tabResult || message.conceptCoachResult?.integratedUnderstanding) as AIConceptCoachIntegratedUnderstanding | null;
    return value ? [
      { key: 'essence', title: t('essence', '本质压缩'), kind: 'text' as const, text: normalizeText(value.essence) },
      { key: 'notWhat', title: t('notWhat', '它不是什么'), kind: 'list' as const, items: normalizeLooseStringList(value.notWhat) },
      { key: 'capabilities', title: t('capabilities', '学会后能做到'), kind: 'list' as const, items: normalizeLooseStringList(value.capabilities) },
    ].filter((section) => section.kind === 'text' ? section.text.length > 0 : section.items.length > 0) : [];
  }
  if (message.tabId === 'real-world-triggers') {
    const value = (message.tabResult || message.conceptCoachResult?.realWorldTriggers) as AIConceptCoachRealWorldTriggers | null;
    return value ? [{ key: 'triggers', title: t('realWorldTriggers', '现实触发器'), kind: 'list', items: normalizeLooseStringList(value.triggers) }] : [];
  }
  return [];
}

function candidateCards(message: AIWorkbenchAssistantResultMessage): AIConceptCoachCandidateCard[] {
  const value = (message.tabResult || message.conceptCoachResult?.selfTestCards) as AIConceptCoachSelfTestCards | null;
  return Array.isArray(value?.cards) ? value.cards : [];
}

function candidateDraftMarkdown(card: AIConceptCoachCandidateCard): string {
  return resolveSelfTestCandidateDraftMarkdown(card, selfTestCreationMode.value, { allowFallback: true });
}

function candidateSummary(card: AIConceptCoachCandidateCard): string {
  return summarizeSelfTestCandidateCard(card) || t('candidateDraft', '候选草稿');
}

function messageSelfTestCreationMode(message: AIWorkbenchAssistantResultMessage): AIConceptCoachSelfTestCreationMode {
  return selfTestCreationMode.value;
}

function messageSelfTestModeDescriptor(message: AIWorkbenchAssistantResultMessage) {
  return getSelfTestModeDescriptor(messageSelfTestCreationMode(message));
}

function selfTestModeLabel(mode: AIConceptCoachSelfTestCreationMode): string {
  return getSelfTestModeDescriptor(mode).label;
}

function cdfCreationStatusLabel(status: AIWorkbenchCdfCreationResult['itemResults'][number]['status']): string {
  switch (status) {
    case 'created':
      return t('created', '已创建');
    case 'skipped':
      return t('skipped', '已跳过');
    case 'failed':
    default:
      return t('failed', '失败');
  }
}

function cdfCreationResultTitle(result: AIWorkbenchCdfCreationResult): string {
  return result.failedCount > 0 || result.skippedCount > 0
    ? t('cardCreationResult', '制卡结果')
    : t('cardCreationDone', '制卡完成');
}

function cdfCreationOutcomeSummary(result: AIWorkbenchCdfCreationResult): string {
  const parts: string[] = [];
  if (result.createdCount > 0) {
    parts.push(`${result.createdCount} ${t('createdItems', '项成功')}`);
  }
  if (result.failedCount > 0) {
    parts.push(`${result.failedCount} ${t('failedItems', '项失败')}`);
  }
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} ${t('skippedItems', '项跳过')}`);
  }
  return parts.join(' · ');
}

function selectedCandidateCount(message: AIWorkbenchAssistantResultMessage): number {
  return candidateCards(message).filter((card) => card.selected !== false).length;
}

function createSelectedCardsLabel(selectedCount: number, busy: boolean): string {
  if (busy) {
    return t('creatingCards', '制卡中...');
  }
  return `${t('createSelectedCards', '制卡选中项')} · ${selectedCount} ${t('itemsUnit', '项')}`;
}

function validSelectedCandidateCount(message: AIWorkbenchAssistantResultMessage): number {
  return candidateCards(message).filter((card) => (
    card.selected !== false
    && normalizeText(candidateDraftMarkdown(card)).length > 0
  )).length;
}

function isPluginSelfTestMode(mode: AIConceptCoachSelfTestCreationMode): boolean {
  return isPluginSelfTestCreationMode(mode);
}

function modeDraftBusy(messageId: string): boolean {
  return selfTestModeDraftBusyMessageIds.value.includes(messageId);
}

function isCdfStructureMessage(message: AIWorkbenchMessage): message is AIWorkbenchAssistantResultMessage {
  return message.kind === 'assistant-result' && message.tabId === 'cdf-structure';
}

function rawCdfStructure(message: AIWorkbenchAssistantResultMessage): AICdfStructure {
  const value = (message.tabResult || message.conceptCoachResult?.cdfStructure) as AICdfStructure | null;
  return value?.anchors ? value : { anchors: [] };
}

function mergePreviewIntoCdfStructure(base: AICdfStructure, preview: AICdfStructure | null | undefined): AICdfStructure {
  if (!preview?.anchors?.length) {
    return base;
  }
  const previewById = new Map(preview.anchors.map((anchor) => [anchor.id, anchor] as const));
  return {
    anchors: base.anchors.map((anchor) => {
      const resolved = previewById.get(anchor.id);
      if (!resolved) {
        return anchor;
      }
      return {
        ...anchor,
        resolution: resolved.resolution,
        warnings: resolved.warnings || anchor.warnings || [],
      };
    }),
  };
}

function cdfPreviewBusy(messageId: string): boolean {
  return cdfPreviewBusyMessageIds.value.includes(messageId);
}

function cdfPreviewError(messageId: string): string {
  return cdfPreviewErrors.value[messageId] || '';
}

function cdfStructureForMessage(message: AIWorkbenchAssistantResultMessage): AICdfStructure {
  return mergePreviewIntoCdfStructure(rawCdfStructure(message), cdfPreviewByMessageId.value[message.id]);
}

function cdfAnchors(message: AIWorkbenchAssistantResultMessage): AICdfAnchor[] {
  return cdfStructureForMessage(message).anchors || [];
}

function cdfSearchKey(messageId: string, anchorId: string): string {
  return `${messageId}::${anchorId}`;
}

function clearCdfPreviewState(messageId: string): void {
  const nextPreview = { ...cdfPreviewByMessageId.value };
  const nextPreviewKey = { ...cdfPreviewKeyByMessageId.value };
  const nextErrors = { ...cdfPreviewErrors.value };
  delete nextPreview[messageId];
  delete nextPreviewKey[messageId];
  delete nextErrors[messageId];
  cdfPreviewByMessageId.value = nextPreview;
  cdfPreviewKeyByMessageId.value = nextPreviewKey;
  cdfPreviewErrors.value = nextErrors;
}

function isCdfResolutionStale(resolution: AICdfAnchorResolution | null | undefined): boolean {
  if (!resolution || !selfTestTargetMemory.value) {
    return false;
  }
  if (resolution.status !== 'resolved-notebook' && resolution.status !== 'resolved-manual') {
    return false;
  }
  const resolutionNotebookId = normalizeText(resolution.notebookId);
  if (!resolutionNotebookId) {
    return false;
  }
  return resolutionNotebookId !== normalizeText(selfTestTargetMemory.value.notebookId);
}

function hasUsableCdfResolution(anchor: AICdfAnchor): boolean {
  if (!anchor.resolution || isCdfResolutionStale(anchor.resolution)) {
    return false;
  }
  return anchor.resolution.status === 'resolved-context'
    || anchor.resolution.status === 'resolved-notebook'
    || anchor.resolution.status === 'resolved-manual';
}

function selectedCdfAnchorCount(message: AIWorkbenchAssistantResultMessage): number {
  return cdfAnchors(message).filter((anchor) => anchor.selected !== false).length;
}

function selectedCdfDefinitionCount(message: AIWorkbenchAssistantResultMessage): number {
  return cdfAnchors(message).reduce((total, anchor) => total + anchor.definitionCandidates.filter((definition) => (
    anchor.selected !== false && definition.selected !== false && normalizeText(definition.text).length > 0
  )).length, 0);
}

function hasSelectedCdfDefinition(anchor: AICdfAnchor): boolean {
  return anchor.definitionCandidates.some((definition) => (
    definition.selected !== false && normalizeText(definition.text).length > 0
  ));
}

function selectedCdfDescriptorItemsInGroup(group: AICdfDescriptorGroup): number {
  return group.items.filter((item) => item.selected !== false && normalizeText(item.text).length > 0).length;
}

function cdfDescriptorGroupMode(group: AICdfDescriptorGroup): ';;' | ';;;' {
  return selectedCdfDescriptorItemsInGroup(group) > 1 ? ';;;' : ';;';
}

function selectedCdfDescriptorCount(message: AIWorkbenchAssistantResultMessage): number {
  return cdfAnchors(message).reduce((total, anchor) => total + anchor.descriptorGroups.reduce((groupTotal, group) => (
    anchor.selected !== false && group.selected !== false
      ? groupTotal + selectedCdfDescriptorItemsInGroup(group)
      : groupTotal
  ), 0), 0);
}

function cdfResolutionLabel(anchor: AICdfAnchor): string {
  if (isCdfResolutionStale(anchor.resolution)) {
    return t('conceptResolutionStale', '解析结果已过期');
  }
  switch (anchor.resolution?.status) {
    case 'resolved-context':
      return t('resolvedFromContext', '上下文已命中');
    case 'resolved-notebook':
      return t('resolvedFromNotebook', '笔记本已命中');
    case 'resolved-manual':
      return t('resolvedManually', '手动已选定');
    case 'unresolved':
      return t('conceptUnresolved', '未命中概念');
    default:
      return selfTestTargetMemory.value
        ? t('conceptPendingResolve', '待解析')
        : t('setTargetFirst', '先设位置');
  }
}

function cdfResolutionReason(anchor: AICdfAnchor): string {
  if (isCdfResolutionStale(anchor.resolution)) {
    return t('conceptResolutionStaleHint', '当前解析结果属于旧目标笔记本，请重新解析或重新搜索概念文档。');
  }
  return normalizeText(anchor.resolution?.reason);
}

function cdfAnchorCreationHint(anchor: AICdfAnchor): string | null {
  if (anchor.selected === false) {
    return t('anchorNotSelectedHint', '当前概念未勾选，不会参与制卡。');
  }
  if (!anchor.resolution) {
    return selfTestTargetMemory.value ? null : t('setTargetFirst', '请先设置制卡位置。');
  }
  if (isCdfResolutionStale(anchor.resolution) || anchor.resolution.status === 'unresolved') {
    return null;
  }
  const selectedDefinitions = anchor.definitionCandidates.filter((definition) => definition.selected !== false && normalizeText(definition.text).length > 0).length;
  const selectedDescriptors = anchor.descriptorGroups.reduce((total, group) => (
    group.selected === false
      ? total
      : total + group.items.filter((item) => item.selected !== false && normalizeText(item.text).length > 0).length
  ), 0);
  if (selectedDefinitions === 0 && selectedDescriptors === 0) {
    return t('selectCdfFieldsFirst', '请至少勾选一个定义或描述符条目。');
  }
  return null;
}

function cdfSearchOpen(messageId: string, anchorId: string): boolean {
  return cdfSearchOpenKeys.value.includes(cdfSearchKey(messageId, anchorId));
}

function cdfSearchBusy(messageId: string, anchorId: string): boolean {
  return cdfSearchBusyKeys.value.includes(cdfSearchKey(messageId, anchorId));
}

function cdfConceptDocumentBusy(messageId: string, anchorId: string): boolean {
  return cdfConceptDocumentBusyKeys.value.includes(cdfSearchKey(messageId, anchorId));
}

function cdfSearchQuery(messageId: string, anchorId: string): string {
  return cdfSearchQueryByKey.value[cdfSearchKey(messageId, anchorId)] ?? '';
}

function cdfSearchError(messageId: string, anchorId: string): string {
  return cdfSearchErrors.value[cdfSearchKey(messageId, anchorId)] || '';
}

function cdfConceptDocumentError(messageId: string, anchorId: string): string {
  return cdfConceptDocumentErrors.value[cdfSearchKey(messageId, anchorId)] || '';
}

function cdfSearchResults(messageId: string, anchorId: string): AIWorkbenchConceptDocumentSearchResult[] {
  return cdfSearchResultsByKey.value[cdfSearchKey(messageId, anchorId)] || [];
}

function setCdfSearchQuery(messageId: string, anchorId: string, value: string): void {
  cdfSearchQueryByKey.value = {
    ...cdfSearchQueryByKey.value,
    [cdfSearchKey(messageId, anchorId)]: normalizeText(value),
  };
}

function cdfDefinitionGroupName(messageId: string, anchorId: string): string {
  return `cdf-definition-${messageId}-${anchorId}`;
}

function canCreateCdfConceptDocument(anchor: AICdfAnchor): boolean {
  if (!selfTestTargetMemory.value || !anchor.resolution) {
    return false;
  }
  return anchor.resolution.status === 'unresolved' || isCdfResolutionStale(anchor.resolution);
}

function modeDraftError(messageId: string): string {
  return selfTestModeDraftErrors.value[messageId] || '';
}

function clearModeDraftError(messageId: string): void {
  const next = { ...selfTestModeDraftErrors.value };
  delete next[messageId];
  selfTestModeDraftErrors.value = next;
}

function selfTestMessagesInTimeline(): AIWorkbenchAssistantResultMessage[] {
  return renderEntries.value
    .map((entry) => entry.primaryMessage)
    .filter((message): message is AIWorkbenchAssistantResultMessage => (
      message.kind === 'assistant-result' && message.tabId === 'self-test-cards'
    ));
}

async function ensurePluginModeDraftsForMessage(
  messageId: string,
  cardIds?: string[],
): Promise<boolean> {
  if (!service.generateModeDrafts || !isPluginSelfTestMode(selfTestCreationMode.value)) {
    return true;
  }
  clearModeDraftError(messageId);
  if (!modeDraftBusy(messageId)) {
    selfTestModeDraftBusyMessageIds.value = [...selfTestModeDraftBusyMessageIds.value, messageId];
  }
  try {
    await service.generateModeDrafts(messageId, selfTestCreationMode.value, cardIds);
    clearModeDraftError(messageId);
    return true;
  } catch (error) {
    selfTestModeDraftErrors.value = {
      ...selfTestModeDraftErrors.value,
      [messageId]: error instanceof Error ? error.message : String(error),
    };
    return false;
  } finally {
    selfTestModeDraftBusyMessageIds.value = selfTestModeDraftBusyMessageIds.value.filter((id) => id !== messageId);
  }
}

async function ensurePluginModeDraftsForVisibleMessages(cardIds?: string[]): Promise<void> {
  if (!isPluginSelfTestMode(selfTestCreationMode.value)) {
    selfTestModeDraftBusyMessageIds.value = [];
    selfTestModeDraftErrors.value = {};
    return;
  }
  for (const message of selfTestMessagesInTimeline()) {
    await ensurePluginModeDraftsForMessage(message.id, cardIds);
  }
}

function allCandidateCardsSelected(message: AIWorkbenchAssistantResultMessage): boolean {
  const cards = candidateCards(message);
  return cards.length > 0 && cards.every((card) => card.selected !== false);
}

const selfTestStaleHint = computed(() => (
  service.isViewStale?.(undefined, 'self-test-cards' as never)
    ? t('selfTestStaleHint', '当前结果基于旧上下文，仍可查看、编辑和制卡；若想继续追问这个阶段，请先重跑。')
    : ''
));

function selfTestCardCreationDisabledReason(message: AIWorkbenchAssistantResultMessage): string | null {
  if (state.isLoading || selfTestCardCreationBusy.value || modeDraftBusy(message.id)) {
    return t('aiBusyWait', 'AI 正在处理中，请稍后再操作。');
  }
  if (validSelectedCandidateCount(message) === 0) {
    return t('selectCandidateFirst', '请先勾选至少一张包含有效草稿的自测卡片。');
  }
  if (!selfTestTargetMemory.value) {
    return t('setSelfTestTargetFirst', '请先设置制卡位置。');
  }
  return null;
}

function selfTestCreationStatusLabel(status: AIWorkbenchSelfTestCardCreationResult['itemResults'][number]['status']): string {
  switch (status) {
    case 'created':
      return t('created', '已创建');
    case 'skipped':
      return t('skipped', '已跳过');
    case 'failed':
    default:
      return t('failed', '失败');
  }
}

function messageSpeaker(message: AIWorkbenchMessage): string {
  if (message.kind === 'user') {
    return t('you', '你');
  }
  if (message.kind === 'tool-log') {
    return t('toolRuntime', '工具 Runtime');
  }
  if (message.kind === 'approval') {
    return t('approval', '审批');
  }
  return t('aiWorkbench', 'AI');
}

function messageContextItems(message: AIWorkbenchMessage): AIAttachedContextItem[] {
  if (message.kind === 'separator') {
    return [];
  }
  if ('attachedContexts' in message) {
    return message.attachedContexts;
  }
  if ('appliedContexts' in message) {
    return message.appliedContexts;
  }
  return [];
}

function relatedUserMessage(message: AIWorkbenchMessage): AIWorkbenchUserMessage | null {
  if (message.kind === 'user') {
    return message;
  }
  return service.getRelatedUserMessage?.(message.id) || null;
}

function isFailedAssistantMessage(message: AIWorkbenchMessage): message is AIWorkbenchAssistantTextMessage {
  return message.kind === 'assistant-text' && messageMeta(message)?.status === 'error';
}

function failedMessageDiagnostic(message: AIWorkbenchMessage): string | null {
  return isFailedAssistantMessage(message) ? message.failureDiagnostic?.content || null : null;
}

function canEditMessage(message: AIWorkbenchMessage): boolean {
  return message.kind === 'assistant-text' && !isFailedAssistantMessage(message);
}

function canEditUserMessage(message: AIWorkbenchMessage): boolean {
  return message.kind === 'user' && (message.purpose ?? 'follow-up') === 'follow-up';
}

function canEditFailedMessage(message: AIWorkbenchMessage): boolean {
  return isFailedAssistantMessage(message) && Boolean(relatedUserMessage(message));
}

function canRetryFailedMessage(message: AIWorkbenchMessage): boolean {
  return isFailedAssistantMessage(message);
}

function canRerunMessage(message: AIWorkbenchMessage): boolean {
  return state.activeSkillId !== 'general-chat' && message.kind === 'assistant-result';
}

function messageMeta(message: AIWorkbenchMessage) {
  return service.getMessageMeta?.(message.id) || null;
}

function isEntryExpanded(entryKey: string): boolean {
  return expandedEntryKeys.value.includes(entryKey);
}

function toggleEntryDetails(entryKey: string): void {
  expandedEntryKeys.value = isEntryExpanded(entryKey)
    ? expandedEntryKeys.value.filter((key) => key !== entryKey)
    : [...expandedEntryKeys.value, entryKey];
}

function visibleSupplementalMessages(entry: AIWorkbenchRenderEntry): AIWorkbenchMessage[] {
  return entry.supplementalMessages.filter((message) => (
    message.kind !== 'approval' || message.request.status !== 'pending'
  ));
}

function entryToolLogs(entry: AIWorkbenchRenderEntry): AIWorkbenchToolLogMessage[] {
  return visibleSupplementalMessages(entry).filter((message): message is AIWorkbenchToolLogMessage => message.kind === 'tool-log');
}

function entryApprovalHistory(entry: AIWorkbenchRenderEntry): AIWorkbenchApprovalMessage[] {
  return visibleSupplementalMessages(entry).filter((message): message is AIWorkbenchApprovalMessage => message.kind === 'approval');
}

function entryReasoningContent(entry: AIWorkbenchRenderEntry): string | null {
  const message = entry.primaryMessage;
  if (message.kind !== 'assistant-text' && message.kind !== 'assistant-result') {
    return null;
  }
  return message.reasoningContent || null;
}

function entryDiagnostics(entry: AIWorkbenchRenderEntry): string[] {
  const message = entry.primaryMessage;
  if (message.kind !== 'assistant-text' && message.kind !== 'assistant-result') {
    return [];
  }
  return message.diagnostics || [];
}

function entryHasDetails(entry: AIWorkbenchRenderEntry): boolean {
  return visibleSupplementalMessages(entry).length > 0
    || Boolean(entryReasoningContent(entry))
    || entryDiagnostics(entry).length > 0;
}

function entryDetailsLabel(entry: AIWorkbenchRenderEntry): string {
  const toolLogs = entryToolLogs(entry);
  if (toolLogs.length > 0) {
    const rounds = Math.max(...toolLogs.map((detail) => detail.roundIndex || 0), 0);
    const duration = toolLogs.reduce((total, detail) => total + (detail.durationMs || 0), 0);
    const summary = [`${t('toolCallsLabel', '工具调用')}（${toolLogs.length} ${t('toolCalls', '次')}`];
    if (rounds > 0) {
      summary.push(`${rounds} ${t('rounds', '轮')}`);
    }
    summary[0] = `${summary[0]}${summary.length > 1 ? ' · ' : ''}${summary.slice(1).join(' · ')}`.trimEnd();
    summary.splice(1);
    summary[0] = `${summary[0]}）`;
    if (duration > 0) {
      summary.push(`${(duration / 1000).toFixed(duration >= 10000 ? 0 : 1)}s`);
    }
    return summary.join(' · ');
  }
  if (entry.stepCount > 0 || entryApprovalHistory(entry).length > 0) {
    return `${entry.stepCount} ${t('steps', '个步骤')}`;
  }
  return t('viewDetails', '查看详情');
}

function toolLogMeta(detail: AIWorkbenchToolLogMessage): string {
  const parts = [detail.status];
  if (detail.roundIndex) {
    parts.push(`${t('round', '轮次')} ${detail.roundIndex}`);
  }
  if (detail.durationMs) {
    parts.push(`${detail.durationMs}ms`);
  }
  if (detail.llmUsage?.totalTokens) {
    parts.push(`${detail.llmUsage.totalTokens} tokens`);
  }
  return parts.join(' · ');
}

function approvalArgsText(request: AIChatApprovalRequest): string {
  return request.argsText || JSON.stringify(request.args, null, 2);
}

function messageFooterMeta(message: AIWorkbenchMessage): string {
  const meta = messageMeta(message);
  const parts: string[] = [];
  if ((meta?.versionCount || 0) > 1) {
    parts.push(`${meta?.versionCount} ${t('versions', '个版本')}`);
  }
  if ((meta?.branchCount || 0) > 0) {
    parts.push(`${meta?.branchCount} ${t('branches', '个分支')}`);
  }
  if (message.kind === 'assistant-text' && message.content) {
    parts.push(`${message.content.length} ${t('characters', '字')}`);
  }
  return parts.join(' · ') || t('messageActions', '消息操作');
}

function treeNodeTitle(node: { message: AIWorkbenchMessage | null; kind: string }): string {
  if (node.kind === 'separator') {
    return t('separator', '分隔');
  }
  return node.message ? messageSpeaker(node.message) : t('aiWorkbench', 'AI');
}

function treeNodePreview(node: { message: AIWorkbenchMessage | null; kind: string }): string {
  const message = node.message;
  if (!message) {
    return '';
  }
  if (message.kind === 'assistant-result') {
    return JSON.stringify(message.genericSectionResult ?? message.tabResult ?? message.genericStructuredResult ?? message.conceptCoachResult ?? null);
  }
  if (message.kind === 'separator') {
    return message.label;
  }
  if (message.kind === 'approval') {
    return message.request.title;
  }
  return message.content;
}

function prepareDefaultSkillPrompt(): void {
  closeContextMenu();
  if (!composerValue.value.trim()) {
    composerValue.value = defaultUserPrompt.value;
  }
  focusComposerInput();
}

async function runActiveTab(): Promise<void> {
  closeContextMenu();
  composerValue.value = '';
  if (service.runActiveTab) {
    await service.runActiveTab();
  } else {
    await service.runExplain?.();
  }
}

function focusComposerInput(): void {
  void nextTick(() => {
    composerInputRef.value?.focus();
    const end = composerValue.value.length;
    composerInputRef.value?.setSelectionRange(end, end);
  });
}

async function submitComposer(): Promise<void> {
  closeContextMenu();
  if (sendDisabled.value) {
    return;
  }
  const content = composerValue.value.trim();
  if (!content) {
    return;
  }
  const previousComposerValue = composerValue.value;
  composerValue.value = '';
  try {
    if (!currentTabHasResult.value) {
      if (service.submitSkillPrompt) {
        await service.submitSkillPrompt(content);
      } else {
        await service.submitExplainPrompt(content);
      }
    } else {
      await service.submitFollowUp(content);
    }
  } catch (error) {
    composerValue.value = previousComposerValue;
    throw error;
  }
}

function handleComposerAction(): void {
  if (state.isLoading) {
    closeContextMenu();
    service.cancelCurrentRun?.();
    return;
  }
  void submitComposer();
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) {
    return;
  }
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (state.isLoading) {
    return;
  }
  event.preventDefault();
  void submitComposer();
}

async function copyMessage(message: AIWorkbenchMessage): Promise<void> {
  const content = message.kind === 'assistant-result'
    ? JSON.stringify(message.genericSectionResult ?? message.tabResult ?? message.genericStructuredResult ?? message.conceptCoachResult ?? null, null, 2)
    : message.kind === 'separator'
      ? message.label
    : message.kind === 'approval'
      ? JSON.stringify(message.request, null, 2)
      : message.content;
  await navigator.clipboard?.writeText(content || '');
}

function openTextMessageEditor(message: AIWorkbenchMessage): void {
  if (message.kind !== 'assistant-text') {
    return;
  }
  editingMode.value = 'assistant-text';
  editingMessageId.value = message.id;
  editorReadonly.value = false;
  editorTitle.value = t('edit', '编辑');
  editorValue.value = message.content;
  editorPlaceholder.value = '';
  editorConfirmLabel.value = t('save', '保存');
  editorOpen.value = true;
}

function openUserMessageEditor(message: AIWorkbenchUserMessage): void {
  editingMode.value = 'user-message';
  editingMessageId.value = message.id;
  editingSourceUserMessage.value = message;
  editorReadonly.value = false;
  editorTitle.value = t('editAndResend', '编辑后重发');
  editorValue.value = message.content;
  editorPlaceholder.value = t('askAnything', '继续追问');
  editorConfirmLabel.value = t('send', '发送');
  editorOpen.value = true;
}

function prepareEditedFollowUp(message: AIWorkbenchMessage): void {
  if (message.kind !== 'user') {
    return;
  }
  openUserMessageEditor(message);
}

function prepareFailedMessageEdit(message: AIWorkbenchMessage): void {
  const sourceMessage = relatedUserMessage(message);
  if (!sourceMessage) {
    return;
  }
  openUserMessageEditor(sourceMessage);
}

function openComposerEditor(): void {
  closeContextMenu();
  editingMode.value = 'composer';
  editingMessageId.value = null;
  editorReadonly.value = false;
  editorTitle.value = t('largeEditor', '展开输入框');
  editorValue.value = composerValue.value;
  editorPlaceholder.value = composerPlaceholder.value;
  editorConfirmLabel.value = t('apply', '应用');
  editorOpen.value = true;
}

function previewContextItem(contextItem: AIAttachedContextItem): void {
  editingMode.value = 'context';
  editingMessageId.value = null;
  editorReadonly.value = true;
  editorTitle.value = contextItem.title;
  editorValue.value = contextItem.content;
  editorPlaceholder.value = '';
  editorConfirmLabel.value = t('save', '保存');
  editorOpen.value = true;
}

function openCandidateEditor(message: AIWorkbenchAssistantResultMessage, card: AIConceptCoachCandidateCard): void {
  editingMode.value = 'candidate-card';
  editingMessageId.value = message.id;
  editingCandidateId.value = card.id;
  editorReadonly.value = false;
  editorTitle.value = t('editCandidateCard', '编辑候选卡');
  editorValue.value = [
    `当前渲染模式：${selfTestModeLabel(selfTestCreationMode.value)}`,
    `类型：${card.kind}`,
    `摘要：${candidateSummary(card)}`,
    '',
    '问题：',
    card.prompt || card.question || '',
    '',
    '答案：',
    card.answer || '',
    '',
    '补充要点：',
    (card.details || []).join('\n'),
    '',
    '挖空目标：',
    (card.clozeTargets || []).join('\n'),
  ].join('\n');
  editorPlaceholder.value = '当前渲染模式：列表项块\n类型：定义\n摘要：用一句话说明这张草稿在考什么\n\n问题：\n题面\n\n答案：\n答案\n\n补充要点：\n补充 1\n补充 2\n\n挖空目标：\n关键词 1\n关键词 2';
  editorConfirmLabel.value = t('save', '保存');
  editorOpen.value = true;
}

function parseCandidateEditorSection(value: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}[:：]\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n(?:问题|答案|补充要点|挖空目标)[:：]\\s*\\r?\\n|$)`);
  const match = value.match(pattern);
  return normalizeText(match?.[1] || '');
}

function parseCandidateEditorListSection(value: string, label: string): string[] {
  return parseCandidateEditorSection(value, label)
    .split(/\r?\n/)
    .map((line) => normalizeText(line.replace(/^[-*+]\s+/, '')))
    .filter(Boolean);
}

function parseCandidateEditorValue(
  value: string,
): Partial<Pick<AIConceptCoachCandidateCard, 'summary' | 'prompt' | 'answer' | 'details' | 'clozeTargets' | 'kind'>> {
  const headerLines = value.split(/\r?\n/);
  const summary = normalizeText(headerLines.find((line) => /^摘要[:：]/.test(line))?.replace(/^摘要[:：]/, ''));
  const kind = normalizeText(headerLines.find((line) => /^类型[:：]/.test(line))?.replace(/^类型[:：]/, '')) as AIConceptCoachCardKind;
  return {
    summary,
    prompt: parseCandidateEditorSection(value, '问题'),
    answer: parseCandidateEditorSection(value, '答案'),
    details: parseCandidateEditorListSection(value, '补充要点'),
    clozeTargets: parseCandidateEditorListSection(value, '挖空目标'),
    kind,
  };
}

async function setWorkbenchSelfTestMode(mode: AIConceptCoachSelfTestCreationMode): Promise<void> {
  if (selfTestCreationMode.value === mode) {
    return;
  }
  selfTestCreationMode.value = await service.setSelfTestCreationMode?.(mode) || mode;
  selfTestCardCreationError.value = '';
  selfTestCreationResult.value = null;
  if (isPluginSelfTestMode(selfTestCreationMode.value)) {
    await ensurePluginModeDraftsForVisibleMessages();
    return;
  }
  selfTestModeDraftBusyMessageIds.value = [];
  selfTestModeDraftErrors.value = {};
}

async function toggleCandidate(messageId: string, cardId: string, event: Event): Promise<void> {
  const target = event.target;
  const selected = target instanceof HTMLInputElement ? target.checked : true;
  await service.updateCandidateCard(messageId, cardId, { selected });
}

async function toggleAllCandidates(message: AIWorkbenchAssistantResultMessage): Promise<void> {
  await service.setCandidateCardsSelected?.(message.id, !allCandidateCardsSelected(message));
}

function applySelfTestTargetMemory(memory: AIWorkbenchSelfTestCardTargetMemory | null): void {
  if (!memory) {
    return;
  }
  selfTestTargetMemory.value = memory;
  selfTestTargetMode.value = memory.mode;
  selfTestTargetNotebookId.value = memory.notebookId;
  selfTestTargetNotebookName.value = memory.notebookName;
  selfTestTargetBlockId.value = memory.targetBlockId || '';
}

async function loadSelfTestTargetState(force = false): Promise<void> {
  if (selfTestTargetLoaded.value && !force) {
    return;
  }
  if (!service.listSelfTestCardTargetNotebooks && !service.getSelfTestCardTargetMemory) {
    selfTestTargetLoaded.value = true;
    return;
  }
  selfTestTargetLoading.value = true;
  selfTestTargetError.value = '';
  try {
    const [notebooks, memory] = await Promise.all([
      service.listSelfTestCardTargetNotebooks?.() || Promise.resolve([]),
      service.getSelfTestCardTargetMemory?.() || Promise.resolve(null),
    ]);
    selfTestTargetNotebooks.value = notebooks;
    applySelfTestTargetMemory(memory);
    if (!selfTestTargetNotebookId.value && notebooks.length > 0) {
      selfTestTargetNotebookId.value = notebooks[0].id;
      selfTestTargetNotebookName.value = notebooks[0].name;
    }
    selfTestTargetLoaded.value = true;
  } catch (error) {
    selfTestTargetError.value = error instanceof Error ? error.message : String(error);
  } finally {
    selfTestTargetLoading.value = false;
  }
}

async function openSelfTestTargetDialog(): Promise<void> {
  await loadSelfTestTargetState();
  selfTestTargetError.value = '';
  selfTestTargetDialogOpen.value = true;
}

function closeSelfTestTargetDialog(): void {
  selfTestTargetDialogOpen.value = false;
}

function syncSelfTestNotebookName(): void {
  const notebook = selfTestTargetNotebooks.value.find((entry) => entry.id === selfTestTargetNotebookId.value);
  selfTestTargetNotebookName.value = notebook?.name || selfTestTargetNotebookId.value;
}

function buildSelfTestTargetInput(): AIWorkbenchSelfTestCardTargetInput | null {
  syncSelfTestNotebookName();
  const notebookId = normalizeText(selfTestTargetNotebookId.value);
  if (!notebookId) {
    selfTestTargetError.value = t('selectNotebookFirst', '请选择目标笔记本。');
    return null;
  }
  if (selfTestTargetMode.value === 'block' && !normalizeText(selfTestTargetBlockId.value)) {
    selfTestTargetError.value = t('fillTargetBlockId', '请填写目标文档或块 ID。');
    return null;
  }
  return {
    mode: selfTestTargetMode.value,
    notebookId,
    notebookName: selfTestTargetNotebookName.value || notebookId,
    targetBlockId: selfTestTargetMode.value === 'block' ? normalizeText(selfTestTargetBlockId.value) : null,
  };
}

function buildTargetInputFromMemory(memory: AIWorkbenchSelfTestCardTargetMemory): AIWorkbenchSelfTestCardTargetInput {
  return {
    mode: memory.mode,
    notebookId: memory.notebookId,
    notebookName: memory.notebookName,
    targetBlockId: memory.targetBlockId,
    targetLabel: memory.targetLabel,
  };
}

function cdfMessagesInTimeline(): AIWorkbenchAssistantResultMessage[] {
  return renderEntries.value
    .map((entry) => entry.primaryMessage)
    .filter((message): message is AIWorkbenchAssistantResultMessage => isCdfStructureMessage(message));
}

function clearCdfPreviewError(messageId: string): void {
  const next = { ...cdfPreviewErrors.value };
  delete next[messageId];
  cdfPreviewErrors.value = next;
}

async function previewCdfMessage(
  message: AIWorkbenchAssistantResultMessage,
  force = false,
): Promise<void> {
  if (!service.previewCdfStructure || !selfTestTargetMemory.value || !isCdfStructureMessage(message)) {
    return;
  }
  const previewKey = cdfPreviewTargetKey.value;
  if (!previewKey) {
    return;
  }
  if (!force && cdfPreviewByMessageId.value[message.id]) {
    return;
  }
  if (!cdfPreviewBusy(message.id)) {
    cdfPreviewBusyMessageIds.value = [...cdfPreviewBusyMessageIds.value, message.id];
  }
  clearCdfPreviewError(message.id);
  try {
    const preview = await service.previewCdfStructure(message.id, selfTestTargetMemory.value, {
      forceResolve: force,
    });
    cdfPreviewByMessageId.value = {
      ...cdfPreviewByMessageId.value,
      [message.id]: preview,
    };
    cdfPreviewKeyByMessageId.value = {
      ...cdfPreviewKeyByMessageId.value,
      [message.id]: previewKey,
    };
  } catch (error) {
    cdfPreviewErrors.value = {
      ...cdfPreviewErrors.value,
      [message.id]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cdfPreviewBusyMessageIds.value = cdfPreviewBusyMessageIds.value.filter((id) => id !== message.id);
  }
}

async function previewVisibleCdfMessages(force = false): Promise<void> {
  if (!selfTestTargetMemory.value) {
    return;
  }
  for (const message of cdfMessagesInTimeline()) {
    await previewCdfMessage(message, force);
  }
}

function cdfCardCreationDisabledReason(message: AIWorkbenchAssistantResultMessage): string | null {
  if (state.isLoading || cdfCreationBusy.value || cdfPreviewBusy(message.id)) {
    return t('aiBusyWait', 'AI 正在处理中，请稍后再操作。');
  }
  if (!selfTestTargetMemory.value) {
    return t('setSelfTestTargetFirst', '请先设置制卡位置。');
  }
  const anchors = cdfAnchors(message).filter((anchor) => anchor.selected !== false);
  if (anchors.length === 0) {
    return t('selectConceptFirst', '请先勾选至少一个概念锚点。');
  }
  if (anchors.every((anchor) => !hasUsableCdfResolution(anchor))) {
    return t('noResolvedConcepts', '当前没有解析到可建卡的概念文档。');
  }
  if (!anchors.some((anchor) => cdfAnchorCreationHint(anchor) === null)) {
    return t('selectCdfFieldsFirst', '请至少勾选一个定义或描述符条目。');
  }
  return null;
}

async function toggleCdfAnchor(messageId: string, anchorId: string, event: Event): Promise<void> {
  const target = event.target;
  const selected = target instanceof HTMLInputElement ? target.checked : true;
  await service.setCdfAnchorSelected?.(messageId, anchorId, selected);
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
}

async function selectCdfDefinition(messageId: string, anchorId: string, definitionId: string): Promise<void> {
  await service.setCdfDefinitionSelected?.(messageId, anchorId, definitionId, true);
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
}

async function clearCdfDefinitionSelectionForAnchor(messageId: string, anchorId: string): Promise<void> {
  await service.clearCdfDefinitionSelection?.(messageId, anchorId);
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
}

async function toggleCdfDescriptorGroup(messageId: string, anchorId: string, groupId: string, event: Event): Promise<void> {
  const target = event.target;
  const selected = target instanceof HTMLInputElement ? target.checked : true;
  await service.setCdfDescriptorGroupSelected?.(messageId, anchorId, groupId, selected);
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
}

async function toggleCdfDescriptorItem(
  messageId: string,
  anchorId: string,
  groupId: string,
  itemId: string,
  event: Event,
): Promise<void> {
  const target = event.target;
  const selected = target instanceof HTMLInputElement ? target.checked : true;
  await service.setCdfDescriptorItemSelected?.(messageId, anchorId, groupId, itemId, selected);
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
}

async function confirmSelfTestTarget(): Promise<void> {
  const target = buildSelfTestTargetInput();
  if (!target) {
    return;
  }
  const targetLabel = target.mode === 'daily-note'
    ? `${target.notebookName || target.notebookId} · ${t('todayDailyNote', '今日日记')}`
    : `${target.notebookName || target.notebookId} · ${target.targetBlockId}`;
  const memory: AIWorkbenchSelfTestCardTargetMemory = {
    mode: target.mode,
    notebookId: target.notebookId,
    notebookName: target.notebookName || target.notebookId,
    targetBlockId: target.mode === 'block' ? target.targetBlockId || null : null,
    targetLabel,
    updatedAt: Date.now(),
  };
  try {
    const saved = await service.saveSelfTestCardTargetMemory?.(memory);
    selfTestTargetMemory.value = saved || memory;
    closeSelfTestTargetDialog();
  } catch (error) {
    selfTestTargetError.value = error instanceof Error ? error.message : String(error);
  }
}

async function createSelfTestCards(message: AIWorkbenchAssistantResultMessage): Promise<void> {
  const disabledReason = selfTestCardCreationDisabledReason(message);
  if (disabledReason) {
    selfTestCardCreationError.value = disabledReason;
    return;
  }
  if (!selfTestTargetMemory.value) {
    await openSelfTestTargetDialog();
    return;
  }
  selfTestCardCreationBusy.value = true;
  selfTestCardCreationError.value = '';
  selfTestCreationResult.value = null;
  try {
    if (isPluginSelfTestMode(selfTestCreationMode.value)) {
      const ready = await ensurePluginModeDraftsForMessage(message.id);
      if (!ready) {
        return;
      }
    }
    const result = await service.createSelfTestCardsFromSelectedCandidates?.(selfTestTargetMemory.value, message.id);
    if (!result) {
      throw new Error(t('selfTestCreationUnavailable', '当前运行时暂不支持自测卡片制卡。'));
    }
    selfTestCreationResult.value = result;
    selfTestTargetMemory.value = result.target;
  } catch (error) {
    selfTestCardCreationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    selfTestCardCreationBusy.value = false;
  }
}

async function createCdfCards(message: AIWorkbenchAssistantResultMessage): Promise<void> {
  const disabledReason = cdfCardCreationDisabledReason(message);
  if (disabledReason) {
    cdfCreationError.value = disabledReason;
    if (!selfTestTargetMemory.value) {
      await openSelfTestTargetDialog();
    }
    return;
  }
  if (!selfTestTargetMemory.value || !service.createCdfCardsFromSelectedAnchors) {
    return;
  }
  cdfCreationBusy.value = true;
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
  try {
    const result = await service.createCdfCardsFromSelectedAnchors(
      buildTargetInputFromMemory(selfTestTargetMemory.value),
      message.id,
    );
    cdfCreationResult.value = result;
    selfTestTargetMemory.value = result.target;
  } catch (error) {
    cdfCreationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    cdfCreationBusy.value = false;
  }
}

async function sendAssistantResultToSiyuan(message: AIWorkbenchAssistantResultMessage): Promise<void> {
  if (!service.sendAssistantResultToSiyuan) {
    return;
  }
  if (!selfTestTargetMemory.value) {
    await openSelfTestTargetDialog();
    return;
  }
  if (!sendToSiyuanBusyMessageIds.value.includes(message.id)) {
    sendToSiyuanBusyMessageIds.value = [...sendToSiyuanBusyMessageIds.value, message.id];
  }
  sendToSiyuanErrors.value = {
    ...sendToSiyuanErrors.value,
    [message.id]: '',
  };
  try {
    const result = await service.sendAssistantResultToSiyuan(
      buildTargetInputFromMemory(selfTestTargetMemory.value),
      message.id,
    );
    sendToSiyuanResults.value = {
      ...sendToSiyuanResults.value,
      [message.id]: result,
    };
    selfTestTargetMemory.value = result.target;
  } catch (error) {
    sendToSiyuanErrors.value = {
      ...sendToSiyuanErrors.value,
      [message.id]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    sendToSiyuanBusyMessageIds.value = sendToSiyuanBusyMessageIds.value.filter((id) => id !== message.id);
  }
}

function sendToSiyuanBusy(messageId: string): boolean {
  return sendToSiyuanBusyMessageIds.value.includes(messageId);
}

function sendToSiyuanError(messageId: string): string {
  return sendToSiyuanErrors.value[messageId] || '';
}

function sendToSiyuanResult(messageId: string): AIWorkbenchSendToSiyuanResult | null {
  return sendToSiyuanResults.value[messageId] || null;
}

function canSendAssistantResultToSiyuan(message: AIWorkbenchMessage): message is AIWorkbenchAssistantResultMessage {
  return message.kind === 'assistant-result'
    && message.skillId === AI_CONCEPT_COACH_SKILL_ID
    && typeof service.sendAssistantResultToSiyuan === 'function';
}

async function toggleCdfConceptSearch(message: AIWorkbenchAssistantResultMessage, anchor: AICdfAnchor): Promise<void> {
  const key = cdfSearchKey(message.id, anchor.id);
  if (cdfSearchOpen(message.id, anchor.id)) {
    cdfSearchOpenKeys.value = cdfSearchOpenKeys.value.filter((entry) => entry !== key);
    return;
  }
  cdfSearchOpenKeys.value = [...cdfSearchOpenKeys.value, key];
  if (!Object.prototype.hasOwnProperty.call(cdfSearchQueryByKey.value, key)) {
    cdfSearchQueryByKey.value = {
      ...cdfSearchQueryByKey.value,
      [key]: anchor.conceptName,
    };
    await runCdfConceptSearch(message, anchor);
  }
}

async function handleCdfSearchEnter(
  message: AIWorkbenchAssistantResultMessage,
  anchor: AICdfAnchor,
  event: KeyboardEvent,
): Promise<void> {
  const composingEvent = event as KeyboardEvent & { keyCode?: number };
  if (event.isComposing || composingEvent.keyCode === 229) {
    return;
  }
  await runCdfConceptSearch(message, anchor);
}

async function runCdfConceptSearch(message: AIWorkbenchAssistantResultMessage, anchor: AICdfAnchor): Promise<void> {
  if (!service.searchCdfConceptDocuments) {
    return;
  }
  if (!selfTestTargetMemory.value) {
    await openSelfTestTargetDialog();
    return;
  }
  const key = cdfSearchKey(message.id, anchor.id);
  if (!cdfSearchBusyKeys.value.includes(key)) {
    cdfSearchBusyKeys.value = [...cdfSearchBusyKeys.value, key];
  }
  cdfConceptDocumentErrors.value = {
    ...cdfConceptDocumentErrors.value,
    [key]: '',
  };
  cdfSearchErrors.value = {
    ...cdfSearchErrors.value,
    [key]: '',
  };
  try {
    const query = cdfSearchQuery(message.id, anchor.id);
    const results = await service.searchCdfConceptDocuments(
      selfTestTargetMemory.value,
      query,
    );
    cdfSearchResultsByKey.value = {
      ...cdfSearchResultsByKey.value,
      [key]: results,
    };
  } catch (error) {
    cdfSearchErrors.value = {
      ...cdfSearchErrors.value,
      [key]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cdfSearchBusyKeys.value = cdfSearchBusyKeys.value.filter((entry) => entry !== key);
  }
}

async function selectCdfConceptDocument(
  message: AIWorkbenchAssistantResultMessage,
  anchor: AICdfAnchor,
  document: AIWorkbenchConceptDocumentSearchResult,
): Promise<void> {
  if (!service.setCdfAnchorManualResolution || !selfTestTargetMemory.value) {
    return;
  }
  const key = cdfSearchKey(message.id, anchor.id);
  await service.setCdfAnchorManualResolution(message.id, anchor.id, selfTestTargetMemory.value, document);
  clearCdfPreviewState(message.id);
  cdfSearchOpenKeys.value = cdfSearchOpenKeys.value.filter((entry) => entry !== key);
  cdfConceptDocumentErrors.value = {
    ...cdfConceptDocumentErrors.value,
    [key]: '',
  };
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
}

async function createAndBindCdfConceptDocument(
  message: AIWorkbenchAssistantResultMessage,
  anchor: AICdfAnchor,
): Promise<void> {
  if (!service.createAndBindCdfConceptDocument) {
    return;
  }
  if (!selfTestTargetMemory.value) {
    await openSelfTestTargetDialog();
    return;
  }
  const key = cdfSearchKey(message.id, anchor.id);
  if (!cdfConceptDocumentBusyKeys.value.includes(key)) {
    cdfConceptDocumentBusyKeys.value = [...cdfConceptDocumentBusyKeys.value, key];
  }
  cdfConceptDocumentErrors.value = {
    ...cdfConceptDocumentErrors.value,
    [key]: '',
  };
  try {
    await service.createAndBindCdfConceptDocument(message.id, anchor.id, selfTestTargetMemory.value);
    clearCdfPreviewState(message.id);
    cdfSearchOpenKeys.value = cdfSearchOpenKeys.value.filter((entry) => entry !== key);
    cdfCreationError.value = '';
    cdfCreationResult.value = null;
  } catch (error) {
    cdfConceptDocumentErrors.value = {
      ...cdfConceptDocumentErrors.value,
      [key]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cdfConceptDocumentBusyKeys.value = cdfConceptDocumentBusyKeys.value.filter((entry) => entry !== key);
  }
}

async function restoreCdfConceptAutoResolution(message: AIWorkbenchAssistantResultMessage, anchor: AICdfAnchor): Promise<void> {
  if (!service.restoreCdfAnchorAutoResolution) {
    return;
  }
  await service.restoreCdfAnchorAutoResolution(message.id, anchor.id);
  clearCdfPreviewState(message.id);
  cdfConceptDocumentErrors.value = {
    ...cdfConceptDocumentErrors.value,
    [cdfSearchKey(message.id, anchor.id)]: '',
  };
  cdfCreationError.value = '';
  cdfCreationResult.value = null;
  if (selfTestTargetMemory.value) {
    await previewCdfMessage(message, true);
  }
}

async function resolveApproval(approvalId: string, approved: boolean): Promise<void> {
  await service.resolveToolApproval?.(approvalId, approved);
}

async function toggleMessageHidden(message: AIWorkbenchMessage): Promise<void> {
  await service.toggleMessageHidden?.(message.id);
}

async function toggleMessagePinned(message: AIWorkbenchMessage): Promise<void> {
  await service.toggleMessagePinned?.(message.id);
}

async function insertSeparatorAfter(message: AIWorkbenchMessage): Promise<void> {
  await service.insertSeparatorAfterMessage?.(message.id);
}

async function branchFromMessage(message: AIWorkbenchMessage): Promise<void> {
  await service.branchFromMessage?.(message.id);
}

async function cycleMessageVersion(message: AIWorkbenchMessage): Promise<void> {
  await service.cycleMessageVersion?.(message.id);
}

function resolveMenuAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function openMessageToolbarMenu(message: AIWorkbenchMessage, event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();

  const menu = new Menu('ai-chat-message-toolbar-menu');
  const meta = messageMeta(message);

  menu.addItem({
    label: meta?.hidden ? t('showInContext', '恢复上下文') : t('hideFromContext', '隐藏上下文'),
    click: () => {
      void toggleMessageHidden(message);
    },
  });

  if ((meta?.versionCount || 0) > 1) {
    menu.addItem({
      label: t('switchVersion', '切版本'),
      click: () => {
        void cycleMessageVersion(message);
      },
    });
  }

  menu.addItem({
    label: t('insertSeparator', '插入分隔'),
    click: () => {
      void insertSeparatorAfter(message);
    },
  });

  const anchor = resolveMenuAnchor(event.currentTarget) || resolveMenuAnchor(event.target);
  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    menu.open({
      x: rect.right,
      y: rect.bottom,
      isLeft: true,
    });
    return;
  }

  menu.open({
    x: event.clientX,
    y: event.clientY,
    isLeft: true,
  });
}

async function focusTreeNode(nodeId: string): Promise<void> {
  await service.focusTreeNode?.(nodeId);
}

async function rerunMessage(message: AIWorkbenchMessage): Promise<void> {
  if (service.rerunFromMessage) {
    await service.rerunFromMessage(message.id);
    return;
  }
  await runActiveTab();
}

async function retryFailedMessage(message: AIWorkbenchMessage): Promise<void> {
  if (service.retryFailedMessage) {
    await service.retryFailedMessage(message.id);
    return;
  }
  await rerunMessage(message);
}

function closeContextMenu(): void {
  contextMenuOpen.value = false;
}

function toggleContextMenu(): void {
  contextMenuOpen.value = !contextMenuOpen.value;
}

function handleDocumentPointerDown(event: Event): void {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (contextMenuOpen.value) {
    if (contextMenuRef.value?.contains(target) || contextMenuToggleRef.value?.contains(target)) {
      return;
    }
    closeContextMenu();
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') {
    return;
  }
  closeContextMenu();
}

async function handleContextProvider(provider: ContextProvider): Promise<void> {
  closeContextMenu();
  if (provider.inputKind === 'none') {
    await service.attachContextFromProvider(provider.key);
    return;
  }
  pendingProvider.value = provider;
  editingMode.value = 'provider';
  editorReadonly.value = false;
  editorTitle.value = provider.title;
  editorValue.value = '';
  editorPlaceholder.value = provider.description;
  editorConfirmLabel.value = t('attachContext', '挂到这次发送');
  editorOpen.value = true;
}

async function confirmEditor(): Promise<void> {
  if (editingMode.value === 'assistant-text' && editingMessageId.value) {
    await service.updateAssistantTextMessage(editingMessageId.value, editorValue.value);
  } else if (editingMode.value === 'user-message' && editingSourceUserMessage.value) {
    const sourceMessage = editingSourceUserMessage.value;
    const resendOptions = {
      editedFromMessageId: sourceMessage.id,
      attachedContexts: sourceMessage.attachedContexts,
    };
    if (sourceMessage.skillId === 'general-chat' || (sourceMessage.purpose ?? 'follow-up') === 'follow-up') {
      await service.submitFollowUp(editorValue.value, resendOptions);
    } else {
      await service.submitSkillPrompt(editorValue.value, resendOptions);
    }
    composerValue.value = '';
  } else if (editingMode.value === 'composer') {
    composerValue.value = editorValue.value;
    focusComposerInput();
  } else if (editingMode.value === 'provider' && pendingProvider.value) {
    await service.attachContextFromProvider(pendingProvider.value.key, editorValue.value);
  } else if (editingMode.value === 'candidate-card' && editingMessageId.value && editingCandidateId.value) {
    await service.updateCandidateCard(editingMessageId.value, editingCandidateId.value, parseCandidateEditorValue(editorValue.value));
    if (isPluginSelfTestMode(selfTestCreationMode.value)) {
      await ensurePluginModeDraftsForMessage(editingMessageId.value, [editingCandidateId.value]);
    }
  }
  closeEditor();
}

function closeEditor(): void {
  editorOpen.value = false;
  editingMode.value = null;
  editingMessageId.value = null;
  editingCandidateId.value = null;
  editingSourceUserMessage.value = null;
  pendingProvider.value = null;
}

async function createNewSession(): Promise<void> {
  await service.createNewSession();
}

async function openHistorySession(sessionId: string): Promise<void> {
  await service.openSession(sessionId);
  service.setHistoryPanelOpen(false);
}

async function renameHistorySession(sessionId: string, currentTitle: string): Promise<void> {
  const nextTitle = window.prompt(t('rename', '重命名'), currentTitle)?.trim();
  if (!nextTitle || nextTitle === currentTitle) {
    return;
  }
  await service.renameSession(sessionId, nextTitle);
}

async function deleteHistorySession(sessionId: string): Promise<void> {
  await service.deleteSession(sessionId);
}

async function deleteCurrentSession(): Promise<void> {
  await service.deleteSession();
}

async function openAiSettings(): Promise<void> {
  await getDialogManager()?.openSettingsDialog?.('ai');
}

watch(
  () => ({
    activeTabId: state.activeTabId,
    targetKey: cdfPreviewTargetKey.value,
    messageIds: cdfMessagesInTimeline().map((message) => message.id).join('|'),
  }),
  (value) => {
    if (!value.targetKey) {
      cdfPreviewByMessageId.value = {};
      cdfPreviewKeyByMessageId.value = {};
      cdfPreviewErrors.value = {};
      cdfConceptDocumentErrors.value = {};
      return;
    }
    if (value.activeTabId === 'cdf-structure') {
      void previewVisibleCdfMessages();
    }
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
  selfTestCreationMode.value = service.getSelfTestCreationMode?.() || selfTestCreationMode.value;
  void loadSelfTestTargetState();
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeydown);
});
</script>

<style scoped>
.ai-chat { display: flex; height: 100%; min-height: 0; background: #f7f8fb; color: #1f2430; }
.ai-chat--compact { background: #fafbfd; }
.ai-chat__history { width: 260px; border-right: 1px solid #e6e9f0; background: #ffffff; display: flex; flex-direction: column; min-height: 0; }
.ai-chat__tree { width: 280px; border-right: 1px solid #e6e9f0; background: #fcfdff; display: flex; flex-direction: column; min-height: 0; }
.ai-chat__main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.ai-chat__topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px 6px; border-bottom: 1px solid #e6e9f0; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); }
.ai-chat__topbar-main { display: grid; gap: 2px; min-width: 0; flex: 1; }
.ai-chat__headline { white-space: nowrap; font-size: 14px; line-height: 1.2; font-weight: 700; color: #111827; }
.ai-chat__subhead { color: #6b7280; font-size: 12px; }
.ai-chat__topbar-actions { display: flex; align-items: center; gap: 6px; padding-top: 1px; }
.ai-chat__icon-button { width: 28px; height: 28px; border: 1px solid #d9deea; border-radius: 7px; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: #667085; }
.ai-chat__icon-button svg { width: 14px; height: 14px; }
.ai-chat__icon-button span { font-size: 16px; line-height: 1; }
.ai-chat__skill-switch { display: flex; gap: 8px; overflow-x: auto; padding: 8px 10px 0; background: #fff; }
.ai-chat__skill-pill { min-width: 150px; border: 1px solid #dfe5ef; border-radius: 999px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); padding: 7px 12px; display: grid; gap: 2px; text-align: left; }
.ai-chat__skill-pill strong { font-size: 12px; color: #1f2937; }
.ai-chat__skill-pill span { font-size: 10px; color: #7b8494; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-chat__skill-pill--active { border-color: #91a9ff; background: linear-gradient(180deg, #f6f9ff 0%, #eaf1ff 100%); box-shadow: inset 0 0 0 1px rgba(80, 118, 255, 0.18); }
.ai-chat__tabs { display: flex; gap: 8px; overflow-x: auto; padding: 8px 10px; border-bottom: 1px solid #e6e9f0; background: #fff; }
.ai-chat__tab { min-width: 128px; border: 1px solid #e1e6ef; border-radius: 9px; background: #fbfcff; padding: 8px 10px; display: grid; gap: 3px; text-align: left; }
.ai-chat__tab strong { font-size: 12px; color: #1f2937; }
.ai-chat__tab span { font-size: 11px; color: #7f8797; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-chat__tab--active { border-color: #9fb7ff; background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%); box-shadow: inset 0 0 0 1px rgba(96, 132, 255, 0.18); }
.ai-chat__history-head, .ai-chat__section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ai-chat__history-head { padding: 12px; border-bottom: 1px solid #eef1f6; }
.ai-chat__history-search { margin: 12px; border-radius: 8px; }
.ai-chat__history-list { padding: 0 12px 12px; overflow: auto; display: grid; gap: 8px; }
.ai-chat__history-group { display: grid; gap: 8px; }
.ai-chat__history-group-label { color: #7f8797; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.ai-chat__history-item { border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; }
.ai-chat__history-item--active { border-color: #c9d4ff; box-shadow: 0 0 0 1px rgba(111,81,255,0.08); }
.ai-chat__history-open { width: 100%; text-align: left; background: none; border: 0; padding: 10px; display: grid; gap: 4px; }
.ai-chat__history-open span, .ai-chat__empty-note, .ai-chat__muted { color: #7f8797; font-size: 12px; }
.ai-chat__history-actions { display: flex; gap: 10px; padding: 0 10px 10px; }
.ai-chat__tree-list { padding: 0 12px 12px; overflow: auto; display: grid; gap: 8px; }
.ai-chat__tree-item { border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 10px; display: grid; gap: 8px; text-align: left; }
.ai-chat__tree-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ai-chat__tree-item-head span { color: #7f8797; font-size: 11px; }
.ai-chat__tree-item p { margin: 0; color: #4b5563; font-size: 12px; line-height: 1.45; }
.ai-chat__tree-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.ai-chat__link-button { border: 0; background: none; color: #51607a; padding: 0; }
.ai-chat__context { margin: 12px 14px 0; padding: 12px; border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; display: grid; gap: 12px; }
.ai-chat__badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #eef2ff; color: #4f46e5; }
.ai-chat__badge--success { background: #e9f8ee; color: #1f7a43; }
.ai-chat__badge--warning { background: #fff4db; color: #a16207; }
.ai-chat__badge--danger { background: #ffe7e5; color: #c24134; }
.ai-chat__context-rows { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.ai-chat__context-row { border: 1px solid #eef1f6; border-radius: 8px; padding: 10px; display: grid; gap: 4px; }
.ai-chat__context-row span { color: #7f8797; font-size: 12px; }
.ai-chat__context-card { border: 1px solid #eef1f6; border-radius: 8px; padding: 10px; background: #fbfcfe; }
.ai-chat__warning { color: #a16207; font-size: 12px; }
.ai-chat__banner { margin: 12px 14px 0; padding: 12px; border-radius: 8px; border: 1px solid #eadca6; background: #fff9e7; }
.ai-chat__banner--info { border-color: #c8dbf4; background: #f6fbff; }
.ai-chat__banner--error { border-color: #f0d2d2; background: #fff6f6; }
.ai-chat__banner--error strong { display: block; margin-bottom: 4px; }
.ai-chat__banner-note { margin-top: 6px; font-size: 12px; color: #51607a; }
.ai-chat__banner-details { margin-top: 10px; }
.ai-chat__banner-details summary { cursor: pointer; color: #51607a; font-size: 12px; user-select: none; }
.ai-chat__banner-pre { margin: 8px 0 0; padding: 10px; max-height: 240px; overflow: auto; border: 1px solid #ead4d4; border-radius: 6px; background: #fff; color: #3e4a60; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; }
.ai-chat__timeline { flex: 1; min-height: 0; overflow: auto; padding: 14px 12px; display: grid; gap: 10px; }
.ai-chat__empty-state, .ai-chat__bubble { border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; padding: 13px; }
.ai-chat__empty-state { display: grid; place-items: center; text-align: center; padding: clamp(24px, 5vw, 42px) 16px; }
.ai-chat__empty-state-body { width: min(100%, 420px); display: grid; justify-items: center; gap: 12px; }
.ai-chat__empty-icon { width: 56px; height: 56px; border-radius: 999px; background: linear-gradient(180deg, #1c7d8f 0%, #13566f 100%); color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.ai-chat__empty-icon svg { width: 22px; height: 22px; }
.ai-chat__empty-title { font-size: 16px; line-height: 1.3; color: #172033; }
.ai-chat__empty-brief { margin: 0; max-width: 34ch; color: #556172; font-size: 13px; line-height: 1.6; }
.ai-chat__empty-cta { width: min(100%, clamp(196px, 72vw, 280px)); min-height: 44px; border: 1px solid #b9d3ea; border-radius: 14px; background: linear-gradient(180deg, #fcfeff 0%, #edf7ff 100%); box-shadow: 0 12px 28px rgba(28,125,143,0.12), inset 0 0 0 1px rgba(255,255,255,0.58); padding: 12px 20px; color: #155e75; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; line-height: 1.4; white-space: normal; cursor: pointer; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
.ai-chat__empty-cta:hover:not(:disabled) { border-color: #8bb7d0; background: linear-gradient(180deg, #ffffff 0%, #e4f3ff 100%); box-shadow: 0 16px 32px rgba(28,125,143,0.16), inset 0 0 0 1px rgba(255,255,255,0.72); transform: translateY(-1px); }
.ai-chat__empty-cta:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; transform: none; }
.ai-chat--compact .ai-chat__empty-state { padding: 24px 14px; }
.ai-chat--compact .ai-chat__empty-state-body { width: min(100%, 320px); gap: 11px; }
.ai-chat--standalone .ai-chat__empty-cta { width: auto; min-width: 172px; max-width: min(100%, 280px); }
.ai-chat__primary-button { border: 0; border-radius: 8px; background: #ffffff; box-shadow: inset 0 0 0 1px #dce3f5; padding: 10px 16px; color: #1f2430; }
.ai-chat__primary-button--small { padding: 7px 11px; font-size: 12px; white-space: nowrap; }
.ai-chat__primary-button--accent { background: linear-gradient(180deg, #f0f7ff 0%, #dbeeff 100%); box-shadow: inset 0 0 0 1px #93c5fd; color: #155e75; }
.ai-chat__primary-button:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-chat__candidate-create-button { min-width: 132px; min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid #1d74c8; background: linear-gradient(180deg, #2486dc 0%, #1461ac 100%); color: #fff; font-weight: 700; box-shadow: 0 8px 18px rgba(20,97,172,0.2); }
.ai-chat__candidate-create-button:hover:not(:disabled) { background: linear-gradient(180deg, #2f95e8 0%, #165da4 100%); box-shadow: 0 10px 22px rgba(20,97,172,0.25); }
.ai-chat__candidate-create-button:disabled { background: linear-gradient(180deg, #eef3fb 0%, #e3e9f2 100%); color: #7b8798; box-shadow: inset 0 0 0 1px #d7dfec; }
.ai-chat__candidate-create-button-icon { width: 16px; height: 16px; border-radius: 999px; background: rgba(255,255,255,0.22); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
.ai-chat__candidate-create-button:disabled .ai-chat__candidate-create-button-icon { background: rgba(123,135,152,0.14); }
.ai-chat__secondary-button { border: 0; border-radius: 8px; background: #fff7e8; box-shadow: inset 0 0 0 1px #f3d7a2; padding: 10px 16px; color: #8a5a00; }
.ai-chat__secondary-button--small { padding: 7px 11px; font-size: 12px; white-space: nowrap; }
.ai-chat__secondary-button:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-chat__bubble--user { background: #f8fbff; }
.ai-chat__bubble--error { border-color: #efc3bd; background: linear-gradient(180deg, #fff9f8 0%, #fff3f1 100%); }
.ai-chat__bubble--pending { border-color: #cde0ec; background: linear-gradient(180deg, #f8fcff 0%, #edf8fb 100%); }
.ai-chat__bubble-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.ai-chat__bubble-meta span { display: block; color: #7f8797; font-size: 12px; margin-top: 2px; }
.ai-chat__bubble-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ai-chat__bubble-menu { position: relative; }
.ai-chat__bubble-menu-trigger { list-style: none; width: 28px; height: 28px; border: 1px solid transparent; border-radius: 999px; color: #8b94a6; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; background: transparent; }
.ai-chat__bubble:hover .ai-chat__bubble-menu-trigger { border-color: #e1e6ef; background: #f8fafc; color: #51607a; }
.ai-chat__message-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.ai-chat__pending-body { display: flex; align-items: center; gap: 9px; color: #51607a; }
.ai-chat__pending-body p { margin: 0; }
.ai-chat__pending-dot { width: 8px; height: 8px; border-radius: 999px; background: #1c7d8f; box-shadow: 0 0 0 0 rgba(28,125,143,0.3); animation: ai-pending-pulse 1.1s ease-in-out infinite; flex: 0 0 auto; }
.ai-chat__message-copy :deep(p:last-child) { margin-bottom: 0; }
.ai-chat__step-block { margin-top: 12px; }
.ai-chat__step-toggle { border: 0; background: none; color: #8b94a6; display: inline-flex; align-items: center; gap: 6px; padding: 2px 0; font-weight: 600; font-size: 12px; }
.ai-chat__step-toggle:hover { color: #51607a; }
.ai-chat__step-toggle-arrow { transition: transform 0.16s ease; display: inline-block; }
.ai-chat__step-toggle-arrow--open { transform: rotate(90deg); }
.ai-chat__step-panel { margin-top: 8px; border: 1px solid #e6e9f0; border-radius: 10px; background: #fbfcff; padding: 10px; display: grid; gap: 9px; }
.ai-chat__step-note { border: 1px dashed #d8e0eb; border-radius: 9px; padding: 9px; background: #fff; color: #4b5563; }
.ai-chat__tool-log--compact, .ai-chat__approval-card--compact { border-radius: 9px; padding: 9px; }
.ai-chat__meta-block { margin-top: 10px; border: 1px solid #e5e9f2; border-radius: 8px; background: #fbfcff; padding: 8px 10px; }
.ai-chat__meta-block--failure { border-color: #efc9c4; background: #fffaf9; }
.ai-chat__meta-block summary { cursor: pointer; color: #51607a; font-size: 12px; user-select: none; }
.ai-chat__separator { padding: 2px 0; color: #64748b; font-size: 12px; font-weight: 600; border-top: 1px dashed #d8e0eb; border-bottom: 1px dashed #d8e0eb; text-align: center; }
.ai-chat__result-note { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5; }
.ai-chat__result-note--partial { background: #fff8e8; border: 1px solid #f1e0ae; color: #8a5a00; }
.ai-chat__result-note--empty { background: #fff1ef; border: 1px solid #f2cbc5; color: #b04437; }
.ai-chat__tool-log { border: 1px solid #d7e3f5; border-radius: 10px; background: #f8fbff; padding: 10px; display: grid; gap: 8px; }
.ai-chat__tool-log strong { font-size: 12px; color: #315076; }
.ai-chat__tool-log-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ai-chat__tool-log-head span { color: #68758b; font-size: 11px; }
.ai-chat__tool-log--error { border-color: #f0b6af; background: #fff7f6; }
.ai-chat__tool-log--execution-rejected, .ai-chat__tool-log--result-rejected, .ai-chat__tool-log--approval-required { border-color: #f5d58a; background: #fffaf0; }
.ai-chat__approval-card { border: 1px solid #f0c978; border-radius: 12px; background: #fff9ea; padding: 12px; display: grid; gap: 8px; }
.ai-chat__approval-card strong { color: #5b4216; }
.ai-chat__approval-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.ai-chat__approval-card-head span { display: block; margin-top: 2px; color: #7c6230; font-size: 12px; }
.ai-chat__approval-card pre { max-height: 180px; overflow: auto; background: rgba(255,255,255,0.72); border: 1px solid #f4dfac; border-radius: 8px; padding: 8px; white-space: pre-wrap; font-size: 11px; }
.ai-chat__approval-card--approved { border-color: #b9dfc3; background: #f3fbf5; }
.ai-chat__approval-card--rejected { border-color: #f0b6af; background: #fff7f6; }
.ai-chat__approval-actions { display: flex; align-items: center; gap: 8px; }
.ai-chat__message-toolbar { margin-top: 12px; padding-top: 8px; border-top: 1px solid #eef1f6; display: flex; align-items: center; justify-content: space-between; gap: 10px; opacity: 0; transition: opacity 0.16s ease, transform 0.16s ease; transform: translateY(2px); }
.ai-chat__bubble:hover .ai-chat__message-toolbar,
.ai-chat__bubble:focus-within .ai-chat__message-toolbar { opacity: 1; transform: translateY(0); }
.ai-chat--compact .ai-chat__message-toolbar { opacity: 1; transform: none; }
.ai-chat__message-toolbar-meta { min-width: 0; color: #7f8797; font-size: 12px; }
.ai-chat__message-toolbar-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.ai-chat__toolbar-button { border: 0; border-radius: 7px; background: transparent; padding: 6px 8px; font-size: 12px; color: #51607a; }
.ai-chat__toolbar-button:hover { background: #f4f7fb; color: #1f2937; }
.ai-chat__bubble-menu--toolbar .ai-chat__bubble-menu-trigger { width: 26px; height: 26px; }
.ai-chat__result-section { display: grid; gap: 6px; margin-top: 10px; }
.ai-chat__result-section h4 { margin: 0; font-size: 13px; color: #3e4a60; }
.ai-chat__result-section ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.ai-chat__key-values { margin: 0; display: grid; gap: 6px; }
.ai-chat__key-values dt { font-weight: 600; color: #3e4a60; }
.ai-chat__key-values dd { margin: 0; color: #4b5563; }
.ai-chat__candidate-list { display: grid; gap: 10px; }
.ai-chat__candidate-list--generic { margin-top: 2px; }
.ai-chat__candidate-toolbar { border: 1px solid #dbe5f2; border-radius: 12px; background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%); padding: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ai-chat__candidate-toolbar > div:first-child { display: grid; gap: 2px; min-width: 0; }
.ai-chat__candidate-toolbar > div:first-child span { color: #7f8797; font-size: 12px; }
.ai-chat__candidate-mode-switch { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ai-chat__candidate-mode-pill { border: 1px solid #d8e1f0; border-radius: 999px; background: #fff; color: #51607a; font-size: 12px; line-height: 1.2; padding: 5px 10px; }
.ai-chat__candidate-mode-pill--active { border-color: #8ab4f8; background: #eef5ff; color: #173f78; }
.ai-chat__candidate-toolbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; min-width: 0; }
.ai-chat__target-summary { color: #65758c; font-size: 12px; max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-chat__creation-result { border: 1px solid #c7e1cf; border-radius: 10px; background: #f4fbf6; color: #27563a; padding: 9px 10px; display: grid; gap: 4px; font-size: 12px; }
.ai-chat__creation-result span { color: #537262; }
.ai-chat__creation-result ul { margin: 8px 0 0; padding-left: 18px; }
.ai-chat__creation-result-list { display: grid; gap: 10px; padding-left: 16px; }
.ai-chat__creation-result-list li { display: grid; gap: 3px; }
.ai-chat__creation-result-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.ai-chat__creation-result-item-head span { color: #537262; }
.ai-chat__creation-result-error { color: #8a2f2f; }
.ai-chat__candidate-card { border: 1px solid #e5e9f2; border-radius: 10px; padding: 10px; display: grid; gap: 7px; background: #fbfcff; }
.ai-chat__candidate-card p { margin: 0; color: #4b5563; }
.ai-chat__candidate-check { display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 12px; }
.ai-chat__candidate-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ai-chat__candidate-preview { border: 1px solid #e7edf6; border-radius: 8px; background: #fff; padding: 10px; }
.ai-chat__candidate-legacy { color: #7a869b; font-size: 12px; }
.ai-chat__cdf-list { display: grid; gap: 10px; }
.ai-chat__cdf-anchor { border: 1px solid #dfe6f2; border-radius: 12px; background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); padding: 12px; display: grid; gap: 10px; }
.ai-chat__cdf-anchor--disabled { background: linear-gradient(180deg, #fffdf7 0%, #fff8eb 100%); border-color: #f0dfb5; }
.ai-chat__cdf-anchor-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ai-chat__cdf-anchor-note { margin: -2px 0 0; }
.ai-chat__cdf-section { display: grid; gap: 8px; }
.ai-chat__cdf-section h4 { margin: 0; font-size: 13px; color: #3e4a60; }
.ai-chat__cdf-group-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; color: #637286; font-size: 12px; }
.ai-chat__cdf-group-title { display: flex; align-items: center; gap: 8px; color: #1f2937; }
.ai-chat__cdf-group-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ai-chat__cdf-group-mode { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; padding: 2px 8px; border-radius: 999px; border: 1px solid #d9e4fb; background: #eef4ff; color: #365d9b; font-size: 11px; font-weight: 700; }
.ai-chat__cdf-items { display: grid; gap: 8px; }
.ai-chat__cdf-group-children { margin-left: 24px; padding-left: 12px; border-left: 2px solid #e6edf8; }
.ai-chat__cdf-item { display: flex; align-items: flex-start; gap: 8px; color: #4b5563; font-size: 12px; line-height: 1.5; }
.ai-chat__cdf-item input, .ai-chat__cdf-group-title input { margin-top: 2px; }
.ai-chat__candidate-toolbar-actions--anchor { justify-content: flex-start; gap: 8px; }
.ai-chat__cdf-anchor-actions { margin-top: -2px; }
.ai-chat__cdf-search { border: 1px solid #e5e9f2; border-radius: 10px; background: #fbfcff; padding: 10px; display: grid; gap: 8px; }
.ai-chat__cdf-search-bar { display: flex; align-items: center; gap: 8px; }
.ai-chat__cdf-search-bar .b3-text-field { flex: 1; min-width: 0; }
.ai-chat__cdf-search-results { display: grid; gap: 8px; }
.ai-chat__modal-backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(21, 27, 38, 0.28); display: flex; align-items: center; justify-content: center; padding: 18px; }
.ai-chat__target-dialog { width: min(520px, 100%); max-height: min(720px, 92vh); border: 1px solid #d9deea; border-radius: 14px; background: #fff; box-shadow: 0 24px 64px rgba(21, 27, 38, 0.22); display: flex; flex-direction: column; overflow: hidden; }
.ai-chat__target-body { padding: 14px; display: grid; gap: 13px; overflow: auto; }
.ai-chat__target-mode { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ai-chat__target-mode .ai-chat__skill-pill { width: 100%; min-width: 0; border-radius: 12px; }
.ai-chat__target-field { display: grid; gap: 6px; color: #3e4a60; font-size: 12px; font-weight: 600; }
.ai-chat__target-footer { border-top: 1px solid #eef1f6; padding: 12px 14px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
.ai-chat__composer { position: relative; border-top: 1px solid #e6e9f0; background: #fff; padding: 10px 12px 12px; display: grid; gap: 8px; }
.ai-chat__composer-hint { margin: 0; font-size: 12px; line-height: 1.5; }
.ai-chat__composer-hint--warning { color: #a16207; background: #fff8e8; border: 1px solid #f1e0ae; border-radius: 8px; padding: 7px 9px; }
.ai-chat__composer-shell { position: relative; border: 1px solid #d9deea; border-radius: 8px; background: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.4); }
.ai-chat__composer-input { width: 100%; min-height: 126px; resize: vertical; border: 0; border-radius: 8px; padding: 12px 12px 48px; background: transparent; box-shadow: none; }
.ai-chat__composer-input:focus { box-shadow: none; }
.ai-chat__composer-footer { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; pointer-events: none; }
.ai-chat__composer-left-tools { display: flex; align-items: center; gap: 6px; min-width: 0; pointer-events: auto; }
.ai-chat__composer-plus, .ai-chat__composer-send { width: 30px; height: 30px; border: 1px solid #d9deea; border-radius: 7px; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: #51607a; pointer-events: auto; }
.ai-chat__composer-plus span { font-size: 16px; line-height: 1; }
.ai-chat__composer-send { background: linear-gradient(180deg, #2486dc 0%, #1461ac 100%); border-color: #1d74c8; color: #fff; box-shadow: 0 8px 18px rgba(20,97,172,0.18); transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease; }
.ai-chat__composer-send:hover:not(:disabled) { background: linear-gradient(180deg, #2f95e8 0%, #165da4 100%); box-shadow: 0 10px 22px rgba(20,97,172,0.24); transform: translateY(-1px); }
.ai-chat__composer-send svg { width: 16px; height: 16px; }
.ai-chat__composer-send--stop { width: auto; min-width: 60px; padding: 0 12px; gap: 6px; background: #fff4f2; border-color: #efb7ae; color: #b42318; box-shadow: none; font-weight: 700; transform: none; }
.ai-chat__composer-send--stop:hover:not(:disabled) { background: #ffe8e4; box-shadow: none; transform: none; }
.ai-chat__composer-send--stop::before { content: ''; width: 8px; height: 8px; border-radius: 2px; background: currentColor; }
.ai-chat__composer-send--stop span { font-size: 12px; line-height: 1; }
.ai-chat__composer-expand { border: 0; border-radius: 7px; background: transparent; color: #65758c; padding: 5px 8px; font-size: 12px; line-height: 1.2; pointer-events: auto; white-space: nowrap; }
.ai-chat__composer-send:disabled, .ai-chat__composer-plus:disabled, .ai-chat__composer-expand:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-chat__context-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
.ai-chat__context-chip { border: 1px solid #dce3f5; border-radius: 8px; background: #f8fbff; padding: 8px 10px; display: grid; gap: 2px; text-align: left; max-width: 100%; }
.ai-chat__context-chip strong, .ai-chat__context-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-chat__context-chip span { color: #7f8797; font-size: 12px; }
.ai-chat__context-menu { position: absolute; left: 10px; bottom: 46px; width: min(300px, calc(100% - 20px)); border: 1px solid #d9deea; border-radius: 8px; background: #fff; box-shadow: 0 16px 32px rgba(21, 27, 38, 0.12); display: grid; overflow: hidden; z-index: 2; }
.ai-chat__context-menu-item { border: 0; background: none; padding: 11px 12px; text-align: left; display: grid; gap: 4px; }
.ai-chat__context-menu-item + .ai-chat__context-menu-item { border-top: 1px solid #eef1f6; }
.ai-chat__context-menu-item span { color: #7f8797; font-size: 12px; }

/* F-Misc visual pass: native surfaces, thin borders, compact rows. */
.ai-chat,
.ai-chat--compact {
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

.ai-chat__history,
.ai-chat__tree,
.ai-chat__topbar,
.ai-chat__skill-switch,
.ai-chat__tabs,
.ai-chat__composer {
  border-color: var(--b3-border-color);
  background: var(--b3-theme-surface);
  box-shadow: none;
  backdrop-filter: none;
}

.ai-chat__topbar {
  padding: 7px 10px;
}

.ai-chat__headline {
  color: var(--b3-theme-on-background);
  font-size: 14px;
  font-weight: 600;
}

.ai-chat__subhead,
.ai-chat__muted,
.ai-chat__empty-note,
.ai-chat__history-open span,
.ai-chat__history-group-label,
.ai-chat__tree-item-head span,
.ai-chat__tree-item p,
.ai-chat__context-row span,
.ai-chat__composer-hint,
.ai-chat__context-chip span,
.ai-chat__message-toolbar-meta,
.ai-chat__target-summary {
  color: var(--b3-theme-on-surface-light);
}

.ai-chat__icon-button,
.ai-chat__primary-button,
.ai-chat__secondary-button,
.ai-chat__toolbar-button,
.ai-chat__composer-plus,
.ai-chat__composer-send,
.ai-chat__composer-expand,
.ai-chat__candidate-create-button {
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  box-shadow: none;
  transform: none;
}

.ai-chat__icon-button:hover,
.ai-chat__primary-button:hover:not(:disabled),
.ai-chat__secondary-button:hover:not(:disabled),
.ai-chat__toolbar-button:hover,
.ai-chat__composer-plus:hover:not(:disabled),
.ai-chat__composer-expand:hover:not(:disabled) {
  background: var(--b3-theme-surface-light);
}

.ai-chat__skill-pill,
.ai-chat__tab,
.ai-chat__history-item,
.ai-chat__tree-item,
.ai-chat__context,
.ai-chat__context-row,
.ai-chat__context-card,
.ai-chat__banner,
.ai-chat__bubble,
.ai-chat__empty-state,
.ai-chat__approval-card,
.ai-chat__step-panel,
.ai-chat__tool-log,
.ai-chat__candidate-toolbar,
.ai-chat__candidate-card,
.ai-chat__candidate-preview,
.ai-chat__cdf-anchor,
.ai-chat__cdf-search,
.ai-chat__target-dialog,
.ai-chat__context-chip,
.ai-chat__context-menu,
.ai-chat__composer-shell,
.ai-chat__creation-result {
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  box-shadow: none;
}

.ai-chat__skill-pill,
.ai-chat__tab {
  min-width: 132px;
  padding: 6px 10px;
}

.ai-chat__skill-pill--active,
.ai-chat__tab--active,
.ai-chat__history-item--active,
.ai-chat__candidate-mode-pill--active {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary-lightest);
  color: var(--b3-theme-primary);
  box-shadow: none;
}

.ai-chat__skill-pill strong,
.ai-chat__tab strong,
.ai-chat__result-section h4,
.ai-chat__key-values dt,
.ai-chat__cdf-section h4,
.ai-chat__cdf-group-title,
.ai-chat__empty-title {
  color: var(--b3-theme-on-background);
}

.ai-chat__badge,
.ai-chat__candidate-mode-pill,
.ai-chat__cdf-group-mode {
  border: 1px solid var(--b3-border-color);
  border-radius: 3px;
  background: transparent;
  color: var(--b3-theme-on-surface);
}

.ai-chat__empty-icon {
  width: 44px;
  height: 44px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-primary);
}

.ai-chat__empty-cta {
  width: auto;
  min-height: 34px;
  border: 1px solid var(--b3-theme-primary);
  border-radius: 4px;
  background: var(--b3-theme-primary);
  color: var(--b3-theme-on-primary, #fff);
  box-shadow: none;
  padding: 0 14px;
  font-weight: 600;
}

.ai-chat__empty-cta:hover:not(:disabled) {
  background: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
  box-shadow: none;
  transform: none;
  opacity: 0.86;
}

.ai-chat__candidate-create-button,
.ai-chat__primary-button--accent,
.ai-chat__composer-send {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary);
  color: var(--b3-theme-on-primary, #fff);
}

.ai-chat__candidate-create-button:hover:not(:disabled),
.ai-chat__composer-send:hover:not(:disabled) {
  background: var(--b3-theme-primary);
  box-shadow: none;
  transform: none;
  opacity: 0.86;
}

.ai-chat__composer-send--stop {
  border-color: var(--b3-theme-error);
  background: transparent;
  color: var(--b3-theme-error);
  box-shadow: none;
}

.ai-chat__bubble-menu-trigger {
  border-radius: 4px;
}

.ai-chat__pending-dot {
  background: var(--b3-theme-primary);
  box-shadow: none;
}

.ai-chat__composer-input {
  border-radius: 4px;
  color: var(--b3-theme-on-background);
}

.ai-chat__bubble--user,
.ai-chat__bubble--pending,
.ai-chat__bubble--error,
.ai-chat__cdf-anchor--disabled,
.ai-chat__approval-card--approved,
.ai-chat__approval-card--rejected {
  background: var(--b3-theme-background);
  border-color: var(--b3-border-color);
}

.ai-chat__approval-card pre,
.ai-chat__banner-pre {
  border-radius: 4px;
  background: var(--b3-theme-surface);
  border-color: var(--b3-border-color);
}

.ai-chat__modal-backdrop {
  background: rgba(0, 0, 0, 0.18);
}

.ai-chat__target-footer,
.ai-chat__message-toolbar,
.ai-chat__context-menu-item + .ai-chat__context-menu-item {
  border-color: var(--b3-border-color);
}
@keyframes ai-pending-pulse {
  0% { opacity: 0.45; transform: scale(0.85); box-shadow: 0 0 0 0 rgba(28,125,143,0.22); }
  50% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 6px rgba(28,125,143,0.08); }
  100% { opacity: 0.45; transform: scale(0.85); box-shadow: 0 0 0 0 rgba(28,125,143,0); }
}
@media (max-width: 900px) {
  .ai-chat__history { width: 220px; }
}
</style>
