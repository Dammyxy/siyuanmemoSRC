<template>
  <div
    class="ai-chat"
    :class="[
      `ai-chat--${state.surface}`,
      { 'ai-chat--compact': isCompact },
    ]"
  >
    <aside v-if="state.historyPanelOpen" class="ai-chat__history">
      <div class="ai-chat__history-head">
        <strong>{{ t('aiSessionHistory', '会话历史') }}</strong>
        <button class="b3-button b3-button--text" type="button" @click="service.setHistoryPanelOpen(false)">
          {{ t('close', '关闭') }}
        </button>
      </div>

      <input
        v-model="historyQuery"
        class="b3-text-field ai-chat__history-search"
        :placeholder="t('searchSessions', '搜索会话标题、来源或模式')"
      >

      <div class="ai-chat__history-list">
        <article
          v-for="session in filteredSessionHistory"
          :key="session.id"
          class="ai-chat__history-item"
          :class="{ 'ai-chat__history-item--active': state.sessionId === session.id }"
        >
          <button class="ai-chat__history-open" type="button" @click="openHistorySession(session.id)">
            <strong>{{ session.title }}</strong>
            <span>{{ formatTime(session.updatedAt) }} · {{ sourceLabelFor(session.source) }}</span>
            <span>{{ sessionModeSummary(session) }}</span>
          </button>
          <div class="ai-chat__history-actions">
            <button class="b3-button b3-button--text" type="button" @click="renameHistorySession(session.id, session.title)">
              {{ t('rename', '重命名') }}
            </button>
            <button class="b3-button b3-button--text" type="button" @click="deleteHistorySession(session.id)">
              {{ t('delete', '删除') }}
            </button>
          </div>
        </article>

        <p v-if="filteredSessionHistory.length === 0" class="ai-chat__empty-note">
          {{ t('noAiSessions', '还没有可打开的 AI 会话。') }}
        </p>
      </div>
    </aside>

    <div class="ai-chat__main">
      <header class="ai-chat__topbar">
        <div class="ai-chat__topbar-main">
          <button class="b3-button b3-button--outline" type="button" @click="service.setHistoryPanelOpen(!state.historyPanelOpen)">
            {{ t('history', '历史') }}
          </button>
          <button class="b3-button b3-button--outline" type="button" @click="createNewSession">
            {{ t('newAiSession', '新建会话') }}
          </button>
          <input
            v-model="sessionTitleDraft"
            class="b3-text-field ai-chat__title-input"
            :placeholder="t('untitledAiSession', '未命名会话')"
            @blur="commitSessionTitle"
            @keydown.enter.prevent="commitSessionTitle"
          >
          <span class="ai-chat__pill">{{ sourceLabel }}</span>
          <span v-if="state.contextIsHistorical" class="ai-chat__pill ai-chat__pill--warning">
            {{ t('historicalContext', '历史上下文') }}
          </span>
        </div>

        <div class="ai-chat__topbar-actions">
          <button class="b3-button b3-button--outline" type="button" @click="service.setContextPanelOpen(!state.contextPanelOpen)">
            {{ state.contextPanelOpen ? t('hideContext', '收起上下文') : t('viewContext', '查看上下文') }}
          </button>
          <button class="b3-button b3-button--outline" type="button" @click="openAiSettings">
            {{ t('model', '模型') }}: {{ modelLabel }}
          </button>
          <button class="b3-button b3-button--outline" type="button" @click="deleteCurrentSession">
            {{ t('deleteSession', '删除会话') }}
          </button>
          <button
            v-if="showInlineClose"
            class="block__icon block__icon--show"
            :aria-label="t('closeAiSidecar', '收起 AI 侧栏')"
            :title="t('closeAiSidecar', '收起 AI 侧栏')"
            type="button"
            @click="emit('close')"
          >
            <svg><use xlink:href="#iconCloseRound"></use></svg>
          </button>
        </div>
      </header>

      <nav class="ai-chat__tabs" :aria-label="t('aiWorkbench', 'AI 工作台')">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="ai-chat__tab"
          :class="{ 'ai-chat__tab--active': state.activeView === tab.key }"
          type="button"
          @click="service.setActiveView(tab.key)"
        >
          <strong>{{ tab.label }}</strong>
          <span>{{ tab.brief }}</span>
        </button>
      </nav>

      <transition name="ai-chat-fade">
        <section v-if="state.contextPanelOpen" class="ai-chat__context">
          <div class="ai-chat__context-grid">
            <article class="ai-chat__context-card">
              <div class="ai-chat__section-title">{{ t('currentContext', '当前上下文') }}</div>
              <div class="ai-chat__context-rows">
                <div v-for="row in contextDetailRows" :key="row.key" class="ai-chat__context-row">
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </div>
              </div>
            </article>

            <article v-if="currentCard" class="ai-chat__context-card">
              <div class="ai-chat__section-title">{{ t('currentCardSnapshot', '当前卡片快照') }}</div>
              <p class="ai-chat__context-copy">{{ previewText(currentCard.frontText) || t('noFrontContent', '暂无正面内容') }}</p>
              <p v-if="currentCard.hasAnswerFace && canShowSensitiveCardContent" class="ai-chat__context-copy ai-chat__context-copy--muted">
                {{ previewText(currentCard.backText) || t('noBackContent', '暂无背面内容') }}
              </p>
              <p v-if="canShowSensitiveCardContent && currentCard.sourceText" class="ai-chat__context-copy ai-chat__context-copy--muted">
                {{ previewText(currentCard.sourceText, 220) }}
              </p>
              <p v-if="revealLocked" class="ai-chat__context-copy ai-chat__context-copy--warning">
                {{ t('revealFirstHint', '当前还未 reveal，为避免绕过提取练习，答案和来源内容先隐藏。') }}
              </p>
            </article>
          </div>

          <div class="ai-chat__context-blocks">
            <div class="ai-chat__section-title">{{ t('currentMaterial', '当前材料') }}</div>
            <article v-for="block in visibleBlocks" :key="block.blockId" class="ai-chat__context-block">
              <span>{{ block.type || 'block' }} · {{ block.blockId.slice(0, 8) }}</span>
              <p>{{ previewText(block.text, 120) || t('emptyBlock', '空块') }}</p>
            </article>
            <p v-if="hiddenBlockCount > 0" class="ai-chat__empty-note">
              {{ t('moreContextBlocks', '还有 {count} 个块已纳入上下文').replace('{count}', String(hiddenBlockCount)) }}
            </p>
            <p v-else-if="visibleBlocks.length === 0" class="ai-chat__empty-note">
              {{ t('noExtraBlocks', '当前没有额外选中块，AI 会主要读取当前卡片上下文。') }}
            </p>
          </div>
        </section>
      </transition>

      <article v-if="state.error" class="ai-chat__banner ai-chat__banner--error">
        <strong>{{ t('aiRunFailedTitle', '这次没有顺利跑通') }}</strong>
        <p>{{ state.error }}</p>
      </article>

      <article v-if="state.contextIsHistorical" class="ai-chat__banner ai-chat__banner--warning">
        <strong>{{ t('historicalContextTitle', '你正在查看历史上下文') }}</strong>
        <p>{{ t('historicalContextBody', '这条会话绑定的是之前的材料快照，不会伪装成当前 live context。') }}</p>
      </article>

      <section class="ai-chat__timeline">
        <article v-if="activeMessages.length === 0" class="ai-chat__bubble ai-chat__bubble--assistant ai-chat__bubble--empty">
          <div class="ai-chat__bubble-meta">
            <span>{{ activeViewMeta.title }}</span>
            <span>{{ activeViewMeta.kicker }}</span>
          </div>
          <strong>{{ activeViewMeta.emptyTitle }}</strong>
          <p>{{ activeViewMeta.emptyBody }}</p>
        </article>

        <article
          v-for="message in activeMessages"
          :key="message.id"
          class="ai-chat__bubble"
          :class="messageBubbleClass(message)"
        >
          <div class="ai-chat__bubble-meta">
            <div class="ai-chat__bubble-meta-main">
              <strong>{{ messageSpeaker(message) }}</strong>
              <span>{{ formatTime(message.createdAt) }}</span>
            </div>
            <div class="ai-chat__bubble-actions">
              <button class="b3-button b3-button--text" type="button" @click="copyMessage(message)">
                {{ t('copy', '复制') }}
              </button>
              <button
                v-if="canEditMessage(message)"
                class="b3-button b3-button--text"
                type="button"
                @click="openMessageEditor(message)"
              >
                {{ t('edit', '编辑') }}
              </button>
              <button
                v-if="canRerunMessage(message)"
                class="b3-button b3-button--text"
                type="button"
                :disabled="state.isLoading"
                @click="rerunMessage(message)"
              >
                {{ t('rerun', '重跑') }}
              </button>
              <button
                v-if="canEditUserMessage(message)"
                class="b3-button b3-button--text"
                type="button"
                @click="prepareEditedFollowUp(message)"
              >
                {{ t('editAndResend', '编辑后重发') }}
              </button>
            </div>
          </div>

          <template v-if="message.kind === 'user' || message.kind === 'assistant-text'">
            <RichMarkdownContent class="ai-chat__message-copy" :content="message.content" />
            <p v-if="message.kind === 'user' && message.editedFromMessageId" class="ai-chat__message-note">
              {{ t('editedFromPrevious', '基于上一条问题改写后重发') }}
            </p>
            <div v-if="messageContextItems(message).length > 0" class="ai-chat__context-chip-list ai-chat__context-chip-list--message">
              <button
                v-for="contextItem in messageContextItems(message)"
                :key="contextItem.id"
                class="ai-chat__context-chip"
                type="button"
                @click="previewContextItem(contextItem)"
              >
                <strong>{{ contextItem.title }}</strong>
                <span>{{ contextItem.summary }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="message.kind === 'assistant-result'">
            <section
              v-for="section in assistantSections(message)"
              :key="section.key"
              class="ai-chat__result-section"
            >
              <h4>{{ section.title }}</h4>
              <RichMarkdownContent v-if="section.kind === 'text'" :content="section.text" />
              <ul v-else>
                <li v-for="item in section.items" :key="item">
                  <RichMarkdownContent :content="item" />
                </li>
              </ul>
            </section>
            <div v-if="messageContextItems(message).length > 0" class="ai-chat__context-chip-list ai-chat__context-chip-list--message">
              <button
                v-for="contextItem in messageContextItems(message)"
                :key="contextItem.id"
                class="ai-chat__context-chip"
                type="button"
                @click="previewContextItem(contextItem)"
              >
                <strong>{{ contextItem.title }}</strong>
                <span>{{ contextItem.summary }}</span>
              </button>
            </div>
          </template>

          <template v-else>
            <div class="ai-chat__candidate-headline">
              <strong>{{ message.mode === 'cdf' ? t('cdfMode', 'CDF 辅助制卡') : t('aiMakeCards', 'AI 辅助制卡') }}</strong>
              <span>{{ message.result.candidates.length }} {{ t('candidateCountSuffix', '条候选') }}</span>
              <span v-if="isEditableCandidateBoard(message)">{{ t('latestCandidateBoard', '当前可编辑候选板') }}</span>
              <span v-else>{{ t('historyCandidateBoard', '历史候选板') }}</span>
            </div>
            <div v-if="messageContextItems(message).length > 0" class="ai-chat__context-chip-list ai-chat__context-chip-list--message">
              <button
                v-for="contextItem in messageContextItems(message)"
                :key="contextItem.id"
                class="ai-chat__context-chip"
                type="button"
                @click="previewContextItem(contextItem)"
              >
                <strong>{{ contextItem.title }}</strong>
                <span>{{ contextItem.summary }}</span>
              </button>
            </div>

            <div class="ai-chat__candidate-grid">
              <article
                v-for="candidate in candidateListFor(message)"
                :key="candidate.id"
                class="ai-chat__candidate"
                :class="{ 'ai-chat__candidate--discarded': candidate.discarded, 'ai-chat__candidate--readonly': !isEditableCandidateBoard(message) }"
              >
                <div class="ai-chat__candidate-title">
                  <input
                    class="b3-text-field"
                    :disabled="!isEditableCandidateBoard(message) || isCandidateLocked(candidate)"
                    :value="candidate.title"
                    @input="service.updateCandidateTitle(candidate.id, ($event.target as HTMLInputElement).value)"
                  >
                  <select
                    class="b3-select"
                    :disabled="!isEditableCandidateBoard(message) || isCandidateLocked(candidate)"
                    :value="candidate.templateId"
                    @change="service.updateCandidateTemplateId(candidate.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="option in templateOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>

                <div class="ai-chat__candidate-meta">
                  <span>{{ t('confidence', '置信度') }} {{ candidate.confidence.toFixed(2) }}</span>
                  <span>{{ candidateStatusText(candidate) }}</span>
                </div>

                <textarea class="b3-text-field ai-chat__candidate-preview" :value="candidate.preview" readonly></textarea>

                <div class="ai-chat__field-list">
                  <div v-for="entry in Object.entries(candidate.fieldMapping)" :key="entry[0]" class="ai-chat__field-item">
                    <label>{{ entry[0] }}</label>
                    <textarea
                      class="b3-text-field"
                      :disabled="!isEditableCandidateBoard(message) || isCandidateLocked(candidate)"
                      :value="entry[1]"
                      @input="service.updateCandidateField(candidate.id, entry[0], ($event.target as HTMLTextAreaElement).value)"
                    ></textarea>
                  </div>
                </div>

                <div class="ai-chat__candidate-actions">
                  <button
                    class="b3-button b3-button--outline"
                    :disabled="!isEditableCandidateBoard(message) || state.isLoading || candidate.draftState === 'saving' || candidate.draftState === 'creating'"
                    @click="service.toggleCandidateDiscarded(candidate.id)"
                  >
                    {{ candidate.discarded ? t('keep', '保留') : t('delete', '删除') }}
                  </button>
                  <button
                    class="b3-button b3-button--text"
                    :disabled="!isEditableCandidateBoard(message) || !canSaveCandidate(candidate)"
                    @click="saveSingleCandidate(candidate.id)"
                  >
                    {{ t('saveDraft', '保存草稿') }}
                  </button>
                  <button
                    class="b3-button b3-button--text"
                    :disabled="!isEditableCandidateBoard(message) || !canCreateCandidate(candidate)"
                    @click="createSingleCandidate(candidate.id)"
                  >
                    {{ t('create', '创建') }}
                  </button>
                </div>
              </article>
            </div>
          </template>
        </article>

        <article v-if="state.isLoading" class="ai-chat__bubble ai-chat__bubble--assistant ai-chat__bubble--loading">
          <div class="ai-chat__bubble-meta">
            <strong>{{ activeViewMeta.title }}</strong>
            <span>{{ t('thinking', '正在整理回答…') }}</span>
          </div>
          <p>{{ activeViewMeta.loadingHint }}</p>
        </article>
      </section>

      <footer class="ai-chat__composer">
        <div class="ai-chat__composer-contexts">
          <div class="ai-chat__context-chip-list">
            <div v-for="contextItem in composerContexts" :key="contextItem.id" class="ai-chat__context-pill">
              <button
                class="ai-chat__context-chip ai-chat__context-chip--attached"
                type="button"
                @click="previewContextItem(contextItem)"
              >
                <strong>{{ contextItem.title }}</strong>
                <span>{{ contextItem.summary }}</span>
              </button>
              <button
                class="ai-chat__context-chip-remove"
                type="button"
                @click="removeComposerContext(contextItem.id)"
              >
                {{ t('remove', '移除') }}
              </button>
            </div>
          </div>

          <div class="ai-chat__composer-context-actions">
            <button class="b3-button b3-button--outline" type="button" @click="toggleContextMenu">
              {{ t('useContext', 'Use Context') }}
            </button>
            <button class="b3-button b3-button--outline" type="button" @click="openComposerEditor">
              {{ t('openLargeEditor', '大编辑器') }}
            </button>
            <button
              v-if="composerContexts.length > 0"
              class="b3-button b3-button--text"
              type="button"
              @click="clearComposerContexts"
            >
              {{ t('clear', '清空') }}
            </button>
          </div>
        </div>

        <div v-if="contextMenuOpen" class="ai-chat__context-menu">
          <button
            v-for="provider in contextProviders"
            :key="provider.key"
            class="ai-chat__context-menu-item"
            type="button"
            @click="selectContextProvider(provider.key)"
          >
            <strong>{{ provider.title }}</strong>
            <span>{{ provider.description }}</span>
          </button>
        </div>

        <div class="ai-chat__composer-tools">
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
            <select class="b3-select ai-chat__mode-select" :disabled="state.isLoading" :value="state.makeCardMode" @change="handleModeChange">
              <option value="qa">{{ t('qaMode', '问答') }}</option>
              <option value="cloze">{{ t('clozeMode', '挖空') }}</option>
              <option value="concept-descriptor">{{ t('conceptDescriptorMode', '概念 / 描述符') }}</option>
              <option value="cdf">{{ t('cdfMode', 'CDF 辅助制卡') }}</option>
            </select>
            <button class="b3-button b3-button--text" type="button" :disabled="state.isLoading" @click="service.runMakeCards()">
              {{ generateCandidatesLabel }}
            </button>
            <button
              class="b3-button b3-button--outline"
              type="button"
              :disabled="state.isLoading || activeViewState.stale || draftSyncCandidates.length === 0"
              @click="saveKeptCandidates"
            >
              {{ saveDraftActionLabel }} ({{ draftSyncCandidates.length }})
            </button>
            <button class="b3-button b3-button--outline" type="button" :disabled="bulkCreateDisabled" @click="createKeptCandidates">
              {{ t('bulkCreate', '批量创建') }} ({{ readyToCreateCandidates.length }})
            </button>
          </template>
        </div>

        <div v-if="editingFollowUpMessageId" class="ai-chat__composer-editing">
          <span>{{ t('editingPreviousQuestion', '正在编辑上一条问题后重发') }}</span>
          <button class="b3-button b3-button--text" type="button" @click="cancelEditedFollowUp">
            {{ t('cancel', '取消') }}
          </button>
        </div>

        <textarea
          ref="composerRef"
          v-model="followUpDraft"
          class="b3-text-field ai-chat__composer-input"
          :disabled="!!followUpDisabledReason"
          :placeholder="followUpPlaceholder"
          @input="handleComposerInput"
          @keydown.ctrl.enter.prevent="submitFollowUp"
          @keydown.meta.enter.prevent="submitFollowUp"
          @keydown.escape.prevent="contextMenuOpen = false"
        ></textarea>

        <div class="ai-chat__composer-foot">
          <div class="ai-chat__composer-hint">
            {{ followUpDisabledReason || activeViewMeta.followUpHint }}
          </div>
          <button
            class="b3-button b3-button--text"
            type="button"
            :disabled="!!followUpDisabledReason || !followUpDraft.trim()"
            @click="submitFollowUp"
          >
            {{ editingFollowUpMessageId ? t('resend', '重发') : t('askFollowUp', '继续追问') }}
          </button>
        </div>
      </footer>
    </div>

    <LargeTextEditorDialog
      :open="textEditorOpen"
      :title="textEditorTitle"
      :model-value="textEditorValue"
      :readonly="textEditorReadonly"
      :placeholder="textEditorPlaceholder"
      :hint="textEditorHint"
      :confirm-label="textEditorConfirmLabel"
      :confirm-disabled="textEditorConfirmDisabled"
      :cancel-label="t('cancel', '取消')"
      :close-label="t('close', '关闭')"
      @update:model-value="textEditorValue = $event"
      @confirm="confirmTextEditor"
      @close="closeTextEditor"
    />

    <div v-if="structuredEditorOpen" class="ai-chat__editor-shell">
      <div class="ai-chat__editor-backdrop" @click="closeStructuredEditor"></div>
      <section class="ai-chat__editor-panel" role="dialog" aria-modal="true">
        <header class="ai-chat__editor-head">
          <strong>{{ structuredEditorTitle }}</strong>
          <button class="b3-button b3-button--text" type="button" @click="closeStructuredEditor">
            {{ t('close', '关闭') }}
          </button>
        </header>

        <div class="ai-chat__structured-grid">
          <label v-for="field in structuredEditorFields" :key="field.key" class="ai-chat__structured-field">
            <span>{{ field.label }}</span>
            <textarea
              v-if="field.kind === 'textarea'"
              class="b3-text-field"
              :value="field.value"
              @input="updateStructuredField(field.key, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <textarea
              v-else
              class="b3-text-field"
              :value="field.value"
              @input="updateStructuredField(field.key, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
          </label>
        </div>

        <footer class="ai-chat__editor-foot">
          <span class="ai-chat__empty-note">{{ t('structuredEditorHint', '这里修改的是本地会话里的结构化结果，会立刻影响后续继续追问。') }}</span>
          <div class="ai-chat__composer-context-actions">
            <button class="b3-button b3-button--outline" type="button" @click="closeStructuredEditor">
              {{ t('cancel', '取消') }}
            </button>
            <button class="b3-button b3-button--text" type="button" @click="saveStructuredEditor">
              {{ t('save', '保存') }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type {
  AICardCandidate,
  AIAttachedContextItem,
  AIContextProviderKey,
  AIExplainResult,
  AIMakeCardMode,
  AITaskType,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchMessage,
  AIWorkbenchSessionSummary,
  AIWorkbenchSource,
  AIWorkbenchUserMessage,
  AITutorResult,
} from '@/types/ai';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AIContextProviderDescriptor } from '@/application/services/AIWorkbenchContextProviderRegistry';
import LargeTextEditorDialog from '@/ui/shared/LargeTextEditorDialog.vue';
import RichMarkdownContent from '@/ui/shared/RichMarkdownContent.vue';

type SectionDescriptor = {
  key: string;
  title: string;
  kind: 'list' | 'text';
  items: string[];
  text: string;
};

type ContextDetailRow = {
  key: string;
  label: string;
  value: string;
};

type TextEditorMode = 'composer' | 'user-resend' | 'assistant-text' | 'provider-input' | 'context-preview';

type StructuredEditorField = {
  key: string;
  label: string;
  value: string;
  kind: 'textarea';
};

type WindowWithPlugin = Window & {
  siyuanMemoPlugin?: {
    getContext?: () => {
      getDialogManager?: () => {
        openSettingsDialog?: (defaultTab?: string) => Promise<void> | void;
      };
    };
    name?: string;
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

const composerRef = ref<HTMLTextAreaElement | null>(null);
const followUpDraft = ref('');
const historyQuery = ref('');
const sessionTitleDraft = ref(state.sessionTitle);
const editingFollowUpMessageId = ref<string | null>(null);
const contextMenuOpen = ref(false);
const textEditorOpen = ref(false);
const textEditorMode = ref<TextEditorMode | null>(null);
const textEditorTitle = ref('');
const textEditorValue = ref('');
const textEditorPlaceholder = ref('');
const textEditorHint = ref('');
const textEditorReadonly = ref(false);
const textEditorConfirmLabel = ref('保存');
const textEditorConfirmDisabled = computed(() => !textEditorReadonly.value && !textEditorValue.value.trim());
const pendingProvider = ref<AIContextProviderDescriptor | null>(null);
const pendingMessageId = ref<string | null>(null);
const structuredEditorOpen = ref(false);
const structuredEditorMessageId = ref<string | null>(null);
const structuredEditorView = ref<'tutor' | 'explain' | null>(null);
const structuredEditorDraft = reactive<Record<string, string>>({});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLooseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
  }
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? [normalized] : [];
}

function hasExplainContent(result: AIExplainResult | null | undefined): boolean {
  if (!result) {
    return false;
  }
  return Boolean(
    result.workingDefinition
    || result.whatItTests
    || result.whyItsTricky
    || result.connections.length
    || result.triggers.length
    || result.cardIdeas.length
  );
}

function tryParseStructuredJson(rawContent: string): Record<string, unknown> | null {
  const direct = rawContent.trim();
  if (!direct) {
    return null;
  }

  const candidates = [
    direct,
    ...Array.from(direct.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)).map((match) => match[1] || ''),
  ];

  for (const candidate of candidates) {
    const normalized = candidate.trim().replace(/^json\s*[\r\n]+/i, '');
    if (!normalized) {
      continue;
    }
    try {
      const parsed = JSON.parse(normalized);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore parse failures and continue trying fallback wrappers.
    }
  }

  return null;
}

function resolveExplainResult(message: AIWorkbenchAssistantResultMessage): AIExplainResult | null {
  if (message.view !== 'explain') {
    return message.explainResult;
  }
  if (hasExplainContent(message.explainResult)) {
    return message.explainResult;
  }

  const raw = tryParseStructuredJson(message.rawContent);
  if (!raw) {
    return message.explainResult;
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

watch(
  () => state.sessionTitle,
  (title) => {
    sessionTitleDraft.value = title;
  },
  { immediate: true },
);

const tabs = computed(() => [
  { key: 'tutor' as AITaskType, label: t('aiTutor', 'AI 导师'), brief: t('aiTutorBrief', '沿当前批次继续想') },
  { key: 'explain' as AITaskType, label: t('aiExplainCard', 'AI 解释卡片'), brief: t('aiExplainBrief', '解释这张卡为什么值得记') },
  { key: 'make-cards' as AITaskType, label: t('aiMakeCards', 'AI 辅助制卡'), brief: t('aiMakeCardsBrief', '聊天壳里继续筛候选') },
]);

const isCompact = computed(() => state.surface !== 'standalone-dialog');
const showInlineClose = computed(() => state.surface === 'review-dialog-sidecar');
const modelLabel = computed(() => (
  typeof service.getCurrentModelLabel === 'function'
    ? service.getCurrentModelLabel()
    : t('notAvailable', '暂无')
));
const activeViewState = computed(() => state.viewState[state.activeView]);
const activeMessages = computed(() => (
  typeof service.getThreadMessages === 'function'
    ? service.getThreadMessages()
    : []
));
const contextProviders = computed<AIContextProviderDescriptor[]>(() => (
  typeof service.getAvailableContextProviders === 'function'
    ? service.getAvailableContextProviders()
    : []
));
const composerContexts = computed<AIAttachedContextItem[]>(() => (
  typeof service.getComposerContexts === 'function'
    ? service.getComposerContexts()
    : (state.composerContexts?.items || [])
));
const latestUserMessageId = computed(() => {
  const latest = [...activeMessages.value].reverse().find((message) => message.kind === 'user');
  return latest?.kind === 'user' ? latest.id : null;
});
const latestAssistantResultId = computed(() => {
  const latest = [...activeMessages.value].reverse().find((message) => (
    message.kind === 'assistant-result' || message.kind === 'candidate-board'
  ));
  return latest?.id || null;
});
const latestCandidateBoardMessageId = computed(() => {
  const latest = [...activeMessages.value].reverse().find((message) => message.kind === 'candidate-board');
  return latest?.id || null;
});
const followUpDisabledReason = computed(() => service.getFollowUpDisabledReason());

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

const draftStorageMode = computed(() => (
  typeof service.getDraftStorageMode === 'function'
    ? service.getDraftStorageMode()
    : 'daily-note'
));
const usesDailyNoteDraftStorage = computed(() => draftStorageMode.value === 'daily-note');
const saveDraftActionLabel = computed(() => (
  usesDailyNoteDraftStorage.value
    ? t('saveToDailyNote', '保存到 Daily Note')
    : t('saveDraft', '保存草稿')
));

const currentCard = computed(() => state.context?.currentCard || null);
const visibleBlocks = computed(() => (state.context?.blocks || []).slice(0, 4));
const hiddenBlockCount = computed(() => Math.max(0, (state.context?.blocks.length || 0) - visibleBlocks.value.length));
const revealLocked = computed(() => {
  return state.context?.source === 'review'
    && currentCard.value !== null
    && currentCard.value.explainRequiresReveal
    && !currentCard.value.revealed;
});
const canShowSensitiveCardContent = computed(() => !revealLocked.value);

const queueProgress = computed(() => state.context?.queueProgress ?? null);
const currentQueueLabel = computed(() => {
  const label = String(queueProgress.value?.queueLabel || '').trim();
  if (label.length > 0) {
    return label;
  }
  return String(state.context?.queueType || '').trim();
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

const sourceLabel = computed(() => sourceLabelFor(state.context?.source || 'standalone'));

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

const contextDetailRows = computed<ContextDetailRow[]>(() => {
  const rows: ContextDetailRow[] = [];
  if (currentQueueLabel.value) {
    rows.push({ key: 'queue', label: t('currentQueue', '当前队列'), value: currentQueueLabel.value });
  }
  if (reviewSessionProgressLabel.value) {
    rows.push({ key: 'progress', label: t('reviewSessionProgress', '本次复习进度'), value: reviewSessionProgressLabel.value });
  }
  if (neuralDetail.value) {
    rows.push({ key: 'neural', label: neuralDetail.value.label, value: neuralDetail.value.value });
  }
  if (currentCard.value) {
    rows.push({ key: 'card-role', label: t('cardRole', '卡片职责'), value: currentCard.value.roleDescription });
    rows.push({ key: 'review-action', label: t('reviewAction', '复习动作'), value: currentCard.value.reviewActionLabel });
  }
  rows.push({ key: 'source', label: t('source', '来源'), value: sourceLabel.value });
  return rows;
});

const activeViewMeta = computed(() => {
  if (state.activeView === 'tutor') {
    return {
      title: t('aiTutor', 'AI 导师'),
      kicker: 'Tutor',
      emptyTitle: t('aiTutorWelcomeTitle', '我会先读你当前这批漫游材料'),
      emptyBody: t('aiTutorEmptyBody', '适合在神经漫游里停一下，让 AI 帮你指出盲区和值得继续追的线索。'),
      followUpHint: t('aiTutorFollowUpHint', '可以继续追问某条线索、某个张力，或让它解释为什么这一批值得继续漫游。'),
      loadingHint: t('aiTutorLoading', '我正在沿着当前漫游路径整理模式和下一步方向。'),
    };
  }
  if (state.activeView === 'explain') {
    return {
      title: t('aiExplainCard', 'AI 解释卡片'),
      kicker: 'Explain',
      emptyTitle: revealLocked.value
        ? t('revealFirstExplainTitle', '解释卡片前先 reveal')
        : t('aiExplainWelcomeTitle', '我会围绕当前卡片做解释'),
      emptyBody: revealLocked.value
        ? t('revealFirstExplainBody', '为了不绕过提取练习，AI 解释会等你先显示答案后再开始。')
        : t('aiExplainEmptyBody', '适合你已经 reveal 后，想知道这张卡为什么值得记、和哪些材料连在一起时使用。'),
      followUpHint: t('aiExplainFollowUpHint', '可以继续追问这张卡的边界、因果、和哪些旧知识容易混，或以后遇到什么情境该想起它。'),
      loadingHint: t('aiExplainLoading', '我正在把这张卡放回原来的知识网络里重新解释。'),
    };
  }
  return {
    title: state.makeCardMode === 'cdf' ? t('cdfMode', 'CDF 辅助制卡') : t('aiMakeCards', 'AI 辅助制卡'),
    kicker: state.makeCardMode === 'cdf' ? 'CDF' : 'Cards',
    emptyTitle: t('aiMakeCardsWelcomeTitle', '先让我给你生成一批候选卡'),
    emptyBody: state.makeCardMode === 'cdf'
      ? t('aiMakeCardsCdfEmptyBody', '适合面对一段信息时，先按 CDF 找概念锚点和稳定描述符，再决定哪些候选真的值得落卡。')
      : t('aiMakeCardsEmptyBody', '适合在浏览器里选一批块，或者从解释结果里继续转成候选卡，然后显式保存草稿再建卡。'),
    followUpHint: state.makeCardMode === 'cdf'
      ? t('aiMakeCardsCdfFollowUpHint', '可以继续追问概念锚点是否稳、哪些描述维度该删、该用概念定义还是概念描述符模板。')
      : t('aiMakeCardsFollowUpHint', '可以继续问候选为什么这样拆、有没有更好的模板选择，或让它缩窄成更少但更稳定的卡。'),
    loadingHint: state.makeCardMode === 'cdf'
      ? t('aiMakeCardsCdfLoading', '我正在按 CDF 先找概念锚点，再拆描述维度。')
      : t('aiMakeCardsLoading', '我正在把当前材料拆成更适合筛选的候选卡。'),
  };
});

const followUpPlaceholder = computed(() => (
  followUpDisabledReason.value
    ? followUpDisabledReason.value
    : state.activeView === 'make-cards'
      ? t('candidateFollowUpPlaceholder', '继续追问候选拆法、模板选择，或要求收窄候选范围')
      : t('followUpPlaceholder', '继续追问，或把上一条问题改写后重发')
));

const filteredSessionHistory = computed(() => {
  const query = historyQuery.value.trim().toLowerCase();
  if (!query) {
    return state.sessionHistory;
  }
  return state.sessionHistory.filter((session) => {
    const haystack = [
      session.title,
      sourceLabelFor(session.source),
      sessionModeSummary(session),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
});

function sourceLabelFor(source: AIWorkbenchSource): string {
  switch (source) {
    case 'review':
      return t('reviewing', '复习中');
    case 'browser':
      return t('browser', '浏览器');
    case 'template-dialog':
      return t('templateDialog', '模板制卡');
    default:
      return t('standaloneWorkbench', '独立工作台');
  }
}

function sessionModeSummary(session: AIWorkbenchSessionSummary): string {
  const labels = session.activeViews.map((view) => (
    view === 'tutor'
      ? t('aiTutor', 'AI 导师')
      : view === 'explain'
        ? t('aiExplainCard', 'AI 解释卡片')
        : t('aiMakeCards', 'AI 辅助制卡')
  ));
  return labels.join(' / ') || t('emptySession', '空会话');
}

function previewText(value: string, limit = 160): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}…`;
}

function formatTime(value: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function messageBubbleClass(message: AIWorkbenchMessage): string[] {
  return [
    message.kind === 'user' ? 'ai-chat__bubble--user' : 'ai-chat__bubble--assistant',
    message.kind === 'candidate-board' ? 'ai-chat__bubble--board' : '',
  ];
}

function messageSpeaker(message: AIWorkbenchMessage): string {
  if (message.kind === 'user') {
    return t('you', '你');
  }
  if (message.kind === 'assistant-text') {
    return activeViewMeta.value.title;
  }
  if (message.kind === 'assistant-result') {
    return message.view === 'tutor' ? t('aiTutor', 'AI 导师') : t('aiExplainCard', 'AI 解释卡片');
  }
  return message.mode === 'cdf' ? t('cdfMode', 'CDF 辅助制卡') : t('aiMakeCards', 'AI 辅助制卡');
}

function messageContextItems(message: AIWorkbenchMessage): AIAttachedContextItem[] {
  if (message.kind === 'user') {
    return message.attachedContexts || [];
  }
  if (message.kind === 'assistant-text') {
    return message.appliedContexts || [];
  }
  if (message.kind === 'assistant-result') {
    return message.appliedContexts || [];
  }
  return message.appliedContexts || [];
}

function assistantSections(message: AIWorkbenchAssistantResultMessage): SectionDescriptor[] {
  if (message.view === 'tutor' && message.tutorResult) {
    return [
      { key: 'blind-spots', title: t('aiTutorBlindSpots', '你可能忽略了什么'), kind: 'list', items: message.tutorResult.blindSpots, text: '' },
      { key: 'patterns', title: t('aiTutorPatterns', '这批材料里的共同模式 / 张力'), kind: 'list', items: message.tutorResult.patterns, text: '' },
      { key: 'next-lines', title: t('aiTutorNextLines', '下一步追哪条线'), kind: 'list', items: message.tutorResult.nextLines, text: '' },
      { key: 'card-ideas', title: t('aiTutorCardIdeas', '哪些点值得转成候选卡'), kind: 'list', items: message.tutorResult.cardIdeas, text: '' },
      { key: 'summary', title: t('aiTutorBatchSummary', '本批总结'), kind: 'text', items: [], text: message.tutorResult.batchSummary || '' },
    ].filter((section) => (section.kind === 'text' ? section.text.length > 0 : section.items.length > 0));
  }

  const explain = resolveExplainResult(message);
  if (!explain) {
    return [];
  }
  return [
    { key: 'working-definition', title: t('aiExplainWorkingDefinition', '工作定义'), kind: 'text', items: [], text: explain.workingDefinition },
    { key: 'what-it-tests', title: t('aiExplainWhatItTests', '这张卡在考什么'), kind: 'text', items: [], text: explain.whatItTests },
    { key: 'why-tricky', title: t('aiExplainWhyTricky', '为什么容易错'), kind: 'text', items: [], text: explain.whyItsTricky },
    { key: 'connections', title: t('aiExplainConnections', '它和现有知识网络的连接'), kind: 'list', items: explain.connections, text: '' },
    { key: 'triggers', title: t('aiExplainTriggers', '下次什么时候该想起它'), kind: 'list', items: explain.triggers, text: '' },
    { key: 'card-ideas', title: t('aiExplainCardIdeas', '候选制卡提示'), kind: 'list', items: explain.cardIdeas, text: '' },
  ].filter((section) => (section.kind === 'text' ? section.text.length > 0 : section.items.length > 0));
}

function isEditableCandidateBoard(message: AIWorkbenchMessage): boolean {
  return message.kind === 'candidate-board' && message.id === latestCandidateBoardMessageId.value;
}

function candidateListFor(message: AIWorkbenchMessage): AICardCandidate[] {
  if (message.kind !== 'candidate-board') {
    return [];
  }
  if (isEditableCandidateBoard(message) && state.makeCardsResult) {
    return state.makeCardsResult.candidates;
  }
  return message.result.candidates;
}

function candidateStatusText(candidate: AICardCandidate): string {
  switch (candidate.draftState) {
    case 'saving':
      return t('saving', '保存中');
    case 'saved':
      return t('saved', '已保存');
    case 'dirty':
      return t('editedNotSaved', '已修改未保存');
    case 'creating':
      return t('creating', '创建中');
    case 'created':
      return t('created', '已创建');
    case 'error':
      return candidate.draftError || t('error', '失败');
    default:
      return t('unsaved', '未保存');
  }
}

function isCandidateLocked(candidate: AICardCandidate): boolean {
  return candidate.draftState === 'saving'
    || candidate.draftState === 'creating'
    || candidate.draftState === 'created';
}

function canSaveCandidate(candidate: AICardCandidate): boolean {
  if (candidate.discarded || candidate.draftState === 'created') {
    return false;
  }
  if (candidate.draftState === 'saving' || candidate.draftState === 'creating') {
    return false;
  }
  return candidate.draftState === 'unsaved'
    || candidate.draftState === 'dirty'
    || (candidate.draftState === 'error' && candidate.draftErrorOperation !== 'create');
}

function canCreateCandidate(candidate: AICardCandidate): boolean {
  if (candidate.discarded || candidate.draftState === 'created') {
    return false;
  }
  if (candidate.draftState === 'saving' || candidate.draftState === 'creating') {
    return false;
  }
  if (candidate.draftState === 'saved') {
    return candidate.draftLocation !== null;
  }
  return candidate.draftState === 'error'
    && candidate.draftErrorOperation === 'create'
    && candidate.draftLocation !== null;
}

async function saveSingleCandidate(candidateId: string): Promise<void> {
  await service.saveSelectedCandidatesToDailyNote([candidateId]);
}

async function createSingleCandidate(candidateId: string): Promise<void> {
  await service.createSelectedCandidates([candidateId]);
}

async function saveKeptCandidates(): Promise<void> {
  await service.saveSelectedCandidatesToDailyNote();
}

async function createKeptCandidates(): Promise<void> {
  await service.createSelectedCandidates();
}

function handleModeChange(event: Event): void {
  service.setMakeCardMode((event.target as HTMLSelectElement).value as AIMakeCardMode);
}

function jumpToMakeCards(): void {
  service.setActiveView('make-cards');
}

async function submitFollowUp(): Promise<void> {
  const content = followUpDraft.value.trim();
  if (!content) {
    return;
  }
  contextMenuOpen.value = false;
  await service.submitFollowUp(content, {
    editedFromMessageId: editingFollowUpMessageId.value,
  });
  followUpDraft.value = '';
  editingFollowUpMessageId.value = null;
}

function cancelEditedFollowUp(): void {
  editingFollowUpMessageId.value = null;
  followUpDraft.value = '';
}

function canEditUserMessage(message: AIWorkbenchMessage): message is AIWorkbenchUserMessage {
  return message.kind === 'user' && message.id === latestUserMessageId.value;
}

function canEditMessage(message: AIWorkbenchMessage): boolean {
  if (message.kind === 'assistant-text') {
    return true;
  }
  if (message.kind === 'assistant-result') {
    return true;
  }
  return false;
}

async function prepareEditedFollowUp(message: AIWorkbenchUserMessage): Promise<void> {
  editingFollowUpMessageId.value = message.id;
  textEditorMode.value = 'user-resend';
  textEditorTitle.value = t('editAndResend', '编辑后重发');
  textEditorValue.value = message.content;
  textEditorPlaceholder.value = t('followUpPlaceholder', '继续追问，或把上一条问题改写后重发');
  textEditorHint.value = t('editUserMessageHint', '保存后会把改写后的问题放回底部输入框，你再决定是否发送。');
  textEditorReadonly.value = false;
  textEditorConfirmLabel.value = t('applyToComposer', '放回输入框');
  pendingMessageId.value = message.id;
  textEditorOpen.value = true;
}

function openMessageEditor(message: AIWorkbenchMessage): void {
  if (message.kind === 'assistant-text') {
    service.setEditingMessage(message.id, message.kind);
    textEditorMode.value = 'assistant-text';
    textEditorTitle.value = t('editAssistantMessage', '编辑 AI 回复');
    textEditorValue.value = message.content;
    textEditorPlaceholder.value = t('assistantMessagePlaceholder', '修改这条 AI 回复的本地历史文本');
    textEditorHint.value = t('assistantMessageEditHint', '这只会改写本地会话历史，不会重新请求模型。');
    textEditorReadonly.value = false;
    textEditorConfirmLabel.value = t('save', '保存');
    pendingMessageId.value = message.id;
    textEditorOpen.value = true;
    return;
  }
  if (message.kind === 'assistant-result') {
    openStructuredEditor(message);
  }
}

function openStructuredEditor(message: AIWorkbenchAssistantResultMessage): void {
  structuredEditorMessageId.value = message.id;
  structuredEditorView.value = message.view;
  structuredEditorOpen.value = true;
  service.setEditingMessage(message.id, message.kind);
  if (message.view === 'tutor' && message.tutorResult) {
    structuredEditorDraft.blindSpots = message.tutorResult.blindSpots.join('\n');
    structuredEditorDraft.patterns = message.tutorResult.patterns.join('\n');
    structuredEditorDraft.nextLines = message.tutorResult.nextLines.join('\n');
    structuredEditorDraft.cardIdeas = message.tutorResult.cardIdeas.join('\n');
    structuredEditorDraft.batchSummary = message.tutorResult.batchSummary || '';
    return;
  }

  const explain = resolveExplainResult(message);
  structuredEditorDraft.workingDefinition = explain?.workingDefinition || '';
  structuredEditorDraft.whatItTests = explain?.whatItTests || '';
  structuredEditorDraft.whyItsTricky = explain?.whyItsTricky || '';
  structuredEditorDraft.connections = explain?.connections.join('\n') || '';
  structuredEditorDraft.triggers = explain?.triggers.join('\n') || '';
  structuredEditorDraft.cardIdeas = explain?.cardIdeas.join('\n') || '';
}

const structuredEditorTitle = computed(() => (
  structuredEditorView.value === 'tutor'
    ? t('editTutorResult', '编辑 AI 导师结果')
    : t('editExplainResult', '编辑 AI 解释结果')
));

const structuredEditorFields = computed<StructuredEditorField[]>(() => {
  if (structuredEditorView.value === 'tutor') {
    return [
      { key: 'blindSpots', label: t('aiTutorBlindSpots', '你可能忽略了什么'), value: structuredEditorDraft.blindSpots || '', kind: 'textarea' },
      { key: 'patterns', label: t('aiTutorPatterns', '这批材料里的共同模式 / 张力'), value: structuredEditorDraft.patterns || '', kind: 'textarea' },
      { key: 'nextLines', label: t('aiTutorNextLines', '下一步追哪条线'), value: structuredEditorDraft.nextLines || '', kind: 'textarea' },
      { key: 'cardIdeas', label: t('aiTutorCardIdeas', '哪些点值得转成候选卡'), value: structuredEditorDraft.cardIdeas || '', kind: 'textarea' },
      { key: 'batchSummary', label: t('aiTutorBatchSummary', '本批总结'), value: structuredEditorDraft.batchSummary || '', kind: 'textarea' },
    ];
  }
  return [
    { key: 'workingDefinition', label: t('aiExplainWorkingDefinition', '工作定义'), value: structuredEditorDraft.workingDefinition || '', kind: 'textarea' },
    { key: 'whatItTests', label: t('aiExplainWhatItTests', '这张卡在考什么'), value: structuredEditorDraft.whatItTests || '', kind: 'textarea' },
    { key: 'whyItsTricky', label: t('aiExplainWhyTricky', '为什么容易错'), value: structuredEditorDraft.whyItsTricky || '', kind: 'textarea' },
    { key: 'connections', label: t('aiExplainConnections', '它和现有知识网络的连接'), value: structuredEditorDraft.connections || '', kind: 'textarea' },
    { key: 'triggers', label: t('aiExplainTriggers', '下次什么时候该想起它'), value: structuredEditorDraft.triggers || '', kind: 'textarea' },
    { key: 'cardIdeas', label: t('aiExplainCardIdeas', '候选制卡提示'), value: structuredEditorDraft.cardIdeas || '', kind: 'textarea' },
  ];
});

function updateStructuredField(key: string, value: string): void {
  structuredEditorDraft[key] = value;
}

function closeStructuredEditor(): void {
  structuredEditorOpen.value = false;
  structuredEditorMessageId.value = null;
  structuredEditorView.value = null;
  service.setEditingMessage(null, null);
  for (const key of Object.keys(structuredEditorDraft)) {
    delete structuredEditorDraft[key];
  }
}

async function saveStructuredEditor(): Promise<void> {
  const messageId = structuredEditorMessageId.value;
  if (!messageId) {
    return;
  }
  if (structuredEditorView.value === 'tutor') {
    await service.updateAssistantResultMessage(messageId, {
      blindSpots: splitEditorLines(structuredEditorDraft.blindSpots),
      patterns: splitEditorLines(structuredEditorDraft.patterns),
      nextLines: splitEditorLines(structuredEditorDraft.nextLines),
      cardIdeas: splitEditorLines(structuredEditorDraft.cardIdeas),
      batchSummary: structuredEditorDraft.batchSummary || null,
    } satisfies Partial<AITutorResult>);
  } else {
    await service.updateAssistantResultMessage(messageId, {
      workingDefinition: structuredEditorDraft.workingDefinition || '',
      whatItTests: structuredEditorDraft.whatItTests || '',
      whyItsTricky: structuredEditorDraft.whyItsTricky || '',
      connections: splitEditorLines(structuredEditorDraft.connections),
      triggers: splitEditorLines(structuredEditorDraft.triggers),
      cardIdeas: splitEditorLines(structuredEditorDraft.cardIdeas),
    } satisfies Partial<AIExplainResult>);
  }
  closeStructuredEditor();
}

function splitEditorLines(value: string | undefined): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toggleContextMenu(): void {
  contextMenuOpen.value = !contextMenuOpen.value;
}

function openComposerEditor(): void {
  service.setComposerEditorOpen(true);
  textEditorMode.value = 'composer';
  textEditorTitle.value = t('composerEditorTitle', '继续追问');
  textEditorValue.value = followUpDraft.value;
  textEditorPlaceholder.value = followUpPlaceholder.value;
  textEditorHint.value = t('composerEditorHint', '适合写更长的问题，Ctrl/Cmd + Enter 也可以确认。');
  textEditorReadonly.value = false;
  textEditorConfirmLabel.value = t('applyToComposer', '放回输入框');
  pendingMessageId.value = null;
  textEditorOpen.value = true;
}

async function selectContextProvider(providerKey: AIContextProviderKey): Promise<void> {
  const provider = contextProviders.value.find((entry) => entry.key === providerKey) || null;
  if (!provider) {
    return;
  }
  contextMenuOpen.value = false;
  if (provider.inputKind === 'none') {
    await service.attachContextFromProvider(provider.key);
    return;
  }

  pendingProvider.value = provider;
  textEditorMode.value = 'provider-input';
  textEditorTitle.value = provider.title;
  textEditorValue.value = '';
  textEditorPlaceholder.value = provider.inputKind === 'area'
    ? t('contextProviderAreaPlaceholder', '粘贴你想临时带给 AI 的补充材料')
    : t('contextProviderLinePlaceholder', '输入块 ID、块引用或块链接');
  textEditorHint.value = provider.description;
  textEditorReadonly.value = false;
  textEditorConfirmLabel.value = t('attachContext', '挂到这次发送');
  textEditorOpen.value = true;
}

function previewContextItem(item: AIAttachedContextItem): void {
  pendingProvider.value = null;
  textEditorMode.value = 'context-preview';
  textEditorTitle.value = `${item.title} · ${item.summary}`;
  textEditorValue.value = item.content;
  textEditorPlaceholder.value = '';
  textEditorHint.value = t('contextPreviewHint', '这是会附带到对应消息里的上下文快照。');
  textEditorReadonly.value = true;
  textEditorConfirmLabel.value = t('save', '保存');
  textEditorOpen.value = true;
}

function removeComposerContext(contextId: string): void {
  service.removeComposerContext(contextId);
}

function clearComposerContexts(): void {
  service.clearComposerContexts();
}

function handleComposerInput(): void {
  if (/(^|\s)@$/.test(followUpDraft.value)) {
    followUpDraft.value = followUpDraft.value.replace(/@$/, '');
    contextMenuOpen.value = true;
  }
}

function closeTextEditor(): void {
  if (textEditorMode.value === 'user-resend') {
    editingFollowUpMessageId.value = null;
  }
  textEditorOpen.value = false;
  if (textEditorMode.value === 'assistant-text' || textEditorMode.value === 'provider-input') {
    service.setEditingMessage(null, null);
  }
  if (textEditorMode.value === 'composer') {
    service.setComposerEditorOpen(false);
  }
  pendingMessageId.value = null;
  pendingProvider.value = null;
  textEditorMode.value = null;
  textEditorReadonly.value = false;
}

async function confirmTextEditor(): Promise<void> {
  switch (textEditorMode.value) {
    case 'composer':
      followUpDraft.value = textEditorValue.value;
      closeTextEditor();
      await nextTick();
      composerRef.value?.focus();
      return;
    case 'user-resend':
      followUpDraft.value = textEditorValue.value;
      editingFollowUpMessageId.value = pendingMessageId.value;
      closeTextEditor();
      await nextTick();
      composerRef.value?.focus();
      return;
    case 'assistant-text':
      if (pendingMessageId.value) {
        await service.updateAssistantTextMessage(pendingMessageId.value, textEditorValue.value);
      }
      closeTextEditor();
      return;
    case 'provider-input':
      if (pendingProvider.value) {
        await service.attachContextFromProvider(pendingProvider.value.key, textEditorValue.value);
      }
      closeTextEditor();
      return;
    default:
      closeTextEditor();
  }
}

function canRerunMessage(message: AIWorkbenchMessage): boolean {
  return message.id === latestAssistantResultId.value
    && (message.kind === 'assistant-result' || message.kind === 'candidate-board');
}

async function rerunMessage(message: AIWorkbenchMessage): Promise<void> {
  const attached = messageContextItems(message);
  if (attached.length > 0 && typeof service.replaceComposerContexts === 'function') {
    service.replaceComposerContexts(attached);
  }
  if (message.kind === 'assistant-result') {
    if (message.view === 'tutor') {
      await service.runTutor();
      return;
    }
    await service.runExplain();
    return;
  }
  if (message.kind === 'candidate-board') {
    await service.runMakeCards();
  }
}

function messageToPlainText(message: AIWorkbenchMessage): string {
  if (message.kind === 'user' || message.kind === 'assistant-text') {
    return message.content;
  }
  if (message.kind === 'assistant-result') {
    return assistantSections(message)
      .map((section) => {
        if (section.kind === 'text') {
          return `${section.title}\n${section.text}`;
        }
        return `${section.title}\n- ${section.items.join('\n- ')}`;
      })
      .join('\n\n');
  }
  return JSON.stringify({
    mode: message.mode,
    candidates: message.result.candidates.map((candidate) => ({
      title: candidate.title,
      templateId: candidate.templateId,
      confidence: candidate.confidence,
      fieldMapping: candidate.fieldMapping,
    })),
  }, null, 2);
}

async function copyMessage(message: AIWorkbenchMessage): Promise<void> {
  const text = messageToPlainText(message);
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

async function createNewSession(): Promise<void> {
  await service.createNewSession();
}

async function openHistorySession(sessionId: string): Promise<void> {
  await service.openSession(sessionId);
  service.setHistoryPanelOpen(false);
}

async function renameHistorySession(sessionId: string, currentTitle: string): Promise<void> {
  const nextTitle = window.prompt(t('renameSessionPrompt', '输入新的会话标题'), currentTitle);
  if (!nextTitle) {
    return;
  }
  await service.renameSession(sessionId, nextTitle);
}

async function deleteHistorySession(sessionId: string): Promise<void> {
  if (!window.confirm(t('deleteSessionConfirm', '确定删除这条 AI 会话吗？'))) {
    return;
  }
  await service.deleteSession(sessionId);
}

async function deleteCurrentSession(): Promise<void> {
  if (!window.confirm(t('deleteSessionConfirm', '确定删除这条 AI 会话吗？'))) {
    return;
  }
  await service.deleteSession();
}

async function commitSessionTitle(): Promise<void> {
  const nextTitle = sessionTitleDraft.value.trim();
  if (!nextTitle || nextTitle === state.sessionTitle) {
    sessionTitleDraft.value = state.sessionTitle;
    return;
  }
  await service.renameCurrentSession(nextTitle);
}

async function openAiSettings(): Promise<void> {
  await getDialogManager()?.openSettingsDialog?.('ai');
}
</script>

<style scoped>
.ai-chat {
  display: flex;
  height: 100%;
  min-height: 0;
  background:
    radial-gradient(circle at top left, rgba(255, 214, 153, 0.22), transparent 28%),
    radial-gradient(circle at top right, rgba(116, 196, 255, 0.18), transparent 26%),
    linear-gradient(180deg, #faf7f0 0%, #f4efe5 100%);
  color: #2b261f;
}

.ai-chat--compact {
  background:
    radial-gradient(circle at top left, rgba(255, 214, 153, 0.18), transparent 24%),
    linear-gradient(180deg, #faf7f0 0%, #f2ede3 100%);
}

.ai-chat__history {
  width: 280px;
  border-right: 1px solid rgba(106, 88, 64, 0.14);
  background: rgba(255, 252, 246, 0.78);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ai-chat__history-head,
.ai-chat__topbar,
.ai-chat__composer-tools,
.ai-chat__composer-foot,
.ai-chat__candidate-title,
.ai-chat__candidate-meta,
.ai-chat__candidate-actions,
.ai-chat__bubble-meta,
.ai-chat__history-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-chat__history-head,
.ai-chat__topbar {
  padding: 14px 16px;
}

.ai-chat__history-search {
  margin: 0 16px 12px;
}

.ai-chat__history-list {
  padding: 0 12px 12px;
  overflow: auto;
}

.ai-chat__history-item {
  border: 1px solid rgba(106, 88, 64, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  margin-bottom: 10px;
  padding: 10px;
}

.ai-chat__history-item--active {
  border-color: rgba(195, 121, 58, 0.5);
  box-shadow: 0 10px 24px rgba(160, 116, 72, 0.12);
}

.ai-chat__history-open {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  color: inherit;
  cursor: pointer;
}

.ai-chat__history-open span {
  color: #7b6b57;
  font-size: 12px;
}

.ai-chat__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ai-chat__topbar {
  border-bottom: 1px solid rgba(106, 88, 64, 0.12);
  background: rgba(255, 252, 246, 0.72);
  backdrop-filter: blur(12px);
  flex-wrap: wrap;
}

.ai-chat__topbar-main,
.ai-chat__topbar-actions,
.ai-chat__tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ai-chat__title-input {
  min-width: 220px;
  max-width: 420px;
}

.ai-chat__pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 240, 214, 0.9);
  color: #7c5831;
  font-size: 12px;
}

.ai-chat__pill--warning {
  background: rgba(255, 226, 173, 0.92);
  color: #8d5b00;
}

.ai-chat__tabs {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(106, 88, 64, 0.08);
}

.ai-chat__tab {
  border: 1px solid rgba(106, 88, 64, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  color: inherit;
}

.ai-chat__tab span {
  color: #7b6b57;
  font-size: 12px;
}

.ai-chat__tab--active {
  border-color: rgba(195, 121, 58, 0.48);
  background: rgba(255, 245, 226, 0.95);
  box-shadow: 0 10px 20px rgba(160, 116, 72, 0.12);
}

.ai-chat__context {
  margin: 12px 16px 0;
  border: 1px solid rgba(106, 88, 64, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.66);
  padding: 14px;
}

.ai-chat__context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ai-chat__context-card,
.ai-chat__context-block {
  border: 1px solid rgba(106, 88, 64, 0.1);
  border-radius: 14px;
  background: rgba(255, 252, 246, 0.82);
  padding: 12px;
}

.ai-chat__context-copy,
.ai-chat__context-block p,
.ai-chat__message-copy {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  user-select: text;
}

.ai-chat__context-copy--muted,
.ai-chat__context-block span,
.ai-chat__message-note,
.ai-chat__empty-note,
.ai-chat__composer-hint {
  color: #7b6b57;
}

.ai-chat__context-copy--warning {
  color: #8d5b00;
}

.ai-chat__context-rows {
  display: grid;
  gap: 8px;
}

.ai-chat__context-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.ai-chat__context-blocks {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.ai-chat__section-title {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c5831;
  margin-bottom: 10px;
}

.ai-chat__banner {
  margin: 12px 16px 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(106, 88, 64, 0.12);
}

.ai-chat__banner--error {
  background: rgba(255, 235, 231, 0.92);
  border-color: rgba(204, 92, 74, 0.24);
  color: #8e3d2e;
}

.ai-chat__banner--warning {
  background: rgba(255, 243, 214, 0.94);
  border-color: rgba(195, 121, 58, 0.24);
  color: #8d5b00;
}

.ai-chat__timeline {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-chat__bubble {
  max-width: min(920px, 100%);
  border-radius: 20px;
  padding: 14px 16px;
  border: 1px solid rgba(106, 88, 64, 0.12);
  box-shadow: 0 12px 30px rgba(131, 96, 58, 0.08);
}

.ai-chat__bubble--assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.84);
}

.ai-chat__bubble--user {
  align-self: flex-end;
  background: linear-gradient(135deg, rgba(250, 224, 188, 0.95), rgba(255, 242, 222, 0.92));
}

.ai-chat__bubble--board {
  width: 100%;
}

.ai-chat__bubble--empty,
.ai-chat__bubble--loading {
  max-width: 720px;
}

.ai-chat__bubble-meta-main,
.ai-chat__bubble-actions,
.ai-chat__candidate-headline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ai-chat__bubble-meta {
  margin-bottom: 10px;
}

.ai-chat__bubble-meta span,
.ai-chat__candidate-headline span {
  font-size: 12px;
  color: #7b6b57;
}

.ai-chat__bubble-actions button {
  user-select: none;
}

.ai-chat__context-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-chat__context-chip-list--message {
  margin-top: 12px;
}

.ai-chat__context-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ai-chat__context-chip {
  border: 1px solid rgba(195, 121, 58, 0.18);
  border-radius: 999px;
  background: rgba(255, 249, 239, 0.96);
  color: inherit;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  max-width: 100%;
}

.ai-chat__context-chip strong,
.ai-chat__context-chip span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-chat__context-chip span {
  color: #7b6b57;
  font-size: 12px;
}

.ai-chat__context-chip-remove {
  border: none;
  background: transparent;
  color: #8a6948;
  font-size: 12px;
  cursor: pointer;
}

.ai-chat__result-section + .ai-chat__result-section {
  margin-top: 14px;
}

.ai-chat__result-section h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.ai-chat__result-section p,
.ai-chat__result-section ul {
  margin: 0;
  line-height: 1.6;
}

.ai-chat__result-section ul {
  padding-left: 18px;
}

.ai-chat__result-section li + li {
  margin-top: 8px;
}

.ai-chat__candidate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.ai-chat__candidate {
  border: 1px solid rgba(106, 88, 64, 0.1);
  border-radius: 16px;
  background: rgba(255, 252, 246, 0.92);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-chat__candidate--discarded {
  opacity: 0.55;
}

.ai-chat__candidate--readonly {
  background: rgba(247, 243, 235, 0.88);
}

.ai-chat__candidate-title {
  align-items: stretch;
}

.ai-chat__candidate-title .b3-text-field,
.ai-chat__candidate-title .b3-select {
  flex: 1;
}

.ai-chat__candidate-meta,
.ai-chat__candidate-actions {
  font-size: 12px;
}

.ai-chat__candidate-preview {
  min-height: 72px;
}

.ai-chat__field-list {
  display: grid;
  gap: 10px;
}

.ai-chat__field-item {
  display: grid;
  gap: 6px;
}

.ai-chat__field-item textarea {
  min-height: 72px;
}

.ai-chat__composer {
  border-top: 1px solid rgba(106, 88, 64, 0.1);
  background: rgba(255, 252, 246, 0.82);
  backdrop-filter: blur(10px);
  padding: 14px 16px 16px;
  display: grid;
  gap: 10px;
}

.ai-chat__composer-contexts,
.ai-chat__composer-context-actions,
.ai-chat__editor-head,
.ai-chat__editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ai-chat__context-menu {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(106, 88, 64, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
}

.ai-chat__context-menu-item {
  border: 1px solid rgba(106, 88, 64, 0.1);
  border-radius: 14px;
  background: rgba(255, 249, 239, 0.9);
  padding: 10px 12px;
  text-align: left;
  display: grid;
  gap: 4px;
  color: inherit;
  cursor: pointer;
}

.ai-chat__context-menu-item span {
  color: #7b6b57;
  font-size: 12px;
}

.ai-chat__composer-editing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 243, 214, 0.94);
  color: #8d5b00;
}

.ai-chat__composer-input {
  min-height: 88px;
}

.ai-chat__composer-foot {
  align-items: flex-end;
}

.ai-chat__composer-hint {
  flex: 1;
  font-size: 12px;
  line-height: 1.5;
}

.ai-chat__mode-select {
  min-width: 148px;
}

.ai-chat__editor-shell {
  position: fixed;
  inset: 0;
  z-index: 4100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.ai-chat__editor-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(37, 29, 20, 0.42);
  backdrop-filter: blur(6px);
}

.ai-chat__editor-panel {
  position: relative;
  width: min(980px, calc(100vw - 32px));
  max-height: min(820px, calc(100vh - 32px));
  border-radius: 20px;
  background: #fffaf2;
  box-shadow: 0 22px 56px rgba(87, 61, 33, 0.2);
  padding: 18px;
  display: grid;
  gap: 14px;
}

.ai-chat__structured-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  overflow: auto;
}

.ai-chat__structured-field {
  display: grid;
  gap: 6px;
}

.ai-chat__structured-field textarea {
  min-height: 120px;
  line-height: 1.6;
}

.ai-chat-fade-enter-active,
.ai-chat-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ai-chat-fade-enter-from,
.ai-chat-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 1180px) {
  .ai-chat__history {
    width: 240px;
  }

  .ai-chat__context-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .ai-chat {
    flex-direction: column;
  }

  .ai-chat__history {
    width: 100%;
    max-height: 240px;
    border-right: none;
    border-bottom: 1px solid rgba(106, 88, 64, 0.12);
  }

  .ai-chat__candidate-grid {
    grid-template-columns: 1fr;
  }

  .ai-chat__structured-grid {
    grid-template-columns: 1fr;
  }
}
</style>
