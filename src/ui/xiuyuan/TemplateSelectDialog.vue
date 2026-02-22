<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ICardTemplate, TemplateCategory } from '@/core/xiuyuan';

const props = defineProps<{
  templates: ICardTemplate[];
  blockCount: number;
}>();

const emit = defineEmits<{
  confirm: [templateId: string];
  cancel: [];
}>();

const selectedId = ref<string | null>(null);

// 分类名称映射
const categoryNames: Record<TemplateCategory, string> = {
  basic: '基础类',
  cloze: '填空类',
  list: '列表类',
  concept: '概念类',
  quick: '快速制卡类',
};

// 按分类分组模版
const groupedTemplates = computed(() => {
  const groups: Record<TemplateCategory, ICardTemplate[]> = {
    quick: [],  // 快速制卡类放在最前面
    basic: [],
    cloze: [],
    list: [],
    concept: [],
  };

  props.templates.forEach(template => {
    const category = template.category || 'basic';
    groups[category].push(template);
  });

  // 定义分类顺序：快速制卡类 → 基础类 → 其他
  const categoryOrder: TemplateCategory[] = ['quick', 'basic', 'cloze', 'list', 'concept'];
  
  // 按指定顺序返回非空的分类
  return categoryOrder
    .filter(category => groups[category].length > 0)
    .map(category => ({
      category,
      name: categoryNames[category],
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
</script>

<template>
  <div class="xiuyuan-template-select">
    <div class="template-info">
      <span class="info-label">选中块数量:</span>
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
            <div class="template-name">{{ template.name }}</div>
            <div class="template-desc">{{ template.description }}</div>
            <div class="template-fields">
              <span v-for="field in template.fields" :key="field.name" class="field-tag">
                {{ field.name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedTemplate" class="template-preview">
      <div class="preview-title">生成卡片规则：</div>
      <div v-for="(rule, i) in selectedTemplate.cardRules" :key="i" class="rule-item">
        <span class="rule-marker">{{ rule.typeMarker }}</span>
        <span>正面: {{ rule.frontFields.join(', ') }}</span>
        <span>→</span>
        <span>背面: {{ rule.backFields.join(', ') }}</span>
      </div>
    </div>

    <div class="dialog-actions">
      <button class="btn btn-cancel" @click="handleCancel">取消</button>
      <button class="btn btn-confirm" :disabled="!selectedId" @click="handleConfirm">
        确认创建
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
