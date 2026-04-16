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
          <button v-if="state.isLoading" class="ai-chat__icon-button" type="button" :title="t('stopGenerating', '停止生成')" @click="service.cancelCurrentRun?.()">
            <span>■</span>
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

      <section class="ai-chat__timeline">
        <article v-if="renderEntries.length === 0 && !visibleRunStatus" class="ai-chat__empty-state">
          <div class="ai-chat__empty-icon">
            <svg><use xlink:href="#iconSparkles"></use></svg>
          </div>
          <strong>{{ skillTitle }}</strong>
          <p>{{ skillBrief }}</p>
          <button class="ai-chat__primary-button" type="button" :disabled="state.isLoading || revealLocked" @click="prepareDefaultSkillPrompt">
            {{ primaryActionLabel }}
          </button>
        </article>

        <article
          v-for="entry in renderEntries"
          :key="entry.key"
          class="ai-chat__bubble"
          :class="{ 'ai-chat__bubble--user': entry.primaryMessage.kind === 'user' }"
        >
          <div class="ai-chat__bubble-meta">
            <div>
              <strong>{{ messageSpeaker(entry.primaryMessage) }}</strong>
              <span>{{ formatTime(entry.primaryMessage.createdAt) }}</span>
            </div>
            <details v-if="entry.primaryMessage.kind !== 'separator'" class="ai-chat__bubble-menu">
              <summary class="ai-chat__bubble-menu-trigger">•••</summary>
              <div class="ai-chat__bubble-menu-panel">
                <button class="ai-chat__link-button" type="button" @click="copyMessage(entry.primaryMessage)">{{ t('copy', '复制') }}</button>
                <button v-if="canEditMessage(entry.primaryMessage)" class="ai-chat__link-button" type="button" @click="openTextMessageEditor(entry.primaryMessage)">{{ t('edit', '编辑') }}</button>
                <button v-if="canEditUserMessage(entry.primaryMessage)" class="ai-chat__link-button" type="button" @click="prepareEditedFollowUp(entry.primaryMessage)">{{ t('editAndResend', '编辑后重发') }}</button>
                <button v-if="canRerunMessage(entry.primaryMessage)" class="ai-chat__link-button" type="button" :disabled="state.isLoading || revealLocked" @click="rerunMessage(entry.primaryMessage)">{{ t('rerun', '重跑') }}</button>
                <button class="ai-chat__link-button" type="button" @click="branchFromMessage(entry.primaryMessage)">{{ t('branch', '分支') }}</button>
                <button class="ai-chat__link-button" type="button" @click="toggleMessageHidden(entry.primaryMessage)">
                  {{ messageMeta(entry.primaryMessage)?.hidden ? t('showInContext', '恢复上下文') : t('hideFromContext', '隐藏上下文') }}
                </button>
                <button class="ai-chat__link-button" type="button" @click="toggleMessagePinned(entry.primaryMessage)">
                  {{ messageMeta(entry.primaryMessage)?.pinned ? t('unpin', '取消固定') : t('pin', '固定') }}
                </button>
                <button v-if="(messageMeta(entry.primaryMessage)?.versionCount || 0) > 1" class="ai-chat__link-button" type="button" @click="cycleMessageVersion(entry.primaryMessage)">
                  {{ t('switchVersion', '切版本') }}
                </button>
                <button class="ai-chat__link-button" type="button" @click="insertSeparatorAfter(entry.primaryMessage)">{{ t('insertSeparator', '插入分隔') }}</button>
              </div>
            </details>
          </div>

          <div
            v-if="messageMeta(entry.primaryMessage)?.hidden || messageMeta(entry.primaryMessage)?.pinned || messageMeta(entry.primaryMessage)?.status === 'interrupted'"
            class="ai-chat__message-badges"
          >
            <span v-if="messageMeta(entry.primaryMessage)?.hidden" class="ai-chat__badge ai-chat__badge--warning">{{ t('hidden', '已隐藏') }}</span>
            <span v-if="messageMeta(entry.primaryMessage)?.pinned" class="ai-chat__badge">{{ t('pinned', '已固定') }}</span>
            <span v-if="messageMeta(entry.primaryMessage)?.status === 'interrupted'" class="ai-chat__badge ai-chat__badge--warning">{{ t('stopped', '已停止') }}</span>
          </div>

          <template v-if="entry.primaryMessage.kind === 'user' || entry.primaryMessage.kind === 'assistant-text'">
            <RichMarkdownContent class="ai-chat__message-copy" :content="entry.primaryMessage.content" />
          </template>
          <template v-else-if="entry.primaryMessage.kind === 'separator'">
            <div class="ai-chat__separator">{{ entry.primaryMessage.label }}</div>
          </template>
          <template v-else-if="entry.primaryMessage.kind === 'assistant-result'">
            <div v-if="entry.primaryMessage.tabId === 'self-test-cards'" class="ai-chat__candidate-list">
              <article v-for="card in candidateCards(entry.primaryMessage)" :key="card.id" class="ai-chat__candidate-card">
                <label class="ai-chat__candidate-check">
                  <input
                    type="checkbox"
                    :checked="card.selected"
                    @change="toggleCandidate(card.id, $event)"
                  >
                  <span>{{ card.kind }}</span>
                </label>
                <strong>{{ card.question }}</strong>
                <p>{{ card.answer }}</p>
                <button class="ai-chat__link-button" type="button" @click="openCandidateEditor(card)">{{ t('edit', '编辑') }}</button>
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

          <div v-if="entry.pendingApproval" class="ai-chat__approval-strip">
            <div class="ai-chat__approval-strip-main">
              <strong>{{ entry.pendingApproval.request.title }}</strong>
              <span>{{ entry.pendingApproval.request.description }}</span>
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

          <div v-if="entryHasDetails(entry)" class="ai-chat__step-block">
            <button class="ai-chat__step-toggle" type="button" @click="toggleEntryDetails(entry.key)">
              <span class="ai-chat__step-toggle-arrow" :class="{ 'ai-chat__step-toggle-arrow--open': isEntryExpanded(entry.key) }">▾</span>
              <span>{{ entryDetailsLabel(entry) }}</span>
            </button>
            <div v-if="isEntryExpanded(entry.key)" class="ai-chat__step-panel">
              <template v-for="detail in visibleSupplementalMessages(entry)" :key="detail.id">
                <div v-if="detail.kind === 'tool-log'" class="ai-chat__tool-log ai-chat__tool-log--compact" :class="`ai-chat__tool-log--${detail.status}`">
                  <strong>{{ detail.toolName }} · {{ detail.status }}</strong>
                  <RichMarkdownContent class="ai-chat__message-copy" :content="detail.content" />
                  <p v-if="detail.varRef" class="ai-chat__muted">{{ t('cachedAsVar', '完整结果缓存为') }} {{ detail.varRef }}</p>
                </div>
                <div v-else-if="detail.kind === 'approval'" class="ai-chat__approval-card ai-chat__approval-card--compact" :class="`ai-chat__approval-card--${detail.request.status}`">
                  <strong>{{ detail.request.title }}</strong>
                  <p>{{ detail.request.description }}</p>
                  <pre>{{ JSON.stringify(detail.request.args, null, 2) }}</pre>
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
            @keydown.ctrl.enter.prevent="submitComposer"
            @keydown.meta.enter.prevent="submitComposer"
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

            <button class="ai-chat__composer-send" type="button" :title="t('send', '发送')" :disabled="sendDisabled" @click="submitComposer">
              <svg><use xlink:href="#iconForward"></use></svg>
            </button>
          </div>
        </div>
      </footer>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import RichMarkdownContent from '@/ui/shared/RichMarkdownContent.vue';
import LargeTextEditorDialog from '@/ui/shared/LargeTextEditorDialog.vue';
import type {
  AIAttachedContextItem,
  AIConceptCoachCandidateCard,
  AIConceptCoachCardKind,
  AIConceptCoachIntegratedUnderstanding,
  AIConceptCoachNormalizationDiagnostic,
  AIConceptCoachPerspectiveSection,
  AIConceptCoachPerspectives,
  AIConceptCoachRealWorldTriggers,
  AIConceptCoachSelfTestCards,
  AIExplainResult,
  AIUserSkillStructuredCard,
  AIUserSkillStructuredKeyValue,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchMessage,
  AIWorkbenchRenderEntry,
  AIWorkbenchSource,
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
const editingMode = ref<'assistant-text' | 'user-followup' | 'composer' | 'context' | 'provider' | 'candidate-card' | null>(null);
const pendingProvider = ref<ContextProvider | null>(null);

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
    : t('aiConceptCoachComposerPlaceholder', '输入你想理解或制卡的内容，然后按 Ctrl/Cmd + Enter 发送。')
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

function normalizePerspectiveItems(section: AIConceptCoachPerspectiveSection): string[] {
  const items = [
    ...normalizeLooseStringList(section.keyPoints),
    ...normalizeLooseStringList(section.easyMisjudgments).map((item) => `易误判：${item}`),
    ...normalizeLooseStringList(section.examples).map((item) => `例子：${item}`),
    ...normalizeLooseStringList(section.reasons).map((item) => `原因：${item}`),
    ...normalizeLooseStringList(section.applicableScenarios).map((item) => `适用：${item}`),
    ...normalizeLooseStringList(section.nonApplicableScenarios).map((item) => `不适用：${item}`),
    ...normalizeLooseStringList(section.subConcepts).map((item) => `部分：${item}`),
    ...normalizeLooseStringList(section.parentConcepts).map((item) => `整体：${item}`),
  ];
  if (section.metaphor) {
    items.push(`比喻：${section.metaphor}`);
  }
  if (section.commonMisuse) {
    items.push(`常见误用：${section.commonMisuse}`);
  }
  if (section.importance) {
    items.push(`重要性：${section.importance}`);
  }
  if (section.behaviorChange) {
    items.push(`行为改变：${section.behaviorChange}`);
  }
  if (section.triggerScenario) {
    items.push(`触发场景：${section.triggerScenario}`);
  }
  for (const comparison of section.comparisons || []) {
    items.push(`和 ${comparison.concept}：相似点 ${comparison.similarity || '未说明'}；差异 ${comparison.difference || '未说明'}${comparison.clue ? `；识别线索 ${comparison.clue}` : ''}`);
  }
  return items.filter(Boolean);
}

function sectionsFromPerspectives(value: AIConceptCoachPerspectives): AssistantSection[] {
  return [
    { key: 'traits', title: value.traits.title || t('traits', '特性和倾向'), kind: 'list' as const, items: normalizePerspectiveItems(value.traits) },
    { key: 'contrasts', title: value.contrasts.title || t('contrasts', '辨析异同'), kind: 'list' as const, items: normalizePerspectiveItems(value.contrasts) },
    { key: 'partsAndWhole', title: value.partsAndWhole.title || t('partsAndWhole', '部分和整体'), kind: 'list' as const, items: normalizePerspectiveItems(value.partsAndWhole) },
    { key: 'causality', title: value.causality.title || t('causality', '因果关系'), kind: 'list' as const, items: normalizePerspectiveItems(value.causality) },
    { key: 'significance', title: value.significance.title || t('significance', '意义和影响'), kind: 'list' as const, items: normalizePerspectiveItems(value.significance) },
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
      .filter((section) => section.items.length > 0);
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

function canEditMessage(message: AIWorkbenchMessage): boolean {
  return message.kind === 'assistant-text';
}

function canEditUserMessage(message: AIWorkbenchMessage): boolean {
  return message.kind === 'user' && (message.purpose ?? 'follow-up') === 'follow-up';
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
  if (entry.stepCount > 0) {
    return `${entry.stepCount} ${t('steps', '个步骤')}`;
  }
  return t('viewDetails', '查看详情');
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
  if (!currentTabHasResult.value) {
    if (service.submitSkillPrompt) {
      await service.submitSkillPrompt(content);
    } else {
      await service.submitExplainPrompt(content);
    }
  } else {
    await service.submitFollowUp(content);
  }
  composerValue.value = '';
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

function prepareEditedFollowUp(message: AIWorkbenchMessage): void {
  if (message.kind !== 'user') {
    return;
  }
  editingMode.value = 'user-followup';
  editingMessageId.value = message.id;
  editorReadonly.value = false;
  editorTitle.value = t('editAndResend', '编辑后重发');
  editorValue.value = message.content;
  editorPlaceholder.value = t('askAnything', '继续追问');
  editorConfirmLabel.value = t('send', '发送');
  editorOpen.value = true;
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

function openCandidateEditor(card: AIConceptCoachCandidateCard): void {
  editingMode.value = 'candidate-card';
  editingCandidateId.value = card.id;
  editorReadonly.value = false;
  editorTitle.value = t('editCandidateCard', '编辑候选卡');
  editorValue.value = [
    `问题：${card.question}`,
    `答案：${card.answer}`,
    `类型：${card.kind}`,
  ].join('\n');
  editorPlaceholder.value = '问题：...\n答案：...\n类型：辨析/因果/应用/反例/触发/定义/边界/其他';
  editorConfirmLabel.value = t('save', '保存');
  editorOpen.value = true;
}

function parseCandidateEditorValue(value: string): Partial<Pick<AIConceptCoachCandidateCard, 'question' | 'answer' | 'kind'>> {
  const lines = value.split(/\r?\n/);
  const question = normalizeText(lines.find((line) => /^问题[:：]/.test(line))?.replace(/^问题[:：]/, ''));
  const answer = normalizeText(lines.find((line) => /^答案[:：]/.test(line))?.replace(/^答案[:：]/, ''));
  const kind = normalizeText(lines.find((line) => /^类型[:：]/.test(line))?.replace(/^类型[:：]/, '')) as AIConceptCoachCardKind;
  return { question, answer, kind };
}

async function toggleCandidate(cardId: string, event: Event): Promise<void> {
  const target = event.target;
  const selected = target instanceof HTMLInputElement ? target.checked : true;
  await service.updateCandidateCard(cardId, { selected });
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

function closeContextMenu(): void {
  contextMenuOpen.value = false;
}

function toggleContextMenu(): void {
  contextMenuOpen.value = !contextMenuOpen.value;
}

function handleDocumentPointerDown(event: Event): void {
  if (!contextMenuOpen.value) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (contextMenuRef.value?.contains(target) || contextMenuToggleRef.value?.contains(target)) {
    return;
  }
  closeContextMenu();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !contextMenuOpen.value) {
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
  } else if (editingMode.value === 'user-followup' && editingMessageId.value) {
    await service.submitFollowUp(editorValue.value, { editedFromMessageId: editingMessageId.value });
    composerValue.value = '';
  } else if (editingMode.value === 'composer') {
    composerValue.value = editorValue.value;
    focusComposerInput();
  } else if (editingMode.value === 'provider' && pendingProvider.value) {
    await service.attachContextFromProvider(pendingProvider.value.key, editorValue.value);
  } else if (editingMode.value === 'candidate-card' && editingCandidateId.value) {
    await service.updateCandidateCard(editingCandidateId.value, parseCandidateEditorValue(editorValue.value));
  }
  closeEditor();
}

function closeEditor(): void {
  editorOpen.value = false;
  editingMode.value = null;
  editingMessageId.value = null;
  editingCandidateId.value = null;
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

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
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
.ai-chat__badge--warning { background: #fff4db; color: #a16207; }
.ai-chat__context-rows { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.ai-chat__context-row { border: 1px solid #eef1f6; border-radius: 8px; padding: 10px; display: grid; gap: 4px; }
.ai-chat__context-row span { color: #7f8797; font-size: 12px; }
.ai-chat__context-card { border: 1px solid #eef1f6; border-radius: 8px; padding: 10px; background: #fbfcfe; }
.ai-chat__warning { color: #a16207; font-size: 12px; }
.ai-chat__banner { margin: 12px 14px 0; padding: 12px; border-radius: 8px; border: 1px solid #eadca6; background: #fff9e7; }
.ai-chat__banner--error { border-color: #f0d2d2; background: #fff6f6; }
.ai-chat__banner--error strong { display: block; margin-bottom: 4px; }
.ai-chat__banner-details { margin-top: 10px; }
.ai-chat__banner-details summary { cursor: pointer; color: #51607a; font-size: 12px; user-select: none; }
.ai-chat__banner-pre { margin: 8px 0 0; padding: 10px; max-height: 240px; overflow: auto; border: 1px solid #ead4d4; border-radius: 6px; background: #fff; color: #3e4a60; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; }
.ai-chat__timeline { flex: 1; min-height: 0; overflow: auto; padding: 14px 12px; display: grid; gap: 10px; }
.ai-chat__empty-state, .ai-chat__bubble { border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; padding: 13px; }
.ai-chat__empty-state { display: grid; gap: 10px; justify-items: center; text-align: center; padding: 24px 16px; }
.ai-chat__empty-icon { width: 56px; height: 56px; border-radius: 999px; background: linear-gradient(180deg, #1c7d8f 0%, #13566f 100%); color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.ai-chat__empty-icon svg { width: 22px; height: 22px; }
.ai-chat__primary-button { border: 0; border-radius: 8px; background: #ffffff; box-shadow: inset 0 0 0 1px #dce3f5; padding: 10px 16px; color: #1f2430; }
.ai-chat__bubble--user { background: #f8fbff; }
.ai-chat__bubble--pending { border-color: #cde0ec; background: linear-gradient(180deg, #f8fcff 0%, #edf8fb 100%); }
.ai-chat__bubble-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.ai-chat__bubble-meta span { display: block; color: #7f8797; font-size: 12px; margin-top: 2px; }
.ai-chat__bubble-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ai-chat__bubble-menu { position: relative; }
.ai-chat__bubble-menu[open] { z-index: 4; }
.ai-chat__bubble-menu-trigger { list-style: none; width: 28px; height: 28px; border: 1px solid transparent; border-radius: 999px; color: #8b94a6; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; }
.ai-chat__bubble-menu-trigger::-webkit-details-marker { display: none; }
.ai-chat__bubble:hover .ai-chat__bubble-menu-trigger, .ai-chat__bubble-menu[open] .ai-chat__bubble-menu-trigger { border-color: #e1e6ef; background: #f8fafc; color: #51607a; }
.ai-chat__bubble-menu-panel { position: absolute; top: 32px; right: 0; min-width: 132px; padding: 7px; border: 1px solid #dfe5ef; border-radius: 10px; background: #fff; box-shadow: 0 16px 34px rgba(21, 27, 38, 0.16); display: grid; gap: 2px; }
.ai-chat__bubble-menu-panel .ai-chat__link-button { width: 100%; padding: 7px 8px; border-radius: 7px; text-align: left; }
.ai-chat__bubble-menu-panel .ai-chat__link-button:hover { background: #f4f7fb; color: #1f2937; }
.ai-chat__message-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.ai-chat__pending-body { display: flex; align-items: center; gap: 9px; color: #51607a; }
.ai-chat__pending-body p { margin: 0; }
.ai-chat__pending-dot { width: 8px; height: 8px; border-radius: 999px; background: #1c7d8f; box-shadow: 0 0 0 0 rgba(28,125,143,0.3); animation: ai-pending-pulse 1.1s ease-in-out infinite; flex: 0 0 auto; }
.ai-chat__message-copy :deep(p:last-child) { margin-bottom: 0; }
.ai-chat__approval-strip { margin-top: 12px; border: 1px solid #f0d48f; border-radius: 10px; background: #fffaf0; padding: 9px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ai-chat__approval-strip-main { display: grid; gap: 2px; min-width: 0; }
.ai-chat__approval-strip-main strong { color: #5b4216; font-size: 12px; }
.ai-chat__approval-strip-main span { color: #7c6230; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-chat__step-block { margin-top: 12px; }
.ai-chat__step-toggle { border: 0; background: none; color: #8b94a6; display: inline-flex; align-items: center; gap: 6px; padding: 2px 0; font-weight: 600; font-size: 12px; }
.ai-chat__step-toggle:hover { color: #51607a; }
.ai-chat__step-toggle-arrow { transition: transform 0.16s ease; display: inline-block; }
.ai-chat__step-toggle-arrow--open { transform: rotate(90deg); }
.ai-chat__step-panel { margin-top: 8px; border: 1px solid #e6e9f0; border-radius: 10px; background: #fbfcff; padding: 10px; display: grid; gap: 9px; }
.ai-chat__step-note { border: 1px dashed #d8e0eb; border-radius: 9px; padding: 9px; background: #fff; color: #4b5563; }
.ai-chat__tool-log--compact, .ai-chat__approval-card--compact { border-radius: 9px; padding: 9px; }
.ai-chat__meta-block { margin-top: 10px; border: 1px solid #e5e9f2; border-radius: 8px; background: #fbfcff; padding: 8px 10px; }
.ai-chat__meta-block summary { cursor: pointer; color: #51607a; font-size: 12px; user-select: none; }
.ai-chat__separator { padding: 2px 0; color: #64748b; font-size: 12px; font-weight: 600; border-top: 1px dashed #d8e0eb; border-bottom: 1px dashed #d8e0eb; text-align: center; }
.ai-chat__result-note { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5; }
.ai-chat__result-note--partial { background: #fff8e8; border: 1px solid #f1e0ae; color: #8a5a00; }
.ai-chat__result-note--empty { background: #fff1ef; border: 1px solid #f2cbc5; color: #b04437; }
.ai-chat__tool-log { border: 1px solid #d7e3f5; border-radius: 10px; background: #f8fbff; padding: 10px; display: grid; gap: 8px; }
.ai-chat__tool-log strong { font-size: 12px; color: #315076; }
.ai-chat__tool-log--error { border-color: #f0b6af; background: #fff7f6; }
.ai-chat__tool-log--approval-required { border-color: #f5d58a; background: #fffaf0; }
.ai-chat__approval-card { border: 1px solid #f0c978; border-radius: 12px; background: #fff9ea; padding: 12px; display: grid; gap: 8px; }
.ai-chat__approval-card strong { color: #5b4216; }
.ai-chat__approval-card pre { max-height: 180px; overflow: auto; background: rgba(255,255,255,0.72); border: 1px solid #f4dfac; border-radius: 8px; padding: 8px; white-space: pre-wrap; font-size: 11px; }
.ai-chat__approval-card--approved { border-color: #b9dfc3; background: #f3fbf5; }
.ai-chat__approval-card--rejected { border-color: #f0b6af; background: #fff7f6; }
.ai-chat__approval-actions { display: flex; align-items: center; gap: 8px; }
.ai-chat__result-section { display: grid; gap: 6px; margin-top: 10px; }
.ai-chat__result-section h4 { margin: 0; font-size: 13px; color: #3e4a60; }
.ai-chat__result-section ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.ai-chat__key-values { margin: 0; display: grid; gap: 6px; }
.ai-chat__key-values dt { font-weight: 600; color: #3e4a60; }
.ai-chat__key-values dd { margin: 0; color: #4b5563; }
.ai-chat__candidate-list { display: grid; gap: 10px; }
.ai-chat__candidate-list--generic { margin-top: 2px; }
.ai-chat__candidate-card { border: 1px solid #e5e9f2; border-radius: 10px; padding: 10px; display: grid; gap: 7px; background: #fbfcff; }
.ai-chat__candidate-card p { margin: 0; color: #4b5563; }
.ai-chat__candidate-check { display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 12px; }
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
.ai-chat__composer-send svg { width: 16px; height: 16px; }
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
@keyframes ai-pending-pulse {
  0% { opacity: 0.45; transform: scale(0.85); box-shadow: 0 0 0 0 rgba(28,125,143,0.22); }
  50% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 6px rgba(28,125,143,0.08); }
  100% { opacity: 0.45; transform: scale(0.85); box-shadow: 0 0 0 0 rgba(28,125,143,0); }
}
@media (max-width: 900px) {
  .ai-chat__history { width: 220px; }
}
</style>
