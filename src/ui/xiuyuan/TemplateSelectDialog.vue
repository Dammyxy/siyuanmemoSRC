<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ICardTemplate, TemplateCategory } from '@/core/xiuyuan';

const props = defineProps<{
  templates: ICardTemplate[];
  blockCount: number;
  i18n?: Record<string, string>;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const emit = defineEmits<{
  confirm: [templateId: string];
  ai: [];
  cancel: [];
}>();

const selectedId = ref<string | null>(null);

// 分类名称映射
const categoryNames = computed((): Record<TemplateCategory, string> => ({
  basic: t('templateCategoryBasic', '基础类'),
  cloze: t('templateCategoryCloze', '填空类'),
  list: t('templateCategoryList', '列表类'),
  concept: t('templateCategoryConcept', '概念类'),
  quick: t('templateCategoryQuick', '符号卡片类'),
}));

// 按分类分组模版
const groupedTemplates = computed(() => {
  const groups: Record<TemplateCategory, ICardTemplate[]> = {
    quick: [],  // 符号卡片类放在最前面
    basic: [],
    cloze: [],
    list: [],
    concept: [],
  };

  props.templates.forEach(template => {
    const category = template.category || 'basic';
    groups[category].push(template);
  });

  // 定义分类顺序：符号卡片类 → 基础类 → 其他
  const categoryOrder: TemplateCategory[] = ['quick', 'basic', 'cloze', 'list', 'concept'];
  
  // 按指定顺序返回非空的分类
  return categoryOrder
    .filter(category => groups[category].length > 0)
    .map(category => ({
      category,
      name: categoryNames.value[category],
      templates: groups[category],
    }));
});

const selectedTemplate = computed(() => {
  if (!selectedId.value) return null;
  return props.templates.find(t => t.id === selectedId.value);
});

function handleConfirm() {
  if (selectedId.value) {
    emit('confirm', selectedId.value);
  }
}

function handleCancel() {
  emit('cancel');
}

function handleAiAssist() {
  emit('ai');
}

// 根据模版获取卡片类型标签
function getCardTypeLabel(template: ICardTemplate): string {
  // 根据模版ID或cardRules的typeMarker来判断
  const firstRule = template.cardRules[0];
  if (!firstRule) return 'basic';
  
  const typeMarker = firstRule.typeMarker;
  
  // 映射typeMarker到用户友好的标签
  const typeMap: Record<string, string> = {
    'qa': 'item',
    'Q': 'item',
    'forward': 'item',
    'reverse': 'item',
    'list-qa': 'item',
    'list-concept-multiline': 'descriptor',
    'list-descriptor-multiline': 'descriptor',
    'multi-cloze': 'item',  // 填空类生成的卡片类型是 item
    'concept-descriptor': 'concept-descriptor',
    'concept-definition-forward': 'descriptor',  // 概念定义卡生成的类型是 descriptor
    'concept-definition-reverse': 'descriptor',
  };
  
  return typeMap[typeMarker] || typeMarker;
}

</script>

<template>
  <div class="xiuyuan-template-select">
    <div class="template-info">
      <span class="info-label">{{ t('templateBlockCount', '选中块数量:') }}</span>
      <span class="info-value">{{ blockCount }}</span>
    </div>

    <div class="template-list">
      <div v-for="group in groupedTemplates" :key="group.category" class="template-group">
        <div class="group-title">{{ group.name }}</div>
        <div class="group-items">
          <div
            v-for="template in group.templates"
            :key="template.id"
            class="template-item"
            :class="{ selected: selectedId === template.id }"
            @click="selectedId = template.id"
          >
            <div class="template-name">{{ template.nameKey ? t(template.nameKey, template.name) : template.name }}</div>
            <div class="template-desc" v-html="template.descriptionKey ? t(template.descriptionKey, template.description || '') : template.description"></div>
            <div class="template-card-type">
              {{ t('templateCardTypeLabel', '生成卡片类型：') }}{{ getCardTypeLabel(template) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedTemplate" class="template-preview">
      <div class="preview-title">{{ t('templateRulesLabel', '生成卡片规则：') }}</div>
      <div v-for="(rule, i) in selectedTemplate.cardRules" :key="i" class="rule-item">
        <span class="rule-marker">{{ rule.typeMarker }}</span>
        <span>{{ t('templateFrontLabel', '正面:') }} {{ rule.frontFields.join(', ') }}</span>
        <span>→</span>
        <span>{{ t('templateBackLabel', '背面:') }} {{ rule.backFields.join(', ') }}</span>
      </div>
    </div>

    <div class="dialog-actions">
      <button class="btn btn-ai" @click="handleAiAssist">{{ t('aiMakeCards', 'AI 辅助制卡') }}</button>
      <button class="btn btn-cancel" @click="handleCancel">{{ t('cancel', '取消') }}</button>
      <button class="btn btn-confirm" :disabled="!selectedId" @click="handleConfirm">
        {{ t('templateConfirmCreate', '确认创建') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.xiuyuan-template-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  max-height: 600px;
  min-height: 400px;
}

.template-info {
  display: flex;
  gap: 8px;
  font-size: 14px;
  flex-shrink: 0;
}

.info-label {
  color: var(--b3-theme-on-surface-light);
}

.info-value {
  font-weight: 500;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
  min-height: 0;
}

.template-list::-webkit-scrollbar {
  width: 6px;
}

.template-list::-webkit-scrollbar-thumb {
  background: var(--b3-theme-on-surface-light);
  border-radius: 3px;
}

.template-list::-webkit-scrollbar-track {
  background: transparent;
}

.template-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--b3-theme-primary);
  padding: 8px 12px;
  background: var(--b3-theme-background);
  border-radius: 4px;
  border: 1px solid var(--b3-theme-primary);
  border-left: 3px solid var(--b3-theme-primary);
  position: sticky;
  top: 0;
  z-index: 1;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 12px;
}

.template-item {
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--b3-theme-background);
}

.template-item:hover {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-surface-lighter);
  transform: translateX(2px);
}

.template-item.selected {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary-lightest);
  box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest);
}

.template-name {
  font-weight: 500;
  margin-bottom: 4px;
  font-size: 14px;
}

.template-desc {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
  line-height: 1.4;
}

.template-card-type {
  font-size: 11px;
  color: var(--b3-theme-primary);
  font-weight: 500;
  padding: 4px 8px;
  background: var(--b3-theme-primary-lightest);
  border-radius: 3px;
  display: inline-block;
}

.template-fields {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.field-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--b3-theme-surface);
  border-radius: 3px;
  border: 1px solid var(--b3-border-color);
  color: var(--b3-theme-on-surface);
}

.template-preview {
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 4px;
  border: 1px solid var(--b3-border-color);
  flex-shrink: 0;
}

.preview-title {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
  font-weight: 500;
}

.rule-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
  align-items: center;
}

.rule-marker {
  font-weight: 500;
  color: var(--b3-theme-primary);
  min-width: 60px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--b3-border-color);
  flex-shrink: 0;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--b3-border-color);
}

.btn-ai {
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-theme-primary);
  color: var(--b3-theme-primary);
}

.btn-ai:hover {
  background: var(--b3-theme-primary-lightest);
}

.btn-cancel:hover {
  background: var(--b3-theme-surface);
}

.btn-confirm {
  background: var(--b3-theme-primary);
  color: white;
  border: none;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--b3-theme-primary-light);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
