<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ICardTemplate } from '@/core/xiuyuan';

const props = defineProps<{
  templates: ICardTemplate[];
  blockCount: number;
}>();

const emit = defineEmits<{
  confirm: [templateId: string];
  cancel: [];
}>();

const selectedId = ref<string | null>(null);

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
      <div
        v-for="template in templates"
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
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.template-info {
  display: flex;
  gap: 8px;
  font-size: 14px;
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
  gap: 8px;
  flex: 1;
  overflow-y: auto;
}

.template-item {
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-item:hover {
  border-color: var(--b3-theme-primary);
}

.template-item.selected {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary-lightest);
}

.template-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.template-desc {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
}

.template-fields {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.field-tag {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--b3-theme-surface);
  border-radius: 2px;
}

.template-preview {
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 4px;
}

.preview-title {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
}

.rule-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
}

.rule-marker {
  font-weight: 500;
  color: var(--b3-theme-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--b3-border-color);
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--b3-border-color);
}

.btn-confirm {
  background: var(--b3-theme-primary);
  color: white;
  border: none;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
