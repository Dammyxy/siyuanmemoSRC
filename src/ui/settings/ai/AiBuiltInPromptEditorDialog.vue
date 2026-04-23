<template>
  <div class="ai-settings-dialog">
    <header class="ai-settings-dialog__header">
      <div>
        <strong>{{ title }}</strong>
        <p class="ai-settings-dialog__copy">{{ summary }}</p>
      </div>
    </header>

    <div v-if="mode === 'generalChat'" class="ai-built-in-editor__panel">
      <label class="ai-built-in-editor__label">{{ t('aiBaseRunPrompt', 'Skill 基础 Prompt') }}</label>
      <textarea
        v-model="generalChatDraft.systemPrompt"
        class="form-textarea ai-built-in-editor__textarea"
        rows="16"
      ></textarea>
    </div>

    <div v-else class="ai-built-in-editor ai-built-in-editor--concept-coach">
      <aside class="ai-built-in-editor__nav">
        <button
          v-for="entry in navEntries"
          :key="entry.id"
          class="ai-built-in-editor__nav-item"
          :class="{ 'ai-built-in-editor__nav-item--active': activePanel === entry.id }"
          type="button"
          @click="activePanel = entry.id"
        >
          {{ entry.title }}
        </button>
      </aside>

      <section class="ai-built-in-editor__content">
        <template v-if="activePanel === 'base'">
          <label class="ai-built-in-editor__label">{{ t('aiBaseRunPrompt', 'Skill 基础 Prompt') }}</label>
          <textarea
            v-model="conceptCoachDraft.baseRun"
            class="form-textarea ai-built-in-editor__textarea"
            rows="14"
          ></textarea>
        </template>

        <template v-else-if="activePanel === 'contract'">
          <div class="ai-built-in-editor__contract">
            <strong>{{ t('aiPromptShowSystemContract', '查看系统自动附加的结构化规则') }}</strong>
            <p class="ai-settings-dialog__copy">{{ contractSummary }}</p>
            <ul class="ai-built-in-editor__contract-list">
              <li v-for="line in contractLines" :key="line">{{ line }}</li>
            </ul>
          </div>
        </template>

        <template v-else>
          <label class="ai-built-in-editor__label">{{ activeTab?.title || '' }} · {{ t('aiBehaviorPrompt', '行为 Prompt') }}</label>
          <textarea
            v-model="conceptCoachDraft.tabs[activePromptTabId].run"
            class="form-textarea ai-built-in-editor__textarea"
            rows="10"
          ></textarea>

          <label class="ai-built-in-editor__label">{{ activeTab?.title || '' }} · {{ t('aiFollowUpPrompt', '追问 Prompt') }}</label>
          <textarea
            v-model="conceptCoachDraft.tabs[activePromptTabId].followUp"
            class="form-textarea ai-built-in-editor__textarea"
            rows="7"
          ></textarea>
        </template>
      </section>
    </div>

    <footer class="ai-settings-dialog__footer">
      <button class="b3-button b3-button--outline" type="button" @click="emit('close')">
        {{ t('cancel', '取消') }}
      </button>
      <button class="b3-button b3-button--text" type="button" @click="handleSave">
        {{ t('saveSettings', '保存设置') }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AIConceptCoachTabId } from '@/types/ai';
import type {
  AIGeneralChatPromptTemplate,
  AIConceptCoachPromptTemplates,
} from '@/types/settings';

type EditorMode = 'generalChat' | 'conceptCoach';
type NavId = 'base' | 'contract' | AIConceptCoachTabId;

const props = defineProps<{
  mode: EditorMode;
  title: string;
  summary: string;
  i18n?: Record<string, string>;
  generalChatTemplate?: AIGeneralChatPromptTemplate;
  conceptCoachTemplate?: AIConceptCoachPromptTemplates;
  tabs: Array<{ id: AIConceptCoachTabId; title: string }>;
  contractSummary?: string;
  contractLines?: string[];
}>();

const emit = defineEmits<{
  (e: 'save', payload: {
    generalChatTemplate?: AIGeneralChatPromptTemplate;
    conceptCoachTemplate?: AIConceptCoachPromptTemplates;
  }): void;
  (e: 'close'): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const generalChatDraft = ref<AIGeneralChatPromptTemplate>(cloneSerializable(
  props.generalChatTemplate || { systemPrompt: '' },
));

const conceptCoachDraft = ref<AIConceptCoachPromptTemplates>(cloneSerializable(
  props.conceptCoachTemplate || {
    baseRun: '',
    tabs: {
      'working-definition': { run: '', followUp: '' },
      perspectives: { run: '', followUp: '' },
      'integrated-understanding': { run: '', followUp: '' },
      'self-test-cards': { run: '', followUp: '' },
      'cdf-structure': { run: '', followUp: '' },
      'real-world-triggers': { run: '', followUp: '' },
    },
  },
));

const activePanel = ref<NavId>('base');

const navEntries = computed<Array<{ id: NavId; title: string }>>(() => [
  { id: 'base', title: t('aiBaseRunPrompt', 'Skill 基础 Prompt') },
  { id: 'contract', title: t('aiPromptContractTab', '结构化规则') },
  ...props.tabs.map((tab) => ({ id: tab.id, title: tab.title })),
]);

const activeTab = computed(() => props.tabs.find((tab) => tab.id === activePanel.value) || null);
const activePromptTabId = computed<AIConceptCoachTabId>(() => (
  activePanel.value !== 'base' && activePanel.value !== 'contract'
    ? activePanel.value
    : props.tabs[0]?.id || 'working-definition'
));
const contractSummary = computed(() => props.contractSummary || '');
const contractLines = computed(() => props.contractLines || []);

function handleSave(): void {
  if (props.mode === 'generalChat') {
    emit('save', {
      generalChatTemplate: cloneSerializable(generalChatDraft.value),
    });
    return;
  }

  emit('save', {
    conceptCoachTemplate: cloneSerializable(conceptCoachDraft.value),
  });
}
</script>

<style scoped>
.ai-settings-dialog {
  display: grid;
  gap: 14px;
  min-height: 100%;
}

.ai-settings-dialog__header,
.ai-settings-dialog__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-settings-dialog__copy {
  margin: 6px 0 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 13px;
  line-height: 1.6;
}

.ai-built-in-editor {
  display: grid;
  gap: 14px;
}

.ai-built-in-editor--concept-coach {
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
}

.ai-built-in-editor__panel,
.ai-built-in-editor__content {
  display: grid;
  gap: 10px;
}

.ai-built-in-editor__nav {
  display: grid;
  gap: 8px;
  align-content: start;
}

.ai-built-in-editor__nav-item {
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
}

.ai-built-in-editor__nav-item--active {
  border-color: rgba(76, 110, 245, 0.4);
  background: rgba(76, 110, 245, 0.1);
  color: var(--b3-theme-primary);
}

.ai-built-in-editor__label {
  color: var(--b3-theme-on-surface-light);
  font-size: 13px;
  font-weight: 600;
}

.ai-built-in-editor__textarea {
  min-height: 220px;
}

.ai-built-in-editor__contract {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px dashed var(--b3-border-color);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.74);
}

.ai-built-in-editor__contract-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .ai-built-in-editor--concept-coach {
    grid-template-columns: 1fr;
  }

  .ai-settings-dialog__header,
  .ai-settings-dialog__footer {
    flex-direction: column;
  }
}
</style>
