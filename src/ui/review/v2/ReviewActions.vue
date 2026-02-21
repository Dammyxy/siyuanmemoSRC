<template>
  <!-- 阶段1: 答案隐藏 - showAnswer 为 true 时显示"显示答案"按钮 (Topic 卡片跳过此阶段) -->
  <div v-if="actions.showAnswer && !isTopicCard" class="card__action fn__flex">
    <button
      class="b3-button b3-button--cancel"
      disabled="disabled"
      style="width: 25%; min-width: 86px; display: flex"
      @click="emit('reveal')"
    >
      <svg><use xlink:href="#iconLeft"></use></svg>
      (p / q)
    </button>
    <span class="fn__space"></span>
    <button
      data-type="-3"
      aria-label="0 / x"
      class="b3-button b3-button--white b3-tooltips__n b3-tooltips"
      @click="emit('skip')"
    >
      <div class="card__icon">💤</div>
      {{ t('skip', '跳过') }} (0)
    </button>
    <span class="fn__space"></span>
    <button
      data-type="-1"
      aria-label="Space/Enter"
      class="b3-button b3-tooltips__n b3-tooltips"
      @click="emit('reveal')"
    >
      <div class="card__icon">👀</div>
      {{ t('showAnswer', '显示答案') }}
    </button>
  </div>

  <!-- 阶段2: 答案显示 - showAnswer 为 false 时显示评分按钮 -->
  <div v-else class="card__action fn__flex">
    <!-- 左列: 后退 + 跳过菜单 (Split Button) -->
    <div>
      <button
        class="b3-button b3-button--cancel"
        disabled="disabled"
        style="display: flex; margin-bottom: 8px; height: 28px; padding: 0;"
        @click="emit('back')"
      >
        <svg><use xlink:href="#iconLeft"></use></svg>
        (p / q)
      </button>
      <SkipMenuButton
        :i18n="i18n"
        :queue-size="remainingSize"
        @skip="emit('skip')"
        @insert="handleInsert"
        @schedule="handleSchedule"
      />
    </div>

    <!-- 评分按钮列 (根据卡片类型动态显示) -->
    <template v-if="isTopicCard">
      <!-- Topic/Concept 模式: 只显示【下一张】按钮 -->
      <div>
        <span></span>
        <button
          data-type="3"
          aria-label="Space"
          class="b3-button b3-button--info"
          @click="emit('grade', 3)"
        >
          <div class="card__icon">📖</div>
          {{ t('nextCard', '下一张') }} ({{ t('space', '空格') }})
        </button>
      </div>
    </template>
    <template v-else>
      <!-- Item 模式: 显示完整评分按钮 -->
      <div v-for="g in actions.grades" :key="g.value">
        <span>{{ g.nextDue || '' }}</span>
        <button
          :data-type="g.value"
          :aria-label="`${g.value} / ${g.kb}`"
          class="b3-button"
          :class="getButtonVariant(g.value)"
          @click="emit('grade', g.value)"
        >
          <div class="card__icon">{{ g.emoji }}</div>
          {{ g.label }} ({{ g.kb }})
        </button>
      </div>
    </template>
  </div>
  
  <!-- 插入位置对话框 -->
  <teleport to="body">
    <div v-if="showInsertDialog" class="b3-dialog b3-dialog--open siyuanmemo-dialog" @mousedown.self="handleDialogMouseDown">
      <div class="b3-dialog__scrim" @click="closeInsertDialog"></div>
      <div class="b3-dialog__container" style="max-width: 400px;">
        <InsertPositionDialog
          :queue-size="remainingSize"
          :i18n="i18n"
          @confirm="onInsertConfirm"
          @cancel="closeInsertDialog"
        />
      </div>
    </div>
  </teleport>
  
  <!-- 安排日期对话框 -->
  <teleport to="body">
    <div v-if="showScheduleDialog" class="b3-dialog b3-dialog--open siyuanmemo-dialog" @mousedown.self="handleDialogMouseDown">
      <div class="b3-dialog__scrim" @click="closeScheduleDialog"></div>
      <div class="b3-dialog__container" style="max-width: 540px;">
        <ScheduleDateDialog
          :card-type="cardType"
          :i18n="i18n"
          @confirm="onScheduleConfirm"
          @cancel="closeScheduleDialog"
        />
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ReviewUIState } from './types';
import SkipMenuButton from './components/SkipMenuButton.vue';
import InsertPositionDialog from './dialogs/InsertPositionDialog.vue';
import ScheduleDateDialog, { type ScheduleOptions } from './dialogs/ScheduleDateDialog.vue';

const props = defineProps<{
  actions: ReviewUIState['actions'];
  i18n?: Record<string, string>;
  meta?: ReviewUIState['meta'];
  queue?: any; // 队列实例
  plugin?: any; // 🆕 插件实例，用于访问服务
}>();

const emit = defineEmits<{
  (e: 'reveal'): void;
  (e: 'grade', rating: number): void;
  (e: 'skip'): void;
  (e: 'back'): void;
  (e: 'command', cmdId: string): void;
  (e: 'openMenu', menu: any[], ev: MouseEvent): void;
}>();

// 卡片类型检测 - Topic 和 Concept 卡片都使用"下一张"模式
const isTopicCard = computed(() => {
  const card = props.actions.cardMeta;
  const result = card?.type === 'topic' || card?.cardType === 'topic' 
    || card?.type === 'concept' || card?.cardType === 'concept';
  console.log('[SiYuanMemo][ReviewActions] isTopicCard computed:', {
    cardMeta: card,
    type: card?.type,
    cardType: card?.cardType,
    isTopicCard: result,
  });
  return result;
});

// 卡片类型（用于对话框）- Concept 卡片也视为 topic 类型
const cardType = computed<'item' | 'topic'>(() => {
  return isTopicCard.value ? 'topic' : 'item';
});

// 剩余卡片数量
const remainingSize = computed(() => {
  return props.meta?.remainingSize || 0;
});

// 对话框状态
const showInsertDialog = ref(false);
const showScheduleDialog = ref(false);

// 防止鼠标拖动关闭对话框
function handleDialogMouseDown(ev: MouseEvent) {
  // 只在点击遮罩层时关闭，拖动不关闭
  ev.stopPropagation();
}

// 调试：监控 grades 变化
watch(() => props.actions.grades, (grades) => {
  console.log('[SiYuanMemo][ReviewActions] grades changed:', grades);
}, { immediate: true, deep: true });

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getButtonVariant(value: number): string {
  const variants = {
    1: 'b3-button--error',
    2: 'b3-button--warning',
    3: 'b3-button--info',
    4: 'b3-button--success',
  };
  return variants[value as keyof typeof variants] || 'b3-button--info';
}

// 插入位置逻辑
function handleInsert() {
  console.log('[SiYuanMemo][ReviewActions] handleInsert called', {
    remainingSize: remainingSize.value,
    metaRemainingSize: props.meta?.remainingSize,
    hasQueue: !!props.queue,
    queueType: props.queue?.constructor?.name,
  });
  
  // 修复：插入功能应该在有队列的情况下就可以使用
  // remainingSize 为 0 可能是因为 Adapter 没有正确设置这个字段
  // 我们应该尝试从队列获取实际的剩余数量
  if (!props.queue) {
    console.warn('[SiYuanMemo][ReviewActions] No queue available');
    return;
  }
  
  // 尝试从队列获取剩余数量
  let actualRemainingSize = remainingSize.value;
  if (actualRemainingSize === 0 && typeof props.queue.getRemainingSize === 'function') {
    actualRemainingSize = props.queue.getRemainingSize();
    console.log('[SiYuanMemo][ReviewActions] Got remaining size from queue:', actualRemainingSize);
  }
  
  if (actualRemainingSize === 0) {
    console.warn('[SiYuanMemo][ReviewActions] Queue is empty, cannot insert');
    return;
  }
  
  showInsertDialog.value = true;
}

function closeInsertDialog() {
  showInsertDialog.value = false;
}

async function onInsertConfirm(position: number) {
  try {
    // 🔧 修复：使用 Adapter 提供的字段名（大写）
    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      console.error('[SiYuanMemo][ReviewActions] No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }
    
    // 详细的调试日志
    console.log('[SiYuanMemo][ReviewActions] onInsertConfirm - Queue inspection:', {
      hasQueue: !!props.queue,
      queueType: props.queue?.constructor?.name,
      queueKeys: props.queue ? Object.keys(props.queue) : [],
      hasInsertAt: typeof props.queue?.insertAt,
      insertAtType: props.queue?.insertAt ? typeof props.queue.insertAt : 'undefined',
      queueProto: props.queue ? Object.getPrototypeOf(props.queue) : null,
      protoKeys: props.queue ? Object.keys(Object.getPrototypeOf(props.queue)) : [],
    });
    
    if (!props.queue || typeof props.queue.insertAt !== 'function') {
      console.error('[SiYuanMemo][ReviewActions] Queue does not support insertAt', {
        queue: props.queue,
        hasInsertAt: !!props.queue?.insertAt,
        insertAtValue: props.queue?.insertAt,
      });
      return;
    }
    
    await props.queue.insertAt(cardId, position);
    console.log(`[SiYuanMemo][ReviewActions] Card ${cardId} inserted at position ${position}`);
    
    closeInsertDialog();
    
    // 继续复习下一张
    emit('skip');
  } catch (error) {
    console.error('[SiYuanMemo][ReviewActions] Failed to insert card:', error);
    // TODO: 显示错误提示
  }
}

// 安排日期逻辑
function handleSchedule() {
  showScheduleDialog.value = true;
}

function closeScheduleDialog() {
  showScheduleDialog.value = false;
}

async function onScheduleConfirm(options: ScheduleOptions) {
  try {
    // 🔧 修复：使用 Adapter 提供的字段名（大写）
    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      console.error('[SiYuanMemo][ReviewActions] No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }
    
    // 🔧 修复：通过 props.plugin 获取服务，而不是全局变量
    if (!props.plugin) {
      console.error('[SiYuanMemo][ReviewActions] Plugin instance not provided');
      return;
    }
    
    // 通过 ApplicationContext 获取服务
    const context = props.plugin.getContext();
    const manager = context.getUnifiedDataSourceManager();
    const schedulerRouter = context.getScheduler();
    
    if (!manager) {
      console.error('[SiYuanMemo][ReviewActions] Manager not available');
      return;
    }
    
    // 1. 计算目标日期
    let targetDate: number;
    if (options.dueDate) {
      targetDate = new Date(options.dueDate).getTime();
    } else if (options.days) {
      targetDate = Date.now() + options.days * 24 * 60 * 60 * 1000;
    } else {
      targetDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 默认 7 天
    }
    
    // 2. 获取卡片
    const card = await manager.getCard(cardId);
    
    // 3. 根据模式处理
    if (options.mode === 'rating') {
      // 评分模式：应用调度器 + 覆盖日期
      const rating = options.rating || 3;
      
      if (schedulerRouter) {
        // 调用调度器
        const updatedCard = await schedulerRouter.route(card, rating);
        
        // 手动覆盖到期日期
        updatedCard.due = targetDate;
        await manager.updateCard(updatedCard);
        
        console.log(`[SiYuanMemo][ReviewActions] Card ${cardId} scheduled with rating ${rating} to ${new Date(targetDate)}`);
      } else {
        console.warn('[SiYuanMemo][ReviewActions] Scheduler router not available, using direct mode');
        card.due = targetDate;
        await manager.updateCard(card);
      }
    } else {
      // 仅修改日期：直接更新
      card.due = targetDate;
      await manager.updateCard(card);
      
      console.log(`[SiYuanMemo][ReviewActions] Card ${cardId} due date updated to ${new Date(targetDate)}`);
    }
    
    // 4. 从队列移除
    if (props.queue && typeof props.queue.removeCard === 'function') {
      await props.queue.removeCard(cardId);
    }
    
    closeScheduleDialog();
    
    // 5. 继续下一张
    emit('skip');
    
  } catch (error) {
    console.error('[SiYuanMemo][ReviewActions] Failed to schedule date:', error);
    // TODO: 显示错误提示
  }
}
</script>

<style scoped>
.card__action {
  padding: 8px;
  user-select: none;
  flex-shrink: 0; /* 防止被压缩 */
  background: var(--b3-theme-background); /* 确保背景不透明 */
}

.card__action > div {
  flex: 1;
  margin-right: 8px;

  &:last-child {
    margin-right: 0;
  }

  > span {
    display: flex;
    color: var(--b3-theme-on-surface);
    text-align: center;
    font-size: 12px;
    margin-bottom: 8px;
    height: 28px;
    line-height: 14px;
    justify-content: center;
    align-items: center;
  }
}

.card__icon {
  font-size: 32px;
  display: block;
  line-height: 46px;
  margin-bottom: 4px;
}

/* 对话框样式 - 只影响插件自己的对话框 */
.siyuanmemo-dialog.b3-dialog {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.siyuanmemo-dialog .b3-dialog__scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.32);
}

.siyuanmemo-dialog .b3-dialog__container {
  position: relative;
  background-color: var(--b3-theme-background);
  border-radius: var(--b3-border-radius);
  box-shadow: var(--b3-dialog-shadow);
  max-height: 80vh;
  overflow: auto;
}
</style>
