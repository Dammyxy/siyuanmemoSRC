<template>
  <div class="ai-settings-dialog">
    <header class="ai-settings-dialog__header">
      <div>
        <strong>{{ dialogTitle }}</strong>
        <p class="ai-settings-dialog__copy">
          {{ dialogDescription }}
        </p>
      </div>
      <button class="b3-button b3-button--outline" type="button" @click="clearOverrides">
        {{ clearLabel }}
      </button>
    </header>

    <div class="ai-tool-permission-list">
      <article
        v-for="tool in displayedTools"
        :key="tool.name"
        class="ai-tool-permission-card"
      >
        <div class="ai-tool-permission-card__meta">
          <div>
            <strong>{{ tool.title }}</strong>
            <div class="ai-tool-permission-card__name">{{ tool.name }}</div>
          </div>
          <span class="ai-tool-permission-card__group">{{ groupTitleMap[tool.group] || tool.group }}</span>
        </div>

        <p class="ai-tool-permission-card__description">{{ tool.description }}</p>

        <div class="ai-tool-permission-card__defaults">
          <span>{{ t('followDefault', '跟随默认') }} · {{ formatExecutionPolicy(tool.executionPolicy) }}</span>
          <span>{{ t('followDefault', '跟随默认') }} · {{ formatResultPolicy(tool.resultApprovalPolicy) }}</span>
        </div>

        <div class="ai-tool-permission-card__policies">
          <label>
            <span>{{ t('executionApproval', '执行审批') }}</span>
            <select v-model="executionPoliciesDraft[tool.name]" class="scheduler-select">
              <option value="">{{ t('followDefault', '跟随默认') }}</option>
              <option value="auto">{{ t('approvalAuto', '自动执行') }}</option>
              <option value="ask-once">{{ t('approvalAskOnce', '首次询问') }}</option>
              <option value="ask-always">{{ t('approvalAskAlways', '每次询问') }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('resultApproval', '结果审批') }}</span>
            <select v-model="resultPoliciesDraft[tool.name]" class="scheduler-select">
              <option value="">{{ t('followDefault', '跟随默认') }}</option>
              <option value="never">{{ t('approvalNever', '不审批') }}</option>
              <option value="on-error">{{ t('approvalOnError', '仅错误时审批') }}</option>
              <option value="always">{{ t('approvalAlways', '总是审批') }}</option>
            </select>
          </label>
        </div>
      </article>
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
import type {
  AIChatToolDescriptor,
  AIChatToolGroupDefinition,
  AIChatToolGroupKey,
} from '@/types/ai';
import type {
  AIToolExecutionPolicy,
  AIToolResultApprovalPolicy,
} from '@/types/settings';

const props = defineProps<{
  groupKey?: AIChatToolGroupKey | null;
  groups: AIChatToolGroupDefinition[];
  tools: AIChatToolDescriptor[];
  executionPolicies: Partial<Record<string, AIToolExecutionPolicy>>;
  resultApprovalPolicies: Partial<Record<string, AIToolResultApprovalPolicy>>;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'save', payload: {
    executionPolicies: Partial<Record<string, AIToolExecutionPolicy>>;
    resultApprovalPolicies: Partial<Record<string, AIToolResultApprovalPolicy>>;
  }): void;
  (e: 'close'): void;
}>();

const executionPoliciesDraft = ref<Partial<Record<string, AIToolExecutionPolicy | ''>>>({
  ...props.executionPolicies,
});
const resultPoliciesDraft = ref<Partial<Record<string, AIToolResultApprovalPolicy | ''>>>({
  ...props.resultApprovalPolicies,
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function formatExecutionPolicy(policy: AIToolExecutionPolicy): string {
  switch (policy) {
    case 'ask-once':
      return t('approvalAskOnce', '首次询问');
    case 'ask-always':
      return t('approvalAskAlways', '每次询问');
    case 'auto':
    default:
      return t('approvalAuto', '自动执行');
  }
}

function formatResultPolicy(policy: AIToolResultApprovalPolicy): string {
  switch (policy) {
    case 'always':
      return t('approvalAlways', '总是审批');
    case 'on-error':
      return t('approvalOnError', '仅错误时审批');
    case 'never':
    default:
      return t('approvalNever', '不审批');
  }
}

const groupTitleMap = computed<Record<string, string>>(() => Object.fromEntries(
  props.groups.map((group) => [group.key, group.title]),
));

const displayedTools = computed(() => {
  if (!props.groupKey) {
    return props.tools;
  }
  return props.tools.filter((tool) => tool.group === props.groupKey);
});

const dialogTitle = computed(() => {
  if (!props.groupKey) {
    return t('aiPermissionManagerTitle', '管理工具执行权限');
  }
  return t('aiPermissionManagerGroupTitle', '管理分组执行权限').replace('{group}', groupTitleMap.value[props.groupKey] || props.groupKey);
});

const dialogDescription = computed(() => {
  if (!props.groupKey) {
    return t('aiPermissionManagerHint', '主设置页只负责默认开关；这里统一管理每个工具的执行与结果审批覆盖。');
  }
  return t('aiPermissionManagerGroupHint', '这里只显示当前工具组；将空值留给“跟随默认”，即可回退到工具原始策略。');
});

const clearLabel = computed(() => props.groupKey
  ? t('aiPermissionClearGroupOverrides', '清空当前分组覆盖')
  : t('aiPermissionClearAllOverrides', '清空全部审批覆盖'));

function clearOverrides(): void {
  if (!props.groupKey) {
    executionPoliciesDraft.value = {};
    resultPoliciesDraft.value = {};
    return;
  }
  const nextExecution = { ...executionPoliciesDraft.value };
  const nextResult = { ...resultPoliciesDraft.value };
  for (const tool of displayedTools.value) {
    delete nextExecution[tool.name];
    delete nextResult[tool.name];
  }
  executionPoliciesDraft.value = nextExecution;
  resultPoliciesDraft.value = nextResult;
}

function stripEmptyValues<T extends string>(source: Partial<Record<string, T | ''>>): Partial<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => Boolean(value)),
  ) as Partial<Record<string, T>>;
}

function handleSave(): void {
  emit('save', {
    executionPolicies: stripEmptyValues<AIToolExecutionPolicy>(executionPoliciesDraft.value),
    resultApprovalPolicies: stripEmptyValues<AIToolResultApprovalPolicy>(resultPoliciesDraft.value),
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

.ai-tool-permission-list {
  display: grid;
  gap: 12px;
  overflow: auto;
  padding-right: 4px;
}

.ai-tool-permission-card {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--b3-border-color);
  border-radius: 14px;
  background: var(--b3-theme-surface);
}

.ai-tool-permission-card__meta,
.ai-tool-permission-card__defaults,
.ai-tool-permission-card__policies {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-tool-permission-card__name {
  margin-top: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  font-family: var(--b3-font-family-code, monospace);
}

.ai-tool-permission-card__group {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(76, 110, 245, 0.12);
  color: var(--b3-theme-primary);
  font-size: 12px;
  font-weight: 600;
}

.ai-tool-permission-card__description {
  margin: 0;
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  line-height: 1.6;
}

.ai-tool-permission-card__defaults {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  flex-wrap: wrap;
}

.ai-tool-permission-card__policies {
  flex-wrap: wrap;
}

.ai-tool-permission-card__policies label {
  display: grid;
  gap: 6px;
  min-width: min(100%, 260px);
  flex: 1;
}

.ai-tool-permission-card__policies span {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 760px) {
  .ai-settings-dialog__header,
  .ai-settings-dialog__footer,
  .ai-tool-permission-card__meta,
  .ai-tool-permission-card__defaults,
  .ai-tool-permission-card__policies {
    flex-direction: column;
  }
}
</style>
