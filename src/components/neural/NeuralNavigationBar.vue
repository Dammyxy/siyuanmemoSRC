<template>
  <div v-if="visible" class="neural-navigation-bar">
    <div class="neural-trail">
      <span class="seed-icon" :title="t('neural.seedCard')">🌱</span>
      <span v-if="previousCardTitle" class="prev-card">{{ previousCardTitle }}</span>
      <span v-if="previousCardTitle && connectionType" class="connection-arrow">
        ──[ {{ localizedConnectionType }} ]──>
      </span>
      <span class="current-card">{{ currentCardTitle }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { AssociationType } from '../../core/queue/neural/types';

/**
 * NeuralNavigationBar - 神经导航栏组件
 * 
 * 显示神经漫游的路径信息，包括前一张卡片、连接类型和当前卡片。
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.7
 */

interface Props {
  /** 前一张卡片标题 */
  previousCardTitle?: string;
  /** 连接类型 */
  connectionType?: AssociationType | string;
  /** 当前卡片标题 */
  currentCardTitle: string;
  /** 语言环境 */
  locale?: 'zh-CN' | 'en-US';
  /** 是否显示 */
  visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  previousCardTitle: '',
  connectionType: '',
  locale: 'zh-CN',
  visible: true,
});

/**
 * 本地化的连接类型文本
 * Requirements: 6.3, 6.7
 */
const localizedConnectionType = computed(() => {
  if (!props.connectionType) return '';

  const translations: Record<string, Record<string, string>> = {
    'zh-CN': {
      [AssociationType.REF_LINK]: '双向链接',
      [AssociationType.HIERARCHY]: '同文档',
      [AssociationType.TAG]: '标签关联',
      [AssociationType.SIBLING]: '兄弟块',
      'ref': '双向链接',
      'context': '同文档',
      'tag': '标签关联',
      'sibling': '兄弟块',
    },
    'en-US': {
      [AssociationType.REF_LINK]: 'Link',
      [AssociationType.HIERARCHY]: 'Context',
      [AssociationType.TAG]: 'Tag',
      [AssociationType.SIBLING]: 'Sibling',
      'ref': 'Link',
      'context': 'Context',
      'tag': 'Tag',
      'sibling': 'Sibling',
    },
  };

  const localeTranslations = translations[props.locale] || translations['zh-CN'];
  return localeTranslations[props.connectionType] || props.connectionType;
});

/**
 * 简单的国际化函数
 */
const t = (key: string): string => {
  const translations: Record<string, Record<string, string>> = {
    'zh-CN': {
      'neural.seedCard': '种子卡片',
    },
    'en-US': {
      'neural.seedCard': 'Seed Card',
    },
  };

  const localeTranslations = translations[props.locale] || translations['zh-CN'];
  return localeTranslations[key] || key;
};
</script>

<style scoped>
.neural-navigation-bar {
  padding: 12px 16px;
  background: var(--b3-theme-surface);
  border-bottom: 1px solid var(--b3-border-color);
  font-size: 14px;
  color: var(--b3-theme-on-surface);
}

.neural-trail {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.seed-icon {
  font-size: 16px;
  cursor: help;
}

.prev-card {
  color: var(--b3-theme-on-surface-light);
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-arrow {
  color: var(--b3-theme-primary);
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}

.current-card {
  color: var(--b3-theme-on-surface);
  font-weight: 600;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 暗色主题适配 */
.b3-theme--dark .neural-navigation-bar {
  background: var(--b3-theme-surface);
}

.b3-theme--dark .prev-card {
  color: var(--b3-theme-on-surface-light);
}

.b3-theme--dark .connection-arrow {
  color: var(--b3-theme-primary-light);
}

.b3-theme--dark .current-card {
  color: var(--b3-theme-on-surface);
}
</style>
