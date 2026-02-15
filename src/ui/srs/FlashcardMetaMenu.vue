<template>
  <div class="meta fn__flex-column">
    <div class="meta__header fn__flex">
      <svg class="meta__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 7h2v2h-2V7zm-1 4h4v6h-4v-6zm2 11C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zm0-2c4.41 0 8-3.59 8-8s-3.59-8-8-8-8 3.59-8 8 3.59 8 8 8z" fill="currentColor"/>
      </svg>
      <span class="fn__flex-1">{{ t('cardMeta', '闪卡元数据') }}</span>
    </div>
    <div class="fn__hr"></div>
    
    <div v-if="loading" class="meta__loading">
      <span class="ft__secondary">{{ t('loading', '加载中...') }}</span>
    </div>
    <div v-else-if="error" class="meta__error">
      <span class="ft__error">{{ error }}</span>
    </div>
    <div v-else class="meta__grid">
      <div v-for="item in fields" :key="item.key" class="meta__item">
        <div class="meta__label">{{ item.label }}</div>
        <div class="meta__value" :title="String(item.value)">{{ item.value }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sql, getBlockAttrs } from '@/core/siyuan/api';
import { createScheduler } from '@/core/scheduler';
import { DEFAULT_SETTINGS } from '@/types';
import type FSRSPlugin from '@/index';

interface FieldItem {
  key: string;
  label: string;
  value: string;
}

const props = defineProps<{
  blockId: string;
  i18n?: Record<string, string>;
  plugin?: FSRSPlugin;  // ✅ 添加 plugin prop
}>();

const t = (key: string, fallback: string) => props.i18n?.[key] || fallback;

const loading = ref(true);
const error = ref('');
const fields = ref<FieldItem[]>([]);

/** 解析思源时间格式 */
function parseTime(v: any): Date | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (/^\d{14}$/.test(raw)) {
    // 思源格式: 20060102150405
    return new Date(
      +raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8),
      +raw.slice(8, 10), +raw.slice(10, 12), +raw.slice(12, 14)
    );
  }
  if (/^\d{13}$/.test(raw)) return new Date(+raw);
  if (/^\d{10}$/.test(raw)) return new Date(+raw * 1000);
  const d = new Date(raw.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? null : d;
}

const fmt = (v: any) => v ?? '-';
const fmtDate = (d: Date | null) => d?.toLocaleString() || '-';

onMounted(async () => {
  try {
    // 获取块信息
    const rows = await sql(`SELECT created, updated, tag FROM blocks WHERE id = '${props.blockId}'`);
    const block = rows?.[0];
    if (!block) {
      error.value = t('blockNotFound', '未找到块信息');
      return;
    }

    // ✅ 新架构：从本地存储获取卡片数据
    const attrs = await getBlockAttrs(props.blockId).catch(() => ({}));
    const card = props.plugin?.storage.getCardByBlockId(props.blockId);
    
    // 获取卡片组名（暂时使用默认值，因为新架构中没有 deckID 概念）
    const deckName = '-';

    // 计算掌握程度
    let mastery = 0;
    if (card?.stability && card.stability > 0) {
      const scheduler = createScheduler(DEFAULT_SETTINGS.fsrs);
      mastery = Math.round(scheduler.getRetrievability({
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty ?? 0,
        elapsedDays: card.elapsedDays ?? 0,
        scheduledDays: card.scheduledDays ?? 0,
        reps: card.reps ?? 0,
        lapses: card.lapses ?? 0,
        state: card.state ?? 0,
        lastReview: card.lastReview ?? Date.now(),
      } as any, new Date()) * 100);
    }

    // 解析问答（从属性中获取）
    const question = Object.entries(attrs).find(([k]) => /question/i.test(k))?.[1] || '';
    const answer = Object.entries(attrs).find(([k]) => /answer/i.test(k))?.[1] || '';

    // 构建字段
    const items: FieldItem[] = [
      { key: 'created', label: t('createdAt', '创建时间'), value: fmtDate(parseTime(block.created)) },
      { key: 'updated', label: t('updatedAt', '修改时间'), value: fmtDate(parseTime(block.updated)) },
      { key: 'reps', label: t('reps', '复习次数'), value: fmt(card?.reps ?? 0) },
      { key: 'mastery', label: t('mastery', '掌握程度'), value: `${mastery}%` },
      { key: 'stability', label: t('stability', '记忆强度'), value: (card?.stability ?? 0).toFixed(2) },
      { key: 'difficulty', label: t('difficulty', '难度'), value: (card?.difficulty ?? 0).toFixed(2) },
      { key: 'lapses', label: t('lapses', '遗忘次数'), value: fmt(card?.lapses ?? 0) },
      { key: 'due', label: t('due', '下次复习'), value: card?.due ? fmtDate(new Date(card.due)) : '-' },
      { key: 'tags', label: t('tags', '关联标签'), value: block.tag || '-' },
      { key: 'deck', label: t('deck', '所属卡片组'), value: deckName },
    ];

    if (question) items.push({ key: 'question', label: t('question', '问题'), value: question });
    if (answer) items.push({ key: 'answer', label: t('answer', '答案'), value: answer });

    fields.value = items;
  } catch (e: any) {
    console.error('[SiyuanMemo] Meta load error:', e);
    error.value = e?.message || t('loadError', '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.meta {
  padding: 16px;
  gap: 12px;
}
.meta__header {
  align-items: center;
  gap: 8px;
}
.meta__icon {
  width: 24px;
  height: 24px;
  color: var(--b3-theme-primary);
}
.meta__loading,
.meta__error {
  padding: 20px;
  text-align: center;
}
.meta__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.meta__item {
  background: var(--b3-theme-surface);
  border-radius: 8px;
  padding: 12px;
}
.meta__label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 6px;
}
.meta__value {
  font-size: 14px;
  color: var(--b3-theme-on-surface);
  word-break: break-word;
}
</style>
