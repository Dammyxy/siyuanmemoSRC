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
        <article
          v-for="session in filteredSessionHistory"
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
        <p v-if="filteredSessionHistory.length === 0" class="ai-chat__empty-note">{{ t('noAiSessions', '还没有可打开的 AI 会话。') }}</p>
      </div>
    </aside>

    <div class="ai-chat__main">
      <header class="ai-chat__topbar">
        <div class="ai-chat__topbar-main">
          <div class="ai-chat__brand">
            <div class="ai-chat__brand-icon">
              <svg><use xlink:href="#iconSparkles"></use></svg>
            </div>
            <div>
              <strong>{{ t('aiExplainCard', 'AI 解释卡片') }}</strong>
              <span>{{ sourceLabel }}</span>
            </div>
          </div>
          <input
            v-model="sessionTitleDraft"
            class="b3-text-field ai-chat__title-input"
            :placeholder="t('untitledAiSession', '未命名会话')"
            @blur="commitSessionTitle"
            @keydown.enter.prevent="commitSessionTitle"
          >
        </div>

        <div class="ai-chat__topbar-actions">
          <button class="ai-chat__icon-button" type="button" :title="t('history', '历史')" @click="service.setHistoryPanelOpen(!state.historyPanelOpen)">
            <svg><use xlink:href="#iconHistory"></use></svg>
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
      </article>

      <section class="ai-chat__timeline">
        <article v-if="activeMessages.length === 0" class="ai-chat__empty-state">
          <div class="ai-chat__empty-icon">
            <svg><use xlink:href="#iconSparkles"></use></svg>
          </div>
          <strong>{{ t('aiExplainCard', 'AI 解释卡片') }}</strong>
          <p>{{ t('aiExplainBrief', '解释这张卡为什么值得记，以及它和哪些材料连在一起。') }}</p>
          <button class="ai-chat__primary-button" type="button" :disabled="state.isLoading || revealLocked" @click="runExplain">
            {{ t('explainThisContent', '解释此内容') }}
          </button>
        </article>

        <article
          v-for="message in activeMessages"
          :key="message.id"
          class="ai-chat__bubble"
          :class="{ 'ai-chat__bubble--user': message.kind === 'user' }"
        >
          <div class="ai-chat__bubble-meta">
            <div>
              <strong>{{ messageSpeaker(message) }}</strong>
              <span>{{ formatTime(message.createdAt) }}</span>
            </div>
            <div class="ai-chat__bubble-actions">
              <button class="ai-chat__link-button" type="button" @click="copyMessage(message)">{{ t('copy', '复制') }}</button>
              <button v-if="canEditMessage(message)" class="ai-chat__link-button" type="button" @click="openTextMessageEditor(message)">{{ t('edit', '编辑') }}</button>
              <button v-if="canEditUserMessage(message)" class="ai-chat__link-button" type="button" @click="prepareEditedFollowUp(message)">{{ t('editAndResend', '编辑后重发') }}</button>
              <button v-if="canRerunMessage(message)" class="ai-chat__link-button" type="button" :disabled="state.isLoading || revealLocked" @click="runExplain">{{ t('rerun', '重跑') }}</button>
            </div>
          </div>

          <template v-if="message.kind === 'user' || message.kind === 'assistant-text'">
            <RichMarkdownContent class="ai-chat__message-copy" :content="message.content" />
          </template>
          <template v-else-if="message.kind === 'assistant-result'">
            <section v-for="section in assistantSections(message)" :key="section.key" class="ai-chat__result-section">
              <h4>{{ section.title }}</h4>
              <RichMarkdownContent v-if="section.kind === 'text'" :content="section.text" />
              <ul v-else>
                <li v-for="item in section.items" :key="item"><RichMarkdownContent :content="item" /></li>
              </ul>
            </section>
          </template>

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
        </article>
      </section>

      <footer class="ai-chat__composer">
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

        <div class="ai-chat__composer-tools">
          <button class="ai-chat__composer-action" type="button" @click="toggleContextMenu">{{ t('useContext', 'Use Context') }}</button>
          <button class="ai-chat__composer-icon" type="button" :title="t('largeEditor', '大编辑器')" @click="openComposerEditor">
            <span>+</span>
          </button>
          <button class="ai-chat__composer-icon" type="button" :title="t('send', '发送')" :disabled="sendDisabled" @click="submitComposer">
            <svg><use xlink:href="#iconForward"></use></svg>
          </button>
        </div>

        <div v-if="contextMenuOpen" class="ai-chat__context-menu">
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
          v-model="composerValue"
          class="b3-text-field ai-chat__composer-input"
          :placeholder="composerPlaceholder"
          @keydown.ctrl.enter.prevent="submitComposer"
          @keydown.meta.enter.prevent="submitComposer"
        ></textarea>
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
import { computed, ref, watch } from 'vue';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import RichMarkdownContent from '@/ui/shared/RichMarkdownContent.vue';
import LargeTextEditorDialog from '@/ui/shared/LargeTextEditorDialog.vue';
import type {
  AIAttachedContextItem,
  AIExplainResult,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchMessage,
  AIWorkbenchSource,
} from '@/types/ai';

type ContextProvider = {
  key: 'manual-text' | 'selected-content' | 'block-refs' | 'current-document';
  title: string;
  description: string;
  inputKind: 'none' | 'line' | 'area';
};

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
const sessionTitleDraft = ref('');
const composerValue = ref('');
const contextMenuOpen = ref(false);

const editorOpen = ref(false);
const editorReadonly = ref(false);
const editorTitle = ref('');
const editorValue = ref('');
const editorPlaceholder = ref('');
const editorConfirmLabel = ref('');
const editingMessageId = ref<string | null>(null);
const editingMode = ref<'assistant-text' | 'user-followup' | 'composer' | 'context' | 'provider' | null>(null);
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

function tryParseStructuredJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveExplainResult(message: AIWorkbenchAssistantResultMessage): AIExplainResult | null {
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

watch(
  () => state.sessionTitle,
  (title) => {
    sessionTitleDraft.value = title;
  },
  { immediate: true },
);

watch(
  () => state.activeView,
  (view) => {
    if (view !== 'explain') {
      service.setActiveView('explain');
    }
  },
  { immediate: true },
);

const isCompact = computed(() => state.surface !== 'standalone-dialog');
const showInlineClose = computed(() => state.surface === 'review-dialog-sidecar');
const sourceLabel = computed(() => sourceLabelFor(state.context?.source || 'standalone'));
const modelLabel = computed(() => service.getCurrentModelLabel?.() || t('unconfiguredModel', '未配置模型'));
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
const activeMessages = computed(() => service.getThreadMessages?.('explain') || state.threads.explain.messages);
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
  state.explainResult
    ? t('aiFollowUpPlaceholder', '继续追问这张卡为什么值得记、哪里容易错，或补充一段材料后再问。')
    : t('runExplainFirst', '先运行一次解释，再继续追问。')
));
const sendDisabled = computed(() => {
  if (state.isLoading) {
    return true;
  }
  if (!state.explainResult) {
    return composerValue.value.trim().length > 0;
  }
  return composerValue.value.trim().length === 0;
});

function assistantSections(message: AIWorkbenchMessage) {
  if (message.kind !== 'assistant-result') {
    return [];
  }
  const result = resolveExplainResult(message);
  if (!result) {
    return [];
  }
  return [
    { key: 'workingDefinition', title: t('workingDefinition', '工作定义'), kind: 'text' as const, text: result.workingDefinition },
    { key: 'whatItTests', title: t('whatItTests', '这张卡在考什么'), kind: 'text' as const, text: result.whatItTests },
    { key: 'whyItsTricky', title: t('whyItsTricky', '为什么容易错'), kind: 'text' as const, text: result.whyItsTricky },
    { key: 'connections', title: t('connections', '它和现有知识网络的连接'), kind: 'list' as const, items: result.connections },
    { key: 'triggers', title: t('triggers', '下次什么时候该想起它'), kind: 'list' as const, items: result.triggers },
    { key: 'cardIdeas', title: t('cardIdeas', '可顺手补的卡'), kind: 'list' as const, items: result.cardIdeas },
  ].filter((section) => section.kind === 'text' ? section.text.trim().length > 0 : section.items.length > 0);
}

function messageSpeaker(message: AIWorkbenchMessage): string {
  return message.kind === 'user' ? t('you', '你') : t('aiWorkbench', 'AI');
}

function messageContextItems(message: AIWorkbenchMessage): AIAttachedContextItem[] {
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
  return message.kind === 'user';
}

function canRerunMessage(message: AIWorkbenchMessage): boolean {
  return message.kind === 'assistant-result';
}

async function runExplain(): Promise<void> {
  composerValue.value = '';
  await service.runExplain();
}

async function submitComposer(): Promise<void> {
  const content = composerValue.value.trim();
  if (!state.explainResult) {
    if (!content) {
      await runExplain();
    }
    return;
  }
  if (!content) {
    return;
  }
  await service.submitFollowUp(content);
  composerValue.value = '';
}

async function copyMessage(message: AIWorkbenchMessage): Promise<void> {
  const content = message.kind === 'assistant-result'
    ? JSON.stringify(resolveExplainResult(message), null, 2)
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
  editingMode.value = 'composer';
  editingMessageId.value = null;
  editorReadonly.value = false;
  editorTitle.value = t('largeEditor', '大编辑器');
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

function toggleContextMenu(): void {
  contextMenuOpen.value = !contextMenuOpen.value;
}

async function handleContextProvider(provider: ContextProvider): Promise<void> {
  contextMenuOpen.value = false;
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
  } else if (editingMode.value === 'provider' && pendingProvider.value) {
    await service.attachContextFromProvider(pendingProvider.value.key, editorValue.value);
  }
  closeEditor();
}

function closeEditor(): void {
  editorOpen.value = false;
  editingMode.value = null;
  editingMessageId.value = null;
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
.ai-chat { display: flex; height: 100%; min-height: 0; background: #f7f8fb; color: #1f2430; }
.ai-chat--compact { background: #fafbfd; }
.ai-chat__history { width: 260px; border-right: 1px solid #e6e9f0; background: #ffffff; display: flex; flex-direction: column; min-height: 0; }
.ai-chat__main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.ai-chat__topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #e6e9f0; background: rgba(255,255,255,0.88); backdrop-filter: blur(10px); }
.ai-chat__topbar-main { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.ai-chat__brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ai-chat__brand-icon { width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #6f51ff 0%, #5b3fe5 100%); color: #fff; }
.ai-chat__brand-icon svg { width: 18px; height: 18px; }
.ai-chat__brand strong, .ai-chat__brand span { display: block; }
.ai-chat__brand span { color: #7f8797; font-size: 12px; }
.ai-chat__title-input { min-width: 0; max-width: 320px; border-radius: 8px; }
.ai-chat__topbar-actions { display: flex; align-items: center; gap: 8px; }
.ai-chat__icon-button { width: 32px; height: 32px; border: 1px solid #d9deea; border-radius: 8px; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: #667085; }
.ai-chat__icon-button svg { width: 16px; height: 16px; }
.ai-chat__icon-button span { font-size: 18px; line-height: 1; }
.ai-chat__history-head, .ai-chat__section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ai-chat__history-head { padding: 12px; border-bottom: 1px solid #eef1f6; }
.ai-chat__history-search { margin: 12px; border-radius: 8px; }
.ai-chat__history-list { padding: 0 12px 12px; overflow: auto; display: grid; gap: 8px; }
.ai-chat__history-item { border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; }
.ai-chat__history-item--active { border-color: #c9d4ff; box-shadow: 0 0 0 1px rgba(111,81,255,0.08); }
.ai-chat__history-open { width: 100%; text-align: left; background: none; border: 0; padding: 10px; display: grid; gap: 4px; }
.ai-chat__history-open span, .ai-chat__empty-note, .ai-chat__muted { color: #7f8797; font-size: 12px; }
.ai-chat__history-actions { display: flex; gap: 10px; padding: 0 10px 10px; }
.ai-chat__link-button { border: 0; background: none; color: #51607a; padding: 0; }
.ai-chat__context { margin: 12px 14px 0; padding: 12px; border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; display: grid; gap: 12px; }
.ai-chat__badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #eef2ff; color: #4f46e5; }
.ai-chat__badge--warning { background: #fff4db; color: #a16207; }
.ai-chat__context-rows { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.ai-chat__context-row { border: 1px solid #eef1f6; border-radius: 8px; padding: 10px; display: grid; gap: 4px; }
.ai-chat__context-row span { color: #7f8797; font-size: 12px; }
.ai-chat__context-card { border: 1px solid #eef1f6; border-radius: 8px; padding: 10px; background: #fbfcfe; }
.ai-chat__warning { color: #a16207; font-size: 12px; }
.ai-chat__banner { margin: 12px 14px 0; padding: 12px; border-radius: 8px; border: 1px solid #f0d2d2; background: #fff6f6; }
.ai-chat__banner--error strong { display: block; margin-bottom: 4px; }
.ai-chat__timeline { flex: 1; min-height: 0; overflow: auto; padding: 18px 14px; display: grid; gap: 12px; }
.ai-chat__empty-state, .ai-chat__bubble { border: 1px solid #e6e9f0; border-radius: 8px; background: #fff; padding: 14px; }
.ai-chat__empty-state { display: grid; gap: 10px; justify-items: center; text-align: center; padding: 28px 18px; }
.ai-chat__empty-icon { width: 56px; height: 56px; border-radius: 999px; background: linear-gradient(180deg, #6f51ff 0%, #5b3fe5 100%); color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.ai-chat__empty-icon svg { width: 22px; height: 22px; }
.ai-chat__primary-button { border: 0; border-radius: 8px; background: #ffffff; box-shadow: inset 0 0 0 1px #dce3f5; padding: 10px 16px; color: #1f2430; }
.ai-chat__bubble--user { background: #f8fbff; }
.ai-chat__bubble-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.ai-chat__bubble-meta span { display: block; color: #7f8797; font-size: 12px; margin-top: 2px; }
.ai-chat__bubble-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ai-chat__message-copy :deep(p:last-child) { margin-bottom: 0; }
.ai-chat__result-section { display: grid; gap: 6px; margin-top: 10px; }
.ai-chat__result-section h4 { margin: 0; font-size: 13px; color: #3e4a60; }
.ai-chat__result-section ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.ai-chat__composer { position: relative; border-top: 1px solid #e6e9f0; background: #fff; padding: 12px 14px 14px; display: grid; gap: 10px; }
.ai-chat__composer-tools { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.ai-chat__composer-action { border: 1px solid #d9deea; border-radius: 8px; background: #fff; padding: 8px 10px; color: #51607a; }
.ai-chat__composer-icon { width: 36px; height: 36px; border: 1px solid #d9deea; border-radius: 8px; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: #51607a; }
.ai-chat__composer-input { min-height: 120px; resize: vertical; border-radius: 8px; }
.ai-chat__context-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
.ai-chat__context-chip { border: 1px solid #dce3f5; border-radius: 8px; background: #f8fbff; padding: 8px 10px; display: grid; gap: 2px; text-align: left; max-width: 100%; }
.ai-chat__context-chip strong, .ai-chat__context-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-chat__context-chip span { color: #7f8797; font-size: 12px; }
.ai-chat__context-menu { position: absolute; right: 14px; bottom: 164px; width: min(320px, calc(100% - 28px)); border: 1px solid #d9deea; border-radius: 8px; background: #fff; box-shadow: 0 16px 32px rgba(21, 27, 38, 0.12); display: grid; overflow: hidden; }
.ai-chat__context-menu-item { border: 0; background: none; padding: 12px; text-align: left; display: grid; gap: 4px; }
.ai-chat__context-menu-item + .ai-chat__context-menu-item { border-top: 1px solid #eef1f6; }
.ai-chat__context-menu-item span { color: #7f8797; font-size: 12px; }
@media (max-width: 900px) {
  .ai-chat__history { width: 220px; }
  .ai-chat__title-input { max-width: 180px; }
}
</style>
