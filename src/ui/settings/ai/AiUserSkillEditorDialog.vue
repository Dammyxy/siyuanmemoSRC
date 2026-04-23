<template>
  <div class="ai-settings-dialog">
    <header class="ai-settings-dialog__header">
      <div>
        <strong>{{ dialogTitle }}</strong>
        <p class="ai-settings-dialog__copy">
          {{ draft.mode === 'structured'
            ? t('structuredSkillHint', '按 section 返回结构化 JSON，并使用通用 renderer 展示。')
            : t('chatSkillHint', '复用统一聊天 runtime，可调用已授权工具组。') }}
        </p>
      </div>
    </header>

    <div class="ai-user-skill-editor">
      <section class="ai-user-skill-editor__form">
        <div class="form-item">
          <label>ID</label>
          <div class="form-control">
            <input v-model="draft.id" type="text">
          </div>
          <p class="form-hint">{{ t('aiSkillIdHint', '保存时会自动归一化成 user:&lt;slug&gt;，并避开内置 skill id。') }}</p>
        </div>

        <div class="form-item">
          <label>{{ t('title', '标题') }}</label>
          <div class="form-control">
            <input v-model="draft.title" type="text">
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('description', '简介') }}</label>
          <div class="form-control">
            <textarea v-model="draft.brief" rows="2" class="form-textarea"></textarea>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('mode', '模式') }}</label>
          <div class="form-control">
            <select v-model="draft.mode" class="scheduler-select">
              <option value="chat">chat</option>
              <option value="structured">structured</option>
            </select>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('enabled', '启用') }}</label>
          <div class="form-control">
            <label class="ai-user-skill-editor__toggle">
              <input v-model="draft.enabled" type="checkbox">
              <span>{{ t('enabled', '启用') }}</span>
            </label>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('aiBaseRunPrompt', 'Skill 基础 Prompt') }}</label>
          <div class="form-control">
            <textarea v-model="draft.systemPromptTemplate" rows="6" class="form-textarea"></textarea>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('composerPlaceholder', '输入预设') }}</label>
          <div class="form-control">
            <textarea v-model="draft.composerPreset" rows="3" class="form-textarea"></textarea>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('primaryAction', '主按钮文案') }}</label>
          <div class="form-control">
            <input v-model="draft.primaryActionLabel" type="text">
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('tools', '工具组') }}</label>
          <div class="ai-user-skill-editor__tool-groups">
            <label
              v-for="option in toolGroupOptions"
              :key="option.key"
              class="ai-user-skill-editor__tool-option"
            >
              <input
                type="checkbox"
                :checked="draft.defaultToolGroups.includes(option.key)"
                @change="toggleToolGroup(option.key, ($event.target as HTMLInputElement).checked)"
              >
              <strong>{{ option.label }}</strong>
              <span>{{ option.hint }}</span>
            </label>
          </div>
        </div>

        <div class="form-item">
          <label>{{ t('surfaceHints', 'Surface 提示') }}</label>
          <div class="ai-user-skill-editor__surface">
            <label>
              <span>{{ t('compactTitle', '紧凑标题') }}</span>
              <input v-model="draft.surfaceHints.compactTitle" type="text">
            </label>
            <label>
              <span>{{ t('composerRows', '输入框行数') }}</span>
              <input v-model.number="draft.surfaceHints.composerRows" type="number" min="2" max="10" step="1">
            </label>
            <label class="ai-user-skill-editor__toggle">
              <input v-model="draft.surfaceHints.hideTabs" type="checkbox">
              <span>{{ t('hideTabs', '隐藏 tabs') }}</span>
            </label>
          </div>
        </div>
      </section>

      <section v-if="draft.mode === 'structured'" class="ai-user-skill-editor__sections">
        <div class="ai-user-skill-editor__sections-head">
          <div>
            <strong>{{ t('sections', 'Sections') }}</strong>
            <p class="ai-settings-dialog__copy">{{ t('aiSectionManagerHint', '拖拽左侧 section 列表可调整运行时 tab 顺序。') }}</p>
          </div>
          <button class="b3-button b3-button--outline" type="button" @click="addSection">
            {{ t('addSection', '新增 Section') }}
          </button>
        </div>

        <div class="ai-user-skill-editor__sections-layout">
          <AiSettingsDraggableList
            :items="draft.sections"
            @reorder="handleSectionReorder"
          >
            <template #item="{ item, index, isDragOver }">
              <div
                class="ai-user-skill-editor__section-summary"
                :class="{
                  'ai-user-skill-editor__section-summary--active': selectedSectionId === item.id,
                  'ai-user-skill-editor__section-summary--drag-over': isDragOver,
                }"
                @click="selectedSectionId = item.id"
              >
                <div>
                  <strong>{{ item.title || `${t('sections', 'Sections')} ${index + 1}` }}</strong>
                  <span>{{ item.responseKey }}</span>
                </div>
                <div class="ai-user-skill-editor__section-actions">
                  <button class="b3-button b3-button--text" type="button" @click.stop="duplicateSection(index)">
                    {{ t('duplicate', '复制') }}
                  </button>
                  <button class="b3-button b3-button--text" type="button" @click.stop="removeSection(index)">
                    {{ t('delete', '删除') }}
                  </button>
                </div>
              </div>
            </template>
          </AiSettingsDraggableList>

          <div v-if="selectedSection" class="ai-user-skill-editor__section-form">
            <div class="form-item">
              <label>ID</label>
              <div class="form-control">
                <input v-model="selectedSection.id" type="text">
              </div>
            </div>

            <div class="form-item">
              <label>{{ t('title', '标题') }}</label>
              <div class="form-control">
                <input v-model="selectedSection.title" type="text">
              </div>
            </div>

            <div class="form-item">
              <label>{{ t('responseKey', '响应 key') }}</label>
              <div class="form-control">
                <input v-model="selectedSection.responseKey" type="text">
              </div>
            </div>

            <div class="form-item">
              <label>{{ t('renderer', 'Renderer') }}</label>
              <div class="form-control">
                <select v-model="selectedSection.renderer" class="scheduler-select">
                  <option
                    v-for="option in rendererOptions"
                    :key="option.key"
                    :value="option.key"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-item">
              <label>{{ t('emptyHint', '空态提示') }}</label>
              <div class="form-control">
                <input v-model="selectedSection.emptyHint" type="text">
              </div>
            </div>

            <div class="form-item">
              <label>{{ t('aiBehaviorPrompt', '行为 Prompt') }}</label>
              <div class="form-control">
                <textarea v-model="selectedSection.runPrompt" rows="4" class="form-textarea"></textarea>
              </div>
            </div>

            <div class="form-item">
              <label>{{ t('aiFollowUpPrompt', '追问 Prompt') }}</label>
              <div class="form-control">
                <textarea v-model="selectedSection.followUpPrompt" rows="4" class="form-textarea"></textarea>
              </div>
            </div>

            <label class="ai-user-skill-editor__toggle">
              <input v-model="selectedSection.required" type="checkbox">
              <span>{{ t('required', '必填 section') }}</span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <footer class="ai-settings-dialog__footer">
      <button class="b3-button b3-button--outline" type="button" @click="emit('close')">
        {{ t('cancel', '取消') }}
      </button>
      <button class="b3-button b3-button--text" type="button" @click="handleSave">
        {{ isNew ? t('create', '创建') : t('saveSettings', '保存设置') }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  AIChatToolGroupKey,
  AIUserSkillDefinition,
  AIUserSkillSectionDefinition,
} from '@/types/ai';
import AiSettingsDraggableList from './AiSettingsDraggableList.vue';

type UserSkillMode = AIUserSkillDefinition['mode'];

const props = defineProps<{
  skill: AIUserSkillDefinition;
  isNew?: boolean;
  toolGroupOptions: Array<{ key: AIChatToolGroupKey; label: string; hint: string }>;
  rendererOptions: Array<{ key: AIUserSkillSectionDefinition['renderer']; label: string }>;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'save', payload: AIUserSkillDefinition): void;
  (e: 'close'): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function ensureSurfaceHints(skill: AIUserSkillDefinition): AIUserSkillDefinition {
  return {
    ...skill,
    surfaceHints: {
      compactTitle: skill.surfaceHints?.compactTitle || '',
      hideTabs: skill.surfaceHints?.hideTabs === true,
      composerRows: Math.max(2, Math.min(10, Number(skill.surfaceHints?.composerRows) || (skill.mode === 'chat' ? 5 : 4))),
    },
  };
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSection(index: number): AIUserSkillSectionDefinition {
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

const draft = ref<AIUserSkillDefinition>(ensureSurfaceHints(cloneSerializable(props.skill)));
const selectedSectionId = ref<string>(draft.value.sections[0]?.id || '');

const toolGroupOptions = computed(() => props.toolGroupOptions);
const rendererOptions = computed(() => props.rendererOptions);
const isNew = computed(() => props.isNew === true);
const dialogTitle = computed(() => isNew.value
  ? t('aiCreateUserSkillTitle', '创建用户 Skill')
  : t('aiEditUserSkillTitle', '编辑用户 Skill'));

watch(
  () => draft.value.mode,
  (mode: UserSkillMode) => {
    if (mode === 'structured' && draft.value.sections.length === 0) {
      draft.value.sections = [createSection(0)];
      selectedSectionId.value = draft.value.sections[0].id;
    }
  },
);

const selectedSection = computed(() => draft.value.sections.find((section) => section.id === selectedSectionId.value) || null);

function toggleToolGroup(key: AIChatToolGroupKey, checked: boolean): void {
  draft.value.defaultToolGroups = checked
    ? Array.from(new Set([...draft.value.defaultToolGroups, key]))
    : draft.value.defaultToolGroups.filter((entry) => entry !== key);
}

function addSection(): void {
  const next = createSection(draft.value.sections.length);
  draft.value.sections.push(next);
  selectedSectionId.value = next.id;
}

function duplicateSection(index: number): void {
  const current = draft.value.sections[index];
  if (!current) {
    return;
  }
  const copy = cloneSerializable(current);
  copy.id = `${current.id}-copy`;
  copy.title = `${current.title} Copy`;
  draft.value.sections.splice(index + 1, 0, copy);
  selectedSectionId.value = copy.id;
}

function removeSection(index: number): void {
  const removed = draft.value.sections[index];
  if (!removed) {
    return;
  }
  draft.value.sections.splice(index, 1);
  if (removed.id === selectedSectionId.value) {
    selectedSectionId.value = draft.value.sections[Math.max(0, index - 1)]?.id || draft.value.sections[0]?.id || '';
  }
}

function handleSectionReorder(items: Array<{ id: string }>): void {
  const order = items.map((entry) => entry.id);
  draft.value.sections = order
    .map((id) => draft.value.sections.find((section) => section.id === id))
    .filter((section): section is AIUserSkillSectionDefinition => Boolean(section));
}

function handleSave(): void {
  emit('save', cloneSerializable(ensureSurfaceHints(draft.value)));
}
</script>

<style scoped>
.ai-settings-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  min-height: 100%;
}

.ai-settings-dialog__header,
.ai-settings-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
}

.ai-settings-dialog__copy {
  margin: 6px 0 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 13px;
  line-height: 1.6;
}

.ai-user-skill-editor {
  display: grid;
  gap: 14px;
  padding: 12px 0;
  min-height: 0;
}

.ai-user-skill-editor__form,
.ai-user-skill-editor__sections,
.ai-user-skill-editor__section-form {
  display: grid;
  gap: 12px;
}

.ai-user-skill-editor__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ai-user-skill-editor__tool-groups {
  display: grid;
  gap: 10px;
}

.ai-user-skill-editor__tool-option {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
}

.ai-user-skill-editor__tool-option span {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.ai-user-skill-editor__surface {
  display: grid;
  gap: 10px;
}

.ai-user-skill-editor__surface label {
  display: grid;
  gap: 6px;
}

.ai-user-skill-editor__sections-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-user-skill-editor__sections-layout {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
}

.ai-user-skill-editor__section-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  cursor: pointer;
}

.ai-user-skill-editor__section-summary strong {
  display: block;
}

.ai-user-skill-editor__section-summary span {
  display: block;
  margin-top: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  font-family: var(--b3-font-family-code, monospace);
}

.ai-user-skill-editor__section-summary--active {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary-lightest);
}

.ai-user-skill-editor__section-summary--drag-over {
  transform: translateY(-2px);
}

.ai-user-skill-editor__section-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

@media (max-width: 980px) {
  .ai-user-skill-editor__sections-layout {
    grid-template-columns: 1fr;
  }

  .ai-settings-dialog__header,
  .ai-settings-dialog__footer,
  .ai-user-skill-editor__sections-head {
    flex-direction: column;
  }
}
</style>
