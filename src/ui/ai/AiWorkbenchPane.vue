<template>
  <div
    class="ai-workbench-pane"
    :class="[
      `ai-workbench-pane--${state.surface}`,
      { 'ai-workbench-pane--compact': !showSidebar },
    ]"
  >
    <div class="ai-workbench__shell">
      <aside v-if="showSidebar" class="ai-workbench__sidebar">
        <section class="ai-workbench__hero">
          <div class="ai-workbench__eyebrow">{{ t('aiWorkbench', 'AI 工作台') }}</div>
          <h2>{{ activeViewMeta.title }}</h2>
          <p>{{ activeViewMeta.description }}</p>
        </section>

        <div class="ai-workbench__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="ai-workbench__tab"
            :class="{ 'ai-workbench__tab--active': state.activeView === tab.key }"
            @click="service.setActiveView(tab.key)"
          >
            <strong>{{ tab.label }}</strong>
            <span>{{ tab.brief }}</span>
          </button>
        </div>

        <section class="ai-workbench__panel">
          <div class="ai-workbench__panel-title">{{ t('currentContext', '当前上下文') }}</div>
          <div class="ai-workbench__context-rows">
            <div
              v-for="row in contextDetailRows"
              :key="row.key"
              class="ai-workbench__context-row"
            >
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
          <div class="ai-workbench__chips">
            <span class="ai-workbench__chip">{{ t('blocks', '块') }}: {{ state.context?.selectedBlockIds.length || 0 }}</span>
            <span v-if="currentCard" class="ai-workbench__chip">{{ t('currentCard', '当前卡') }}: {{ currentCard.cardType }}</span>
            <span v-if="state.context?.neuralBatch" class="ai-workbench__chip">{{ t('engine', '引擎') }}: {{ state.context.neuralBatch.engineMode }}</span>
          </div>
        </section>

        <section v-if="currentCard" class="ai-workbench__panel">
          <div class="ai-workbench__panel-title">{{ t('currentCardSnapshot', '当前卡片快照') }}</div>
          <article class="ai-workbench__mini-card">
            <div class="ai-workbench__mini-label">{{ t('frontPrompt', '正面 / 题干') }}</div>
            <p>{{ previewText(currentCard.frontText) || t('noFrontContent', '暂无正面内容') }}</p>
          </article>
          <article v-if="currentCard.hasAnswerFace && canShowSensitiveCardContent" class="ai-workbench__mini-card">
            <div class="ai-workbench__mini-label">{{ t('backAnswer', '背面 / 答案') }}</div>
            <p>{{ previewText(currentCard.backText) || t('noBackContent', '暂无背面内容') }}</p>
          </article>
          <article v-if="canShowSensitiveCardContent && currentCard.sourceText" class="ai-workbench__mini-card">
            <div class="ai-workbench__mini-label">{{ t('sourceExcerpt', '来源摘录') }}</div>
            <p>{{ previewText(currentCard.sourceText, 220) }}</p>
          </article>
          <article v-if="revealLocked" class="ai-workbench__mini-card ai-workbench__mini-card--warning">
            <div class="ai-workbench__mini-label">{{ t('retrievalGuard', '提取练习保护') }}</div>
            <p>{{ t('revealFirstHint', '当前还未 reveal，为避免绕过提取练习，答案和来源内容先隐藏。') }}</p>
          </article>
        </section>

        <section class="ai-workbench__panel">
          <div class="ai-workbench__panel-title">{{ t('currentMaterial', '当前材料') }}</div>
          <div v-if="visibleBlocks.length" class="ai-workbench__list">
            <article v-for="block in visibleBlocks" :key="block.blockId" class="ai-workbench__mini-card">
              <div class="ai-workbench__mini-label">{{ block.type || 'block' }} · {{ block.blockId.slice(0, 8) }}</div>
              <p>{{ previewText(block.text, 120) || t('emptyBlock', '空块') }}</p>
            </article>
            <div v-if="hiddenBlockCount > 0" class="ai-workbench__more-line">
              {{ t('moreContextBlocks', '还有 {count} 个块已纳入上下文').replace('{count}', String(hiddenBlockCount)) }}
            </div>
          </div>
          <p v-else class="ai-workbench__more-line">
            {{ t('noExtraBlocks', '当前没有额外选中块，AI 会主要读取当前卡片上下文。') }}
          </p>
        </section>
      </aside>

      <main class="ai-workbench__main">
        <header v-if="showSidebar" class="ai-workbench__main-head">
          <div class="ai-workbench__main-copy">
            <div class="ai-workbench__main-kicker">{{ activeViewMeta.kicker }}</div>
            <h3>{{ activeViewMeta.headline }}</h3>
            <p>{{ activeViewMeta.helper }}</p>
          </div>
          <div class="ai-workbench__main-controls">
            <div class="ai-workbench__status" :class="{ 'ai-workbench__status--busy': state.isLoading, 'ai-workbench__status--error': !!state.error }">
              {{ assistantStatus }}
            </div>
          </div>
        </header>

        <div v-else class="ai-workbench__compact-bar">
          <div class="ai-workbench__compact-head">
            <div class="ai-workbench__compact-head-main">
              <span class="ai-workbench__compact-head-icon" aria-hidden="true">
                <svg><use xlink:href="#iconSparkles"></use></svg>
              </span>
              <div class="ai-workbench__compact-head-copy">
                <strong>{{ activeViewMeta.title }}</strong>
              </div>
            </div>
            <div class="ai-workbench__compact-head-actions">
              <button
                class="ai-workbench__details-toggle"
                type="button"
                :class="{ 'ai-workbench__details-toggle--expanded': detailsVisible }"
                :aria-expanded="detailsVisible"
                @click="detailsVisible = !detailsVisible"
              >
                {{ detailsToggleLabel }}
              </button>
              <button
                v-if="showInlineClose"
                class="block__icon block__icon--show ai-workbench__compact-close"
                :aria-label="t('closeAiSidecar', '收起 AI 侧栏')"
                :title="t('closeAiSidecar', '收起 AI 侧栏')"
                type="button"
                @click="emit('close')"
              >
                <svg><use xlink:href="#iconCloseRound"></use></svg>
              </button>
            </div>
          </div>

          <div class="ai-workbench__compact-switcher" role="tablist" :aria-label="t('aiWorkbench', 'AI 工作台')">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="ai-workbench__compact-switch"
              :class="{ 'ai-workbench__compact-switch--active': state.activeView === tab.key }"
              type="button"
              role="tab"
              :aria-selected="state.activeView === tab.key"
              @click="service.setActiveView(tab.key)"
            >
              {{ tab.label }}
            </button>
          </div>

          <transition name="ai-workbench-fade">
            <section v-if="detailsVisible" class="ai-workbench__compact-details-tray">
              <div class="ai-workbench__compact-details-meta">
                <div
                  v-for="row in contextDetailRows"
                  :key="row.key"
                  class="ai-workbench__compact-details-row"
                >
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </div>
              </div>

              <article v-if="currentCard" class="ai-workbench__compact-details-card">
                <span class="ai-workbench__compact-details-label">{{ t('currentCardSnapshot', '当前卡片快照') }}</span>
                <strong>{{ previewText(currentCard.frontText, 110) || t('noFrontContent', '暂无正面内容') }}</strong>
                <p class="ai-workbench__compact-details-description">{{ currentCard.roleDescription }}</p>
                <p v-if="canShowSensitiveCardContent && currentCard.sourceText">{{ previewText(currentCard.sourceText, 180) }}</p>
                <p v-else-if="revealLocked">{{ t('revealFirstHint', '当前还未 reveal，为避免绕过提取练习，答案和来源内容先隐藏。') }}</p>
              </article>

              <div v-if="visibleBlocks.length" class="ai-workbench__compact-context-list">
                <article v-for="block in visibleBlocks" :key="block.blockId" class="ai-workbench__compact-context-item">
                  <span>{{ block.type || 'block' }} · {{ block.blockId.slice(0, 8) }}</span>
                  <p>{{ previewText(block.text, 96) || t('emptyBlock', '空块') }}</p>
                </article>
              </div>

              <p v-if="hiddenBlockCount > 0" class="ai-workbench__compact-context-note">
                {{ t('moreContextBlocks', '还有 {count} 个块已纳入上下文').replace('{count}', String(hiddenBlockCount)) }}
              </p>
              <p v-else-if="!visibleBlocks.length" class="ai-workbench__compact-context-note">
                {{ t('noExtraBlocks', '当前没有额外选中块，AI 会主要读取当前卡片上下文。') }}
              </p>
            </section>
          </transition>
        </div>

        <div class="ai-workbench__feed">
          <article
            v-if="state.error"
            :class="showSidebar ? 'ai-workbench__message ai-workbench__message--error' : 'ai-workbench__compact-banner ai-workbench__compact-banner--error'"
          >
            <strong>{{ t('aiRunFailedTitle', '这次没有顺利跑通') }}</strong>
            <p>{{ state.error }}</p>
          </article>

          <article
            v-if="activeViewState.stale"
            :class="showSidebar ? 'ai-workbench__message ai-workbench__message--stale' : 'ai-workbench__compact-banner ai-workbench__compact-banner--stale'"
          >
            <strong>{{ t('aiContextUpdated', '当前已切换到新上下文') }}</strong>
            <p>{{ activeViewState.staleReason || t('rerunForLatestContext', '请基于当前卡片或当前批次重新运行。') }}</p>
            <button class="b3-button b3-button--outline" :disabled="state.isLoading" @click="rerunActiveView">
              {{ staleActionLabel }}
            </button>
          </article>

          <template v-if="state.activeView === 'tutor'">
            <article
              v-if="!state.tutorResult"
              :class="showSidebar ? 'ai-workbench__message ai-workbench__message--welcome' : 'ai-workbench__compact-message-card'"
            >
              <div v-if="!showSidebar" class="ai-workbench__compact-message-role">{{ t('aiTutor', 'AI 导师') }}</div>
              <strong>{{ t('aiTutorWelcomeTitle', '我会先读你当前这批漫游材料') }}</strong>
              <p>{{ activeViewMeta.emptyBody }}</p>
              <ul v-if="showSidebar">
                <li v-for="item in activeViewMeta.bullets" :key="item">{{ item }}</li>
              </ul>
            </article>

            <template v-else>
              <div v-if="showSidebar">
                <section
                  v-for="section in tutorSections"
                  :key="section.key"
                  class="ai-workbench__result-card"
                  :class="{ 'ai-workbench__result-card--accent': section.accent }"
                >
                  <h4>{{ section.title }}</h4>
                  <p v-if="section.kind === 'text'">{{ section.text || t('noResultYet', '暂无结果') }}</p>
                  <ul v-else><li v-for="item in section.items" :key="item">{{ item }}</li></ul>
                </section>
              </div>
              <article v-else class="ai-workbench__compact-response-card">
                <div class="ai-workbench__compact-message-role">{{ t('aiTutor', 'AI 导师') }}</div>
                <div class="ai-workbench__compact-response-sections">
                  <section
                    v-for="section in tutorSections"
                    :key="section.key"
                    class="ai-workbench__compact-response-section"
                  >
                    <h4>{{ section.title }}</h4>
                    <p v-if="section.kind === 'text'">{{ section.text || t('noResultYet', '暂无结果') }}</p>
                    <ul v-else><li v-for="item in section.items" :key="item">{{ item }}</li></ul>
                  </section>
                </div>
              </article>
            </template>
          </template>

          <template v-else-if="state.activeView === 'explain'">
            <article
              v-if="revealLocked && !state.explainResult"
              :class="showSidebar ? 'ai-workbench__message ai-workbench__message--welcome' : 'ai-workbench__compact-message-card'"
            >
              <div v-if="!showSidebar" class="ai-workbench__compact-message-role">{{ t('aiExplainCard', 'AI 解释卡片') }}</div>
              <strong>{{ t('revealFirstExplainTitle', '解释卡片前先 reveal') }}</strong>
              <p>{{ t('revealFirstExplainBody', '为了不绕过提取练习，AI 解释会等你先显示答案后再开始。') }}</p>
            </article>

            <article
              v-else-if="!state.explainResult"
              :class="showSidebar ? 'ai-workbench__message ai-workbench__message--welcome' : 'ai-workbench__compact-message-card'"
            >
              <div v-if="!showSidebar" class="ai-workbench__compact-message-role">{{ t('aiExplainCard', 'AI 解释卡片') }}</div>
              <strong>{{ t('aiExplainWelcomeTitle', '我会围绕当前卡片做解释') }}</strong>
              <p>{{ activeViewMeta.emptyBody }}</p>
              <ul v-if="showSidebar">
                <li v-for="item in activeViewMeta.bullets" :key="item">{{ item }}</li>
              </ul>
            </article>

            <template v-else>
              <div v-if="showSidebar">
                <section
                  v-for="section in explainSections"
                  :key="section.key"
                  class="ai-workbench__result-card"
                  :class="{ 'ai-workbench__result-card--accent': section.accent }"
                >
                  <h4>{{ section.title }}</h4>
                  <p v-if="section.kind === 'text'">{{ section.text || t('noResultYet', '暂无结果') }}</p>
                  <ul v-else><li v-for="item in section.items" :key="item">{{ item }}</li></ul>
                </section>
              </div>
              <article v-else class="ai-workbench__compact-response-card">
                <div class="ai-workbench__compact-message-role">{{ t('aiExplainCard', 'AI 解释卡片') }}</div>
                <div class="ai-workbench__compact-response-sections">
                  <section
                    v-for="section in explainSections"
                    :key="section.key"
                    class="ai-workbench__compact-response-section"
                  >
                    <h4>{{ section.title }}</h4>
                    <p v-if="section.kind === 'text'">{{ section.text || t('noResultYet', '暂无结果') }}</p>
                    <ul v-else><li v-for="item in section.items" :key="item">{{ item }}</li></ul>
                  </section>
                </div>
              </article>
            </template>
          </template>

          <template v-else>
            <article
              v-if="!state.makeCardsResult"
              :class="showSidebar ? 'ai-workbench__message ai-workbench__message--welcome' : 'ai-workbench__compact-message-card'"
            >
              <div v-if="!showSidebar" class="ai-workbench__compact-message-role">{{ t('aiMakeCards', 'AI 辅助制卡') }}</div>
              <strong>{{ t('aiMakeCardsWelcomeTitle', '先让我给你生成一批候选卡') }}</strong>
              <p>{{ activeViewMeta.emptyBody }}</p>
              <ul v-if="showSidebar">
                <li v-for="item in activeViewMeta.bullets" :key="item">{{ item }}</li>
              </ul>
            </article>

            <template v-else-if="state.makeCardsResult.candidates.length === 0">
              <article :class="showSidebar ? 'ai-workbench__message ai-workbench__message--welcome' : 'ai-workbench__compact-message-card'">
                <div v-if="!showSidebar" class="ai-workbench__compact-message-role">{{ t('aiMakeCards', 'AI 辅助制卡') }}</div>
                <strong>{{ t('aiNoCandidates', '这次没有生成候选卡') }}</strong>
                <p>{{ t('aiTryDifferentCandidateMode', '可以换一个模式，或者扩大选中的材料范围后再试一次。') }}</p>
              </article>
            </template>

            <template v-else>
              <div v-if="!showSidebar" class="ai-workbench__compact-candidate-toolbar">
                <span>{{ state.makeCardsResult.candidates.length }} {{ t('candidateCountSuffix', '条候选') }}</span>
                <span>{{ keptCandidates.length }} / {{ state.makeCardsResult.candidates.length }}</span>
              </div>

              <div class="ai-workbench__candidate-grid" :class="{ 'ai-workbench__candidate-grid--compact': !showSidebar }">
                <article
                  v-for="candidate in state.makeCardsResult.candidates"
                  :key="candidate.id"
                  class="ai-workbench__candidate"
                  :class="{ 'ai-workbench__candidate--discarded': candidate.discarded, 'ai-workbench__candidate--readonly': activeViewState.stale }"
                >
                  <div class="ai-workbench__candidate-head">
                    <input
                      class="b3-text-field"
                      :disabled="isCandidateLocked(candidate)"
                      :value="candidate.title"
                      @input="service.updateCandidateTitle(candidate.id, ($event.target as HTMLInputElement).value)"
                    >
                    <select
                      class="b3-select"
                      :disabled="isCandidateLocked(candidate)"
                      :value="candidate.templateId"
                      @change="service.updateCandidateTemplateId(candidate.id, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="option in templateOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                  <div class="ai-workbench__candidate-meta">
                    <span>{{ t('confidence', '置信度') }} {{ candidate.confidence.toFixed(2) }}</span>
                    <span>{{ candidateStatusText(candidate) }}</span>
                  </div>
                  <textarea class="b3-text-field ai-workbench__candidate-preview" :value="candidate.preview" readonly></textarea>
                  <div class="ai-workbench__field-list">
                    <div v-for="entry in Object.entries(candidate.fieldMapping)" :key="entry[0]" class="ai-workbench__field-item">
                      <label>{{ entry[0] }}</label>
                      <textarea
                        class="b3-text-field"
                        :disabled="isCandidateLocked(candidate)"
                        :value="entry[1]"
                        @input="service.updateCandidateField(candidate.id, entry[0], ($event.target as HTMLTextAreaElement).value)"
                      ></textarea>
                    </div>
                  </div>
                  <div class="ai-workbench__candidate-actions">
                    <button
                      class="b3-button b3-button--outline"
                      :disabled="activeViewState.stale || state.isLoading || candidate.draftState === 'saving' || candidate.draftState === 'creating'"
                      @click="service.toggleCandidateDiscarded(candidate.id)"
                    >
                      {{ candidate.discarded ? t('keep', '保留') : t('delete', '删除') }}
                    </button>
                    <button
                      class="b3-button b3-button--text"
                      :disabled="!canSaveCandidate(candidate)"
                      @click="saveSingleCandidate(candidate.id)"
                    >
                      {{ t('saveDraft', '保存草稿') }}
                    </button>
                    <button
                      class="b3-button b3-button--text"
                      :disabled="!canCreateCandidate(candidate)"
                      @click="createSingleCandidate(candidate.id)"
                    >
                      {{ t('create', '创建') }}
                    </button>
                  </div>
                </article>
              </div>
            </template>
          </template>

          <section v-if="followUps.length > 0" class="ai-workbench__thread">
            <div v-if="showSidebar" class="ai-workbench__thread-title">{{ t('followUpThread', '追问记录') }}</div>
            <article
              v-for="entry in followUps"
              :key="entry.id"
              class="ai-workbench__thread-entry"
              :class="{
                'ai-workbench__thread-entry--user': entry.role === 'user',
                'ai-workbench__thread-entry--assistant': entry.role === 'assistant',
                'ai-workbench__thread-entry--compact': !showSidebar,
              }"
            >
              <div :class="showSidebar ? 'ai-workbench__thread-role' : 'ai-workbench__compact-thread-role'">
                {{ entry.role === 'user' ? t('you', '你') : activeViewMeta.title }}
              </div>
              <p>{{ entry.content }}</p>
            </article>
          </section>
        </div>

        <footer v-if="showSidebar" class="ai-workbench__dock">
          <div class="ai-workbench__dock-row">
            <div class="ai-workbench__dock-copy">
              <strong>{{ activeViewMeta.dockTitle }}</strong>
              <p>{{ activeViewMeta.dockHint }}</p>
            </div>
            <div class="ai-workbench__dock-actions">
              <template v-if="state.activeView === 'tutor'">
                <button class="b3-button b3-button--text" :disabled="state.isLoading" @click="service.runTutor()">
                  {{ t('runTutor', '运行导师') }}
                </button>
                <button class="b3-button b3-button--outline" :disabled="state.isLoading" @click="service.rerunTutorWithSummary()">
                  {{ t('summarizeBatch', '总结本批') }}
                </button>
              </template>
              <template v-else-if="state.activeView === 'explain'">
                <button class="b3-button b3-button--text" :disabled="state.isLoading || revealLocked" @click="service.runExplain()">
                  {{ t('aiExplainCard', 'AI 解释卡片') }}
                </button>
                <button class="b3-button b3-button--outline" :disabled="state.isLoading" @click="jumpToMakeCards">
                  {{ t('turnIntoCandidates', '转为候选制卡') }}
                </button>
              </template>
              <template v-else>
                <select class="b3-select ai-workbench__mode-select" :disabled="state.isLoading" :value="state.makeCardMode" @change="handleModeChange">
                  <option value="qa">{{ t('qaMode', '问答') }}</option>
                  <option value="cloze">{{ t('clozeMode', '挖空') }}</option>
                  <option value="concept-descriptor">{{ t('conceptDescriptorMode', '概念 / 描述符') }}</option>
                  <option value="cdf">{{ t('cdfMode', 'CDF 辅助制卡') }}</option>
                </select>
                <button class="b3-button b3-button--text" :disabled="state.isLoading" @click="service.runMakeCards()">
                  {{ generateCandidatesLabel }}
                </button>
                <button class="b3-button b3-button--outline" :disabled="state.isLoading || activeViewState.stale || draftSyncCandidates.length === 0" @click="saveKeptCandidates()">
                  {{ saveDraftActionLabel }} ({{ draftSyncCandidates.length }})
                </button>
                <button class="b3-button b3-button--outline" :disabled="bulkCreateDisabled" @click="createKeptCandidates()">
                  {{ t('bulkCreate', '批量创建') }} ({{ readyToCreateCandidates.length }})
                </button>
              </template>
            </div>
          </div>

          <div class="ai-workbench__follow-up">
            <textarea
              v-model="followUpDraft"
              class="b3-text-field ai-workbench__follow-up-input"
              :disabled="!!followUpDisabledReason"
              :placeholder="followUpPlaceholder"
              @keydown.ctrl.enter.prevent="submitFollowUp"
              @keydown.meta.enter.prevent="submitFollowUp"
            ></textarea>
            <button class="b3-button b3-button--text" :disabled="!!followUpDisabledReason || !followUpDraft.trim()" @click="submitFollowUp">
              {{ t('askFollowUp', '继续追问') }}
            </button>
          </div>
          <div class="ai-workbench__follow-up-hint">
            {{ followUpDisabledReason || activeViewMeta.followUpHint }}
          </div>
        </footer>

        <footer v-else class="ai-workbench__compact-footer">
          <div class="ai-workbench__compact-footer-actions">
            <template v-if="state.activeView === 'tutor'">
              <button class="b3-button b3-button--text" type="button" :disabled="state.isLoading" @click="service.runTutor()">
                {{ t('runTutor', '运行导师') }}
              </button>
              <button class="b3-button b3-button--outline" type="button" :disabled="state.isLoading" @click="service.rerunTutorWithSummary()">
                {{ t('summarizeBatch', '总结本批') }}
              </button>
            </template>
            <template v-else-if="state.activeView === 'explain'">
              <button class="b3-button b3-button--text" type="button" :disabled="state.isLoading || revealLocked" @click="service.runExplain()">
                {{ t('aiExplainCard', 'AI 解释卡片') }}
              </button>
              <button class="b3-button b3-button--outline" type="button" :disabled="state.isLoading" @click="jumpToMakeCards">
                {{ t('turnIntoCandidates', '转为候选制卡') }}
              </button>
            </template>
            <template v-else>
              <select class="b3-select ai-workbench__mode-select" :disabled="state.isLoading" :value="state.makeCardMode" @change="handleModeChange">
                <option value="qa">{{ t('qaMode', '问答') }}</option>
                <option value="cloze">{{ t('clozeMode', '挖空') }}</option>
                <option value="concept-descriptor">{{ t('conceptDescriptorMode', '概念 / 描述符') }}</option>
                <option value="cdf">{{ t('cdfMode', 'CDF 辅助制卡') }}</option>
              </select>
              <button class="b3-button b3-button--text" type="button" :disabled="state.isLoading" @click="service.runMakeCards()">
                {{ generateCandidatesLabel }}
              </button>
              <button class="b3-button b3-button--outline" type="button" :disabled="state.isLoading || activeViewState.stale || draftSyncCandidates.length === 0" @click="saveKeptCandidates()">
                {{ saveDraftActionLabel }} ({{ draftSyncCandidates.length }})
              </button>
              <button class="b3-button b3-button--outline" type="button" :disabled="bulkCreateDisabled" @click="createKeptCandidates()">
                {{ t('bulkCreate', '批量创建') }} ({{ readyToCreateCandidates.length }})
              </button>
            </template>
          </div>

          <div class="ai-workbench__compact-composer">
            <textarea
              v-model="followUpDraft"
              class="b3-text-field ai-workbench__compact-composer-input"
              :disabled="!!followUpDisabledReason"
              :placeholder="followUpPlaceholder"
              @keydown.ctrl.enter.prevent="submitFollowUp"
              @keydown.meta.enter.prevent="submitFollowUp"
            ></textarea>
            <div class="ai-workbench__compact-composer-actions">
              <button class="b3-button b3-button--text ai-workbench__compact-composer-send" type="button" :disabled="!!followUpDisabledReason || !followUpDraft.trim()" @click="submitFollowUp">
                {{ t('askFollowUp', '继续追问') }}
              </button>
            </div>
          </div>

          <div class="ai-workbench__follow-up-hint">
            {{ followUpDisabledReason || activeViewMeta.followUpHint }}
          </div>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AICardCandidate, AIMakeCardMode, AITaskType } from '@/types/ai';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';

type SectionDescriptor = {
  key: string;
  title: string;
  kind: 'list' | 'text';
  items: string[];
  text: string;
  accent?: boolean;
};

type ContextDetailRow = {
  key: string;
  label: string;
  value: string;
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
const followUpDraft = ref('');
const detailsVisible = ref(false);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const tabs = computed(() => [
  { key: 'tutor' as AITaskType, label: t('aiTutor', 'AI 导师'), brief: t('aiTutorBrief', '沿当前批次继续想') },
  { key: 'explain' as AITaskType, label: t('aiExplainCard', 'AI 解释卡片'), brief: t('aiExplainBrief', '解释这张卡为什么值得记') },
  { key: 'make-cards' as AITaskType, label: t('aiMakeCards', 'AI 辅助制卡'), brief: t('aiMakeCardsBrief', '先给候选，再决定是否落卡') },
]);

const showSidebar = computed(() => state.surface === 'standalone-dialog');
const showInlineClose = computed(() => state.surface === 'review-dialog-sidecar');

const templateOptions = computed(() => {
  if (state.makeCardMode === 'qa') {
    return [
      { value: 'builtin-basic-qa', label: t('basicQaTemplate', '基础问答') },
      { value: 'builtin-bidirectional', label: t('bidirectionalTemplate', '双向卡片') },
    ];
  }
  if (state.makeCardMode === 'cloze') {
    return [{ value: 'builtin-multi-cloze', label: t('multiClozeTemplate', '多填空卡片') }];
  }
  return [
    { value: 'builtin-concept-definition', label: t('conceptDefinitionTemplateBoth', '概念定义卡（双向）') },
    { value: 'builtin-concept-definition-forward', label: t('conceptDefinitionTemplateForward', '概念定义卡（正向）') },
    { value: 'builtin-concept-definition-reverse', label: t('conceptDefinitionTemplateReverse', '概念定义卡（反向）') },
    { value: 'builtin-concept-descriptor', label: t('conceptDescriptorTemplate', '概念描述符卡') },
    { value: 'builtin-concept-descriptor-auto', label: t('descriptorTemplate', '描述符卡') },
    { value: 'builtin-concept-descriptor-reverse', label: t('conceptDescriptorTemplateReverse', '概念描述符卡（反向）') },
    { value: 'builtin-concept-descriptor-both', label: t('conceptDescriptorTemplateBoth', '概念描述符卡（双向）') },
  ];
});

const generateCandidatesLabel = computed(() => (
  state.makeCardMode === 'cdf'
    ? t('generateCdfCandidates', '生成 CDF 候选')
    : t('generateCandidates', '生成候选')
));

const keptCandidates = computed(() => state.makeCardsResult?.candidates.filter((candidate) => !candidate.discarded) || []);
const activeViewState = computed(() => state.viewState[state.activeView]);
const keptPendingCandidates = computed(() => keptCandidates.value.filter((candidate) => candidate.draftState !== 'created'));
const saveableCandidates = computed(() => keptPendingCandidates.value.filter((candidate) => canSaveCandidate(candidate)));
const discardedDraftCandidates = computed(() => {
  const activeSessionId = String(state.makeCardsResult?.draftSession?.sessionBlockId || '').trim();
  if (!activeSessionId) {
    return [];
  }
  return (state.makeCardsResult?.candidates || []).filter((candidate) => (
    candidate.discarded === true
    && candidate.draftState !== 'created'
    && candidate.draftLocation?.sessionBlockId === activeSessionId
  ));
});
const draftSyncCandidates = computed(() => [
  ...saveableCandidates.value,
  ...discardedDraftCandidates.value,
]);
const readyToCreateCandidates = computed(() => keptPendingCandidates.value.filter((candidate) => canCreateCandidate(candidate)));
const bulkCreateDisabled = computed(() => {
  if (state.isLoading || activeViewState.value.stale || keptPendingCandidates.value.length === 0) {
    return true;
  }
  return keptPendingCandidates.value.some((candidate) => !canCreateCandidate(candidate));
});
const currentCard = computed(() => state.context?.currentCard || null);
const visibleBlocks = computed(() => (state.context?.blocks || []).slice(0, 4));
const hiddenBlockCount = computed(() => Math.max(0, (state.context?.blocks.length || 0) - visibleBlocks.value.length));
const followUps = computed(() => service.getFollowUps());
const draftStorageMode = computed(() => {
  if (typeof service.getDraftStorageMode === 'function') {
    return service.getDraftStorageMode();
  }
  return 'daily-note' as const;
});
const usesDailyNoteDraftStorage = computed(() => draftStorageMode.value === 'daily-note');
const saveDraftActionLabel = computed(() => (
  usesDailyNoteDraftStorage.value
    ? t('saveToDailyNote', '保存到 Daily Note')
    : t('saveDraft', '保存草稿')
));

const revealLocked = computed(() => {
  return state.context?.source === 'review'
    && currentCard.value !== null
    && currentCard.value.explainRequiresReveal
    && !currentCard.value.revealed;
});

const canShowSensitiveCardContent = computed(() => !revealLocked.value);
const followUpDisabledReason = computed(() => service.getFollowUpDisabledReason());
const queueProgress = computed(() => state.context?.queueProgress ?? null);

const currentQueueLabel = computed(() => {
  const label = String(queueProgress.value?.queueLabel || '').trim();
  if (label.length > 0) {
    return label;
  }
  const queueType = String(state.context?.queueType || '').trim();
  return queueType;
});

const reviewSessionProgressLabel = computed(() => {
  const progress = queueProgress.value;
  if (!progress) {
    return '';
  }
  if (typeof progress.total === 'number' && Number.isFinite(progress.total) && progress.total > 0) {
    return t('reviewProgressValue', '已复习 {completed}/{total}')
      .replace('{completed}', String(progress.completed))
      .replace('{total}', String(progress.total));
  }
  return t('reviewProgressRemainingValue', '剩余 {remaining}')
    .replace('{remaining}', String(progress.remaining));
});

const neuralDetail = computed(() => {
  const batch = state.context?.neuralBatch;
  if (!batch) {
    return null;
  }

  if (batch.kind === 'orbit-round') {
    const roundNodes = Array.isArray(batch.roundNodes) ? batch.roundNodes : [];
    const currentIndex = roundNodes.findIndex((node) => node.nodeId === batch.currentNodeId);
    const displayIndex = currentIndex >= 0 ? currentIndex + 1 : (roundNodes.length > 0 ? 1 : 0);
    return {
      label: t('currentOrbitRound', '当前轨道轮次'),
      value: roundNodes.length > 0 ? `${displayIndex}/${roundNodes.length}` : t('notAvailable', '暂无'),
    };
  }

  const navigationState = batch.navigationState;
  const currentPathIndex = Number(navigationState?.currentPathIndex ?? -1);
  const pathLength = Number(navigationState?.pathLength ?? 0);
  if (pathLength > 0 && currentPathIndex >= 0) {
    return {
      label: t('currentPathPosition', '当前路径位置'),
      value: `${currentPathIndex + 1}/${pathLength}`,
    };
  }

  return {
    label: t('currentPathPosition', '当前路径位置'),
    value: t('notAvailable', '暂无'),
  };
});

const detailsToggleLabel = computed(() => (
  detailsVisible.value ? t('hideDetails', '隐藏详情') : t('details', '详情')
));

const currentCardRoleLabel = computed(() => {
  if (!currentCard.value) {
    return '';
  }
  return currentCard.value.hasAnswerFace
    ? t('retrievalModeCard', '提取型卡片')
    : t('readModeCard', '阅读型卡片');
});

const showAnswerStatus = computed(() => currentCard.value?.hasAnswerFace === true);
const answerVisibilityLabel = computed(() => (
  revealLocked.value ? t('answersHidden', '答案隐藏中') : t('answersVisible', '答案已可见')
));
const neuralDetailLabel = computed(() => neuralDetail.value?.label || '');
const neuralDetailValue = computed(() => neuralDetail.value?.value || '');
const contextDetailRows = computed<ContextDetailRow[]>(() => {
  const rows: ContextDetailRow[] = [];
  if (currentQueueLabel.value) {
    rows.push({
      key: 'queue',
      label: t('currentQueue', '当前队列'),
      value: currentQueueLabel.value,
    });
  }
  if (reviewSessionProgressLabel.value) {
    rows.push({
      key: 'review-progress',
      label: t('reviewSessionProgress', '本次复习进度'),
      value: reviewSessionProgressLabel.value,
    });
  }
  if (neuralDetailLabel.value && neuralDetailValue.value) {
    rows.push({
      key: 'neural-detail',
      label: neuralDetailLabel.value,
      value: neuralDetailValue.value,
    });
  }
  if (currentCard.value) {
    rows.push({
      key: 'card-role',
      label: t('cardRole', '卡片职责'),
      value: currentCardRoleLabel.value,
    });
    rows.push({
      key: 'review-action',
      label: t('reviewAction', '复习动作'),
      value: currentCard.value.reviewActionLabel,
    });
  }
  if (showAnswerStatus.value) {
    rows.push({
      key: 'answer-face',
      label: t('answerFace', '答案面'),
      value: answerVisibilityLabel.value,
    });
  }
  rows.push({
    key: 'source',
    label: t('source', '来源'),
    value: sourceLabel.value,
  });
  return rows;
});

const sourceLabel = computed(() => {
  switch (state.context?.source) {
    case 'review':
      return t('reviewing', '复习中');
    case 'browser':
      return t('browser', '浏览器');
    case 'template-dialog':
      return t('templateDialog', '模板制卡');
    default:
      return t('standaloneWorkbench', '独立工作台');
  }
});

const activeViewMeta = computed(() => {
  if (state.activeView === 'tutor') {
    return {
      title: t('aiTutor', 'AI 导师'),
      description: t('aiTutorDescription', '更像陪你思考的导师，而不是提前替你总结。'),
      kicker: 'Tutor Mode',
      headline: t('aiTutorHeadline', '围绕当前神经漫游路径，帮你看到模式、张力和下一步方向'),
      helper: t('aiTutorHelper', '会优先读取当前节点、当前路径位置、当前卡片和最近路径。'),
      emptyBody: t('aiTutorEmptyBody', '适合在神经漫游里停一下，让 AI 帮你指出盲区和值得继续追的线索。'),
      bullets: [
        t('aiTutorBullet1', '默认不会直接替你产出正式总结。'),
        t('aiTutorBullet2', '重点是帮你继续搭隐性知识网络。'),
        t('aiTutorBullet3', '你可以看完后再决定是否转成候选卡。'),
      ],
      dockTitle: t('aiTutorDockTitle', '像一个旁边的导师'),
      dockHint: t('aiTutorDockHint', '先给你方向感，再由你决定要不要进一步形式化。'),
      followUpHint: t('aiTutorFollowUpHint', '可以继续追问某条线索、某个张力，或让它解释为什么这一批值得继续漫游。'),
    };
  }
  if (state.activeView === 'explain') {
    return {
      title: t('aiExplainCard', 'AI 解释卡片'),
      description: t('aiExplainDescription', '把当前卡片放回原来的知识网络里解释。'),
      kicker: 'Explain Mode',
      headline: t('aiExplainHeadline', '解释它在考什么、为什么会错，以及它和什么知识团簇相连'),
      helper: t('aiExplainHelper', '在 review 里会尊重 reveal 边界，避免 AI 变成直接透题。'),
      emptyBody: t('aiExplainEmptyBody', '适合你已经 reveal 后，想知道这张卡为什么值得记、和哪些材料连在一起时使用。'),
      bullets: [
        t('aiExplainBullet1', '重点不是复述答案，而是解释“为什么这样出题”。'),
        t('aiExplainBullet2', '会尽量建立在当前卡与来源块上。'),
        t('aiExplainBullet3', '如果解释里出现合适的点，可以直接转候选制卡。'),
      ],
      dockTitle: t('aiExplainDockTitle', '解释，不是代答'),
      dockHint: t('aiExplainDockHint', '在 review 流里先 reveal，再解释，会更符合提取练习的节奏。'),
      followUpHint: t('aiExplainFollowUpHint', '可以继续追问这张卡的边界、因果、和哪些旧知识容易混，或以后遇到什么情境该想起它。'),
    };
  }
  if (state.makeCardMode === 'cdf') {
    return {
      title: t('cdfMode', 'CDF 辅助制卡'),
      description: t('aiMakeCardsCdfDescription', '按 CDF 先立概念锚点，再拆高价值描述维度，生成更稳的概念定义 / 描述符候选卡。'),
      kicker: 'CDF Mode',
      headline: t('aiMakeCardsCdfHeadline', '让 AI 先找概念，再用描述维度把材料拆成真正值得复习的候选卡'),
      helper: t('aiMakeCardsCdfHelper', '优先提炼概念定义、边界、特征、机制、条件、证据、对比和例子，并继续走现有草稿保存与建卡链路。'),
      emptyBody: t('aiMakeCardsCdfEmptyBody', '适合面对一段信息时，先按 CDF 找概念锚点和稳定描述符，再决定哪些候选真的值得落卡。'),
      bullets: [
        t('aiMakeCardsCdfBullet1', '先按 CDF 找概念锚点与稳定定义。'),
        t('aiMakeCardsCdfBullet2', '再抽高价值描述维度，如边界、机制、条件、证据、对比和例子。'),
        t('aiMakeCardsCdfBullet3', '最后筛掉凑数项，只保留能稳定回忆的候选卡。'),
      ],
      dockTitle: t('aiMakeCardsCdfDockTitle', '三步走：概念锚点、描述维度、候选落卡'),
      dockHint: t('aiMakeCardsCdfDockHint', 'CDF 结果仍会先落到草稿，再走现有概念定义 / 描述符建卡链路。'),
      followUpHint: t('aiMakeCardsCdfFollowUpHint', '可以继续追问概念锚点是否稳、哪些描述维度该删、该用概念定义还是概念描述符模板。'),
    };
  }
  return {
    title: t('aiMakeCards', 'AI 辅助制卡'),
    description: usesDailyNoteDraftStorage.value
      ? t('aiMakeCardsDescription', '从当前材料生成候选卡，先筛、再改、再保存到 Daily Note，最后才真正落卡。')
      : t('aiMakeCardsDescriptionConfiguredStorage', '从当前材料生成候选卡，先筛、再改、再保存到配置位置，最后才真正落卡。'),
    kicker: 'Candidate Mode',
    headline: t('aiMakeCardsHeadline', '把 AI 放在“起草候选和草稿保存”而不是“直接写入建卡”的位置'),
    helper: usesDailyNoteDraftStorage.value
      ? t('aiMakeCardsHelper', '先把确认过的候选写进当天 Daily Note，再从这些实体草稿块正式建卡。')
      : t('aiMakeCardsHelperConfiguredStorage', '先把确认过的候选写进配置好的草稿区，再从这些实体草稿块正式建卡。'),
    emptyBody: t('aiMakeCardsEmptyBody', '适合在浏览器里选一批块，或者从解释结果里继续转成候选卡，然后显式保存草稿再建卡。'),
    bullets: [
      t('aiMakeCardsBullet1', '先选模式并生成候选。'),
      usesDailyNoteDraftStorage.value
        ? t('aiMakeCardsBullet2', '每条候选都能轻改、删除、保留，再保存到 Daily Note。')
        : t('aiMakeCardsBullet2ConfiguredStorage', '每条候选都能轻改、删除、保留，再保存到配置位置。'),
      t('aiMakeCardsBullet3', '只有保存成草稿后，才会真正走现有制卡链路。'),
    ],
    dockTitle: t('aiMakeCardsDockTitle', '三步走：生成、存草稿、建卡'),
    dockHint: usesDailyNoteDraftStorage.value
      ? t('aiMakeCardsDockHint', 'Daily Note 草稿块会直接作为卡面来源，避免 AI 候选和最终卡面脱节。')
      : t('aiMakeCardsDockHintConfiguredStorage', '配置位置里的草稿块会直接作为卡面来源，避免 AI 候选和最终卡面脱节。'),
    followUpHint: t('aiMakeCardsFollowUpHint', '可以继续问候选为什么这样拆、有没有更好的模板选择，或让它缩窄成更少但更稳定的卡。'),
  };
});

const tutorSections = computed<SectionDescriptor[]>(() => {
  const result = state.tutorResult;
  if (!result) {
    return [];
  }
  return [
    {
      key: 'blind-spots',
      title: t('aiTutorBlindSpots', '你可能忽略了什么'),
      kind: 'list',
      items: result.blindSpots,
      text: '',
    },
    {
      key: 'patterns',
      title: t('aiTutorPatterns', '这批材料里的共同模式 / 张力'),
      kind: 'list',
      items: result.patterns,
      text: '',
    },
    {
      key: 'next-lines',
      title: t('aiTutorNextLines', '下一步追哪条线'),
      kind: 'list',
      items: result.nextLines,
      text: '',
    },
    {
      key: 'card-ideas',
      title: t('aiTutorCardIdeas', '哪些点值得转成候选卡'),
      kind: 'list',
      items: result.cardIdeas,
      text: '',
    },
    {
      key: 'batch-summary',
      title: t('aiTutorBatchSummary', '本批总结'),
      kind: 'text',
      items: [],
      text: result.batchSummary || '',
      accent: true,
    },
  ].filter((section) => (section.kind === 'text' ? section.text.length > 0 : section.items.length > 0));
});

const explainSections = computed<SectionDescriptor[]>(() => {
  const result = state.explainResult;
  if (!result) {
    return [];
  }
  return [
    {
      key: 'working-definition',
      title: t('aiExplainWorkingDefinition', '工作定义'),
      kind: 'text',
      items: [],
      text: result.workingDefinition,
      accent: true,
    },
    {
      key: 'what-it-tests',
      title: t('aiExplainWhatItTests', '这张卡在考什么'),
      kind: 'text',
      items: [],
      text: result.whatItTests,
    },
    {
      key: 'why-tricky',
      title: t('aiExplainWhyTricky', '为什么容易错'),
      kind: 'text',
      items: [],
      text: result.whyItsTricky,
    },
    {
      key: 'connections',
      title: t('aiExplainConnections', '它和现有知识网络的连接'),
      kind: 'list',
      items: result.connections,
      text: '',
    },
    {
      key: 'triggers',
      title: t('aiExplainTriggers', '下次什么时候该想起它'),
      kind: 'list',
      items: result.triggers,
      text: '',
    },
    {
      key: 'card-ideas',
      title: t('aiExplainCardIdeas', '候选制卡提示'),
      kind: 'list',
      items: result.cardIdeas,
      text: '',
    },
  ].filter((section) => (section.kind === 'text' ? section.text.length > 0 : section.items.length > 0));
});

const assistantStatus = computed(() => {
  if (state.isLoading) return t('processing', '处理中…');
  if (activeViewState.value.stale) return t('resultStale', '结果已过期');
  if (state.error) return t('needsAdjustment', '需要调整');
  if (state.activeView === 'tutor' && state.tutorResult) return t('tutorResponded', '导师已响应');
  if (state.activeView === 'explain' && state.explainResult) return t('explanationReady', '解释已生成');
  if (state.activeView === 'make-cards' && state.makeCardsResult) return `${state.makeCardsResult.candidates.length} ${t('candidateCountSuffix', '条候选')}`;
  return t('waitingToRun', '等待运行');
});

const staleActionLabel = computed(() => {
  if (state.activeView === 'tutor') {
    return t('rerunTutorForCurrentBatch', '基于当前批次重新导师');
  }
  if (state.activeView === 'explain') {
    return t('rerunExplainForCurrentCard', '基于当前卡重新解释');
  }
  return t('rerunCandidatesForCurrentContext', '基于当前上下文重新生成');
});

const followUpPlaceholder = computed(() => {
  if (followUpDisabledReason.value) {
    return followUpDisabledReason.value;
  }
  if (state.activeView === 'tutor') {
    return t('askTutorPlaceholder', '继续追问某条线索、某个盲区，或让导师展开某个模式…');
  }
  if (state.activeView === 'explain') {
    return t('askExplainPlaceholder', '继续追问这张卡为什么会错、和哪些知识容易混淆…');
  }
  return t('askCandidatePlaceholder', '继续追问候选为什么这样拆、还能不能更稳、更少、更贴近你的材料…');
});

function previewText(value: string | null | undefined, maxLength = 160): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function handleModeChange(event: Event): void {
  service.setMakeCardMode((event.target as HTMLSelectElement).value as AIMakeCardMode);
}

function isCandidateLocked(candidate: AICardCandidate): boolean {
  return activeViewState.value.stale
    || state.isLoading
    || candidate.draftState === 'saving'
    || candidate.draftState === 'creating'
    || candidate.draftState === 'created';
}

function canSaveCandidate(candidate: AICardCandidate): boolean {
  if (candidate.discarded || activeViewState.value.stale || state.isLoading) {
    return false;
  }
  if (candidate.draftState === 'saving' || candidate.draftState === 'creating' || candidate.draftState === 'created') {
    return false;
  }
  if (candidate.draftState === 'unsaved' || candidate.draftState === 'dirty') {
    return true;
  }
  return candidate.draftState === 'error' && candidate.draftErrorOperation !== 'create';
}

function canCreateCandidate(candidate: AICardCandidate): boolean {
  if (candidate.discarded || activeViewState.value.stale || state.isLoading) {
    return false;
  }
  if (candidate.draftState === 'saved') {
    return candidate.draftLocation !== null;
  }
  return candidate.draftState === 'error'
    && candidate.draftErrorOperation === 'create'
    && candidate.draftLocation !== null;
}

function candidateStatusText(candidate: AICardCandidate): string {
  switch (candidate.draftState) {
    case 'saving':
      return usesDailyNoteDraftStorage.value
        ? t('savingDraft', '保存到 Daily Note 中')
        : t('savingDraftGeneric', '保存草稿中');
    case 'saved':
      return usesDailyNoteDraftStorage.value
        ? t('draftSaved', '已保存到 Daily Note')
        : t('draftSavedGeneric', '已保存草稿');
    case 'dirty':
      return t('draftDirty', '已修改，需重新保存');
    case 'creating':
      return t('creating', '创建中');
    case 'created':
      return t('created', '已创建');
    case 'error':
      if (candidate.draftError) {
        return candidate.draftError;
      }
      return candidate.draftErrorOperation === 'create'
        ? t('createFailedRetryable', '创建失败，可直接重试')
        : t('saveFailedRetryable', '保存失败，请重试');
    case 'unsaved':
    default:
      return usesDailyNoteDraftStorage.value
        ? t('draftUnsaved', '待保存到 Daily Note')
        : t('draftUnsavedGeneric', '待保存草稿');
  }
}

function jumpToMakeCards(): void {
  service.setActiveView('make-cards');
}

async function rerunActiveView(): Promise<void> {
  await service.runActiveView();
}

async function runCandidateAction(action: () => Promise<void>): Promise<void> {
  state.error = null;
  try {
    await action();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
}

async function saveSingleCandidate(candidateId: string): Promise<void> {
  await runCandidateAction(() => service.saveSelectedCandidatesToDailyNote([candidateId]));
}

async function saveKeptCandidates(): Promise<void> {
  await runCandidateAction(() => service.saveSelectedCandidatesToDailyNote());
}

async function createSingleCandidate(candidateId: string): Promise<void> {
  await runCandidateAction(() => service.createSelectedCandidates([candidateId]));
}

async function createKeptCandidates(): Promise<void> {
  await runCandidateAction(() => service.createSelectedCandidates());
}

async function submitFollowUp(): Promise<void> {
  const draft = followUpDraft.value.trim();
  if (!draft) {
    return;
  }
  await service.submitFollowUp(draft);
  if (!state.error) {
    followUpDraft.value = '';
  }
}

watch(
  () => state.activeView,
  () => {
    followUpDraft.value = '';
  },
);
</script>

<style scoped>
.ai-workbench-pane {
  --ai-panel-bg: linear-gradient(180deg, rgba(251, 251, 255, 0.98), rgba(246, 247, 255, 0.96));
  --ai-panel-border: rgba(112, 102, 173, 0.16);
  --ai-panel-shadow: 0 18px 44px rgba(42, 39, 74, 0.08);
  --ai-accent-soft: rgba(111, 89, 232, 0.08);
  --ai-accent-strong: #4f39c8;
  --ai-warm-line: rgba(112, 102, 173, 0.12);
  height: 100%;
  min-height: 0;
  background:
    radial-gradient(circle at top left, rgba(132, 114, 228, 0.08), transparent 30%),
    radial-gradient(circle at bottom right, rgba(170, 192, 255, 0.08), transparent 26%),
    var(--b3-theme-background);
}

.ai-workbench-pane--standalone-dialog {
  min-height: 680px;
  padding: 16px;
}

.ai-workbench-pane--review-dialog-sidecar,
.ai-workbench-pane--review-tab-companion {
  padding: 0;
  background: linear-gradient(180deg, rgba(247, 248, 255, 0.98), rgba(243, 245, 252, 0.98));
}

.ai-workbench__shell {
  display: grid;
  grid-template-columns: minmax(290px, 360px) minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.ai-workbench-pane--compact .ai-workbench__shell {
  grid-template-columns: 1fr;
  gap: 0;
}

.ai-workbench__sidebar,
.ai-workbench__main {
  min-width: 0;
  min-height: 0;
  border-radius: 22px;
  border: 1px solid var(--ai-panel-border);
  background: var(--ai-panel-bg);
  box-shadow: var(--ai-panel-shadow);
}

.ai-workbench-pane--compact .ai-workbench__main {
  border-radius: 0;
  border: none;
  box-shadow: none;
  background: linear-gradient(180deg, rgba(251, 252, 255, 0.98), rgba(245, 247, 252, 0.98));
}

.ai-workbench__sidebar {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  overflow: auto;
}

.ai-workbench__hero,
.ai-workbench__panel,
.ai-workbench__message,
.ai-workbench__result-card,
.ai-workbench__candidate,
.ai-workbench__thread-entry,
.ai-workbench__compact-card {
  border-radius: 18px;
  border: 1px solid rgba(179, 169, 150, 0.24);
  background: rgba(255, 252, 245, 0.94);
}

.ai-workbench__hero {
  padding: 18px;
  background: linear-gradient(135deg, rgba(193, 168, 116, 0.2), rgba(141, 170, 159, 0.12));
}

.ai-workbench__eyebrow,
.ai-workbench__main-kicker,
.ai-workbench__mini-label,
.ai-workbench__thread-role {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--b3-theme-on-surface-light);
}

.ai-workbench__hero h2,
.ai-workbench__main-head h3 {
  margin: 10px 0 8px;
}

.ai-workbench__hero p,
.ai-workbench__main-head p,
.ai-workbench__dock-copy p,
.ai-workbench__mini-card p,
.ai-workbench__message p,
.ai-workbench__result-card p,
.ai-workbench__thread-entry p,
.ai-workbench__compact-card p {
  margin: 0;
  line-height: 1.65;
}

.ai-workbench__tabs,
.ai-workbench__list,
.ai-workbench__field-list,
.ai-workbench__feed {
  display: grid;
  gap: 10px;
}

.ai-workbench__tab {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: rgba(244, 239, 228, 0.88);
  cursor: pointer;
}

.ai-workbench__tab--active,
.ai-workbench__compact-tab--active {
  background: linear-gradient(135deg, rgba(188, 162, 113, 0.18), rgba(141, 170, 159, 0.1));
  border-color: rgba(123, 94, 54, 0.2);
  color: var(--ai-accent-strong);
}

.ai-workbench__tab span,
.ai-workbench__more-line,
.ai-workbench__candidate-meta,
.ai-workbench__field-item label,
.ai-workbench__follow-up-hint {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.ai-workbench__panel,
.ai-workbench__compact-card {
  padding: 14px;
}

.ai-workbench__panel-title,
.ai-workbench__thread-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.ai-workbench__context-rows {
  display: grid;
  gap: 8px;
}

.ai-workbench__context-row,
.ai-workbench__compact-details-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.ai-workbench__context-row span,
.ai-workbench__compact-details-row span {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.ai-workbench__context-row strong,
.ai-workbench__compact-details-row strong {
  text-align: right;
  font-size: 13px;
  color: var(--b3-theme-on-background);
}

.ai-workbench__chips,
.ai-workbench__compact-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-workbench__chip,
.ai-workbench__compact-chip {
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--ai-accent-soft);
  color: var(--ai-accent-strong);
  font-size: 12px;
}

.ai-workbench__compact-chip--warning {
  background: rgba(214, 166, 74, 0.14);
  color: #8a6115;
}

.ai-workbench__mini-card {
  padding: 12px;
  border-radius: 14px;
  background: rgba(251, 249, 243, 0.92);
  border: 1px solid rgba(179, 169, 150, 0.2);
}

.ai-workbench__mini-card--warning,
.ai-workbench__message--stale {
  background: rgba(255, 244, 220, 0.82);
}

.ai-workbench__main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-workbench__main-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--ai-warm-line);
}

.ai-workbench__main-controls {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ai-workbench__status {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(237, 231, 218, 0.92);
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.ai-workbench__status--busy {
  background: rgba(188, 162, 113, 0.16);
  color: var(--ai-accent-strong);
}

.ai-workbench__status--error {
  background: rgba(214, 74, 92, 0.1);
  color: #bb3047;
}

.ai-workbench__compact-bar {
  display: grid;
  gap: 10px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--ai-warm-line);
  background: rgba(255, 252, 246, 0.92);
}

.ai-workbench__compact-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-workbench__compact-tab {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(181, 168, 142, 0.24);
  background: rgba(245, 241, 232, 0.92);
  cursor: pointer;
}

.ai-workbench__feed {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 24px;
}

.ai-workbench__message,
.ai-workbench__result-card,
.ai-workbench__thread-entry {
  padding: 18px;
}

.ai-workbench__message--welcome,
.ai-workbench__result-card--accent {
  background: linear-gradient(135deg, rgba(188, 162, 113, 0.12), rgba(141, 170, 159, 0.08), rgba(255, 255, 255, 0.96));
}

.ai-workbench__message strong,
.ai-workbench__result-card h4,
.ai-workbench__dock-copy strong {
  display: block;
  margin-bottom: 8px;
}

.ai-workbench__message ul,
.ai-workbench__result-card ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}

.ai-workbench__message--error {
  background: rgba(255, 245, 247, 0.94);
  border-color: rgba(214, 74, 92, 0.24);
}

.ai-workbench__compact-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.ai-workbench__compact-card-sub {
  margin-top: 10px !important;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.ai-workbench__candidate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}

.ai-workbench__candidate {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.ai-workbench__candidate--discarded {
  opacity: 0.58;
}

.ai-workbench__candidate--readonly {
  border-style: dashed;
}

.ai-workbench__candidate-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 8px;
}

.ai-workbench__candidate-preview,
.ai-workbench__field-item textarea,
.ai-workbench__follow-up-input {
  width: 100%;
  min-height: 80px;
  resize: vertical;
}

.ai-workbench__candidate-actions,
.ai-workbench__dock-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.ai-workbench__thread {
  display: grid;
  gap: 10px;
}

.ai-workbench__thread-entry--user {
  background: rgba(238, 244, 255, 0.9);
}

.ai-workbench__thread-entry--assistant {
  background: rgba(255, 252, 245, 0.94);
}

.ai-workbench__thread-role {
  margin-bottom: 8px;
}

.ai-workbench__dock {
  display: grid;
  gap: 12px;
  padding: 18px 24px 22px;
  border-top: 1px solid var(--ai-warm-line);
  background: linear-gradient(180deg, rgba(255, 252, 246, 0.9), rgba(246, 242, 233, 0.96));
}

.ai-workbench__dock-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.ai-workbench__follow-up {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.ai-workbench__mode-select {
  min-width: 180px;
}

@media (max-width: 1080px) {
  .ai-workbench-pane--standalone-dialog .ai-workbench__shell {
    grid-template-columns: 1fr;
  }

  .ai-workbench-pane--standalone-dialog .ai-workbench__sidebar {
    max-height: 42vh;
  }
}

@media (max-width: 720px) {
  .ai-workbench-pane--standalone-dialog {
    padding: 8px;
  }

  .ai-workbench__main-head,
  .ai-workbench__dock,
  .ai-workbench__feed {
    padding-left: 16px;
    padding-right: 16px;
  }

  .ai-workbench__main-head,
  .ai-workbench__dock-row,
  .ai-workbench__candidate-head,
  .ai-workbench__follow-up {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .ai-workbench__candidate-grid {
    grid-template-columns: 1fr;
  }

  .ai-workbench__dock-actions > * {
    width: 100%;
  }
}

.ai-workbench-pane {
  --ai-panel-bg: linear-gradient(180deg, rgba(252, 252, 255, 0.98), rgba(246, 247, 253, 0.98));
  --ai-panel-border: rgba(112, 102, 173, 0.14);
  --ai-panel-shadow: 0 12px 32px rgba(42, 39, 74, 0.06);
  --ai-accent-soft: rgba(111, 89, 232, 0.08);
  --ai-accent-strong: #4f39c8;
  --ai-warm-line: rgba(112, 102, 173, 0.12);
  background: linear-gradient(180deg, rgba(250, 250, 255, 0.98), rgba(243, 244, 251, 0.98));
}

.ai-workbench-pane--review-dialog-sidecar,
.ai-workbench-pane--review-tab-companion {
  background: linear-gradient(180deg, rgba(249, 249, 255, 0.98), rgba(242, 243, 251, 0.98));
}

.ai-workbench-pane--compact .ai-workbench__main {
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border: none;
  box-shadow: none;
  background: linear-gradient(180deg, rgba(249, 249, 255, 0.98), rgba(242, 243, 251, 0.98));
}

.ai-workbench__sidebar,
.ai-workbench__main,
.ai-workbench__hero,
.ai-workbench__panel,
.ai-workbench__message,
.ai-workbench__result-card,
.ai-workbench__candidate,
.ai-workbench__thread-entry,
.ai-workbench__compact-context-card {
  border-color: rgba(112, 102, 173, 0.14);
}

.ai-workbench__hero,
.ai-workbench__message--welcome,
.ai-workbench__result-card--accent {
  background: linear-gradient(180deg, rgba(248, 247, 255, 0.98), rgba(243, 244, 251, 0.98));
}

.ai-workbench__mini-card,
.ai-workbench__compact-context-card,
.ai-workbench__compact-message-card,
.ai-workbench__compact-response-card,
.ai-workbench__compact-context-item,
.ai-workbench__compact-composer,
.ai-workbench__compact-banner {
  border: 1px solid rgba(112, 102, 173, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 6px 18px rgba(42, 39, 74, 0.04);
}

.ai-workbench__status {
  background: rgba(244, 244, 251, 0.96);
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__status--busy {
  background: rgba(111, 89, 232, 0.08);
  color: #4f39c8;
}

.ai-workbench__status--error {
  background: rgba(255, 241, 245, 0.95);
  color: #b83663;
}

.ai-workbench__compact-bar {
  display: grid;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(112, 102, 173, 0.08);
  background: rgba(249, 249, 255, 0.88);
}

.ai-workbench__compact-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ai-workbench__compact-head-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ai-workbench__compact-head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 999px;
  color: white;
  background: linear-gradient(180deg, #775ef3, #694bf0);
  box-shadow: 0 8px 18px rgba(111, 89, 232, 0.16);
}

.ai-workbench__compact-head-icon svg,
.ai-workbench__compact-close svg {
  width: 14px;
  height: 14px;
}

.ai-workbench__compact-close {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid rgba(112, 102, 173, 0.1);
  background: rgba(255, 255, 255, 0.94);
  color: rgba(40, 49, 79, 0.72);
  box-shadow: 0 3px 10px rgba(42, 39, 74, 0.03);
}

.ai-workbench__compact-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-workbench__compact-head-copy {
  min-width: 0;
}

.ai-workbench__compact-head-copy strong {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.2;
}

.ai-workbench__details-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 0 10px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(112, 102, 173, 0.1);
  background: rgba(255, 255, 255, 0.9);
  color: rgba(40, 49, 79, 0.68);
  font-size: 12px;
  font-weight: 600;
  transition: border-color 140ms ease, color 140ms ease, background-color 140ms ease;
}

.ai-workbench__details-toggle--expanded {
  border-color: rgba(111, 89, 232, 0.16);
  color: #4f39c8;
  background: rgba(245, 244, 255, 0.98);
}

.ai-workbench__compact-switcher {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid rgba(112, 102, 173, 0.1);
  background: rgba(243, 244, 252, 0.96);
}

.ai-workbench__compact-switch {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(40, 49, 79, 0.68);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
}

.ai-workbench__compact-switch--active {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(111, 89, 232, 0.16);
  color: #4f39c8;
  box-shadow: 0 3px 8px rgba(42, 39, 74, 0.03);
}

.ai-workbench__compact-details-tray {
  padding: 12px;
  display: grid;
  gap: 10px;
  border-radius: 16px;
  border: 1px solid rgba(112, 102, 173, 0.1);
  background: rgba(250, 250, 255, 0.98);
}

.ai-workbench__compact-details-meta {
  display: grid;
  gap: 6px;
}

.ai-workbench__compact-details-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.ai-workbench__compact-details-row span {
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__compact-details-row strong {
  text-align: right;
  color: rgba(20, 25, 42, 0.9);
}

.ai-workbench__compact-details-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(112, 102, 173, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
}

.ai-workbench__compact-details-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__compact-details-description {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__compact-context-list {
  display: grid;
  gap: 8px;
}

.ai-workbench__compact-context-item {
  padding: 12px;
}

.ai-workbench__compact-context-item span {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__compact-context-note {
  margin: 0;
  font-size: 12px;
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__feed {
  gap: 12px;
}

.ai-workbench-pane--compact .ai-workbench__feed {
  padding: 14px 18px 16px;
}

.ai-workbench__compact-message-card,
.ai-workbench__compact-response-card {
  padding: 14px 16px;
}

.ai-workbench__compact-banner {
  display: grid;
  gap: 8px;
  padding: 11px 13px;
  border-radius: 16px;
  border: 1px solid rgba(112, 102, 173, 0.1);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 3px 12px rgba(42, 39, 74, 0.03);
}

.ai-workbench__compact-banner strong {
  display: block;
  font-size: 13px;
}

.ai-workbench__compact-banner p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.ai-workbench__compact-banner--error {
  border-color: rgba(184, 54, 99, 0.18);
  background: rgba(255, 246, 249, 0.98);
}

.ai-workbench__compact-banner--stale {
  border-color: rgba(204, 177, 87, 0.2);
  background: rgba(255, 250, 234, 0.98);
}

.ai-workbench__compact-message-card {
  background: rgba(255, 255, 255, 0.98);
}

.ai-workbench__compact-message-role,
.ai-workbench__compact-thread-role {
  margin-bottom: 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__compact-response-sections {
  display: grid;
  gap: 12px;
}

.ai-workbench__compact-response-section + .ai-workbench__compact-response-section {
  padding-top: 12px;
  border-top: 1px solid rgba(112, 102, 173, 0.08);
}

.ai-workbench__compact-response-section h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.ai-workbench__compact-response-section p,
.ai-workbench__compact-response-section ul,
.ai-workbench__compact-message-card ul {
  margin-top: 0;
}

.ai-workbench__compact-candidate-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
  font-size: 12px;
  color: rgba(40, 49, 79, 0.68);
}

.ai-workbench__candidate-grid--compact {
  grid-template-columns: 1fr;
}

.ai-workbench__candidate-grid--compact .ai-workbench__candidate {
  background: rgba(255, 255, 255, 0.98);
}

.ai-workbench__thread-entry--compact {
  background: rgba(255, 255, 255, 0.98);
}

.ai-workbench__compact-footer {
  display: grid;
  gap: 10px;
  padding: 10px 16px 14px;
  border-top: 1px solid rgba(112, 102, 173, 0.08);
  background: rgba(248, 249, 255, 0.96);
}

.ai-workbench__compact-footer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
}

.ai-workbench__compact-composer {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.ai-workbench__compact-composer-input {
  min-height: 76px;
  border-radius: 14px;
}

.ai-workbench__compact-composer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.ai-workbench__compact-composer-send {
  min-width: 96px;
}

.ai-workbench-fade-enter-active,
.ai-workbench-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.ai-workbench-fade-enter-from,
.ai-workbench-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 720px) {
  .ai-workbench__compact-head,
  .ai-workbench__compact-head-actions,
  .ai-workbench__compact-footer-actions,
  .ai-workbench__compact-composer-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .ai-workbench__compact-switcher {
    grid-template-columns: 1fr;
  }

  .ai-workbench__candidate-grid--compact {
    grid-template-columns: 1fr;
  }
}
</style>
