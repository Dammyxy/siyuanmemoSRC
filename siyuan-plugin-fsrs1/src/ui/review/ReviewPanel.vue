<template>
  <div class="fsrs-review-panel">
    <!-- 头部进度信息 -->
    <div class="review-header">
      <div class="progress-info">
        <span class="progress-text">{{ currentIndex + 1 }} / {{ totalCards }}</span>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>
      <div class="session-stats" v-if="showStats">
        <span class="stat-item stat-new">新: {{ stats.newCount }}</span>
        <span class="stat-item stat-review">复: {{ stats.reviewCount }}</span>
        <span class="stat-item stat-again">错: {{ stats.againCount }}</span>
      </div>
      <button class="close-btn" @click="handleClose">×</button>
    </div>

    <!-- 卡片内容区域 -->
    <div class="card-content" v-if="currentCard">
      <!-- 问题面 -->
      <div class="card-question" v-show="!showAnswer">
        <div class="block-content" v-html="questionContent"></div>
      </div>

      <!-- 答案面 -->
      <div class="card-answer" v-show="showAnswer">
        <div class="block-content" v-html="answerContent"></div>
        
        <!-- 卡片信息 -->
        <div class="card-info" v-if="showAnswer">
          <span>间隔: {{ currentCard.scheduledDays }}天</span>
          <span>复习: {{ currentCard.reps }}次</span>
          <span v-if="currentCard.isLeech" class="leech-badge">⚠️ 难点</span>
        </div>
      </div>

      <!-- 难点提醒 -->
      <div class="leech-alert" v-if="showLeechAlert">
        <div class="alert-content">
          <span class="alert-icon">⚠️</span>
          <span>这张卡片遗忘次数较多，建议重新整理内容</span>
        </div>
      </div>
    </div>

    <!-- 无卡片提示 -->
    <div class="empty-state" v-else>
      <div class="empty-icon">🎉</div>
      <div class="empty-text">今日复习已完成！</div>
      <div class="empty-stats">
        <p>新学: {{ stats.newCount }} 张</p>
        <p>复习: {{ stats.reviewCount }} 张</p>
      </div>
    </div>

    <!-- 操作按钮区域 -->
    <div class="action-bar" v-if="currentCard">
      <!-- 显示答案按钮 -->
      <div class="show-answer-bar" v-if="!showAnswer">
        <button class="btn-show-answer" @click="revealAnswer">
          显示答案
          <span class="timer" v-if="showTimer">({{ timerText }})</span>
        </button>
      </div>

      <!-- 评分按钮 -->
      <div class="rating-bar" v-else>
        <button 
          v-for="rating in ratings" 
          :key="rating.value"
          class="btn-rating"
          :class="'btn-' + rating.key"
          @click="handleRating(rating.value)"
        >
          <span class="rating-label">{{ rating.label }}</span>
          <span class="rating-interval">{{ getIntervalText(rating.value) }}</span>
        </button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <button class="tool-btn" @click="handleEdit" title="编辑卡片数据">
          ✏️
        </button>
        <button class="tool-btn" @click="handleSkip" title="跳过并留言">
          ⏭️
        </button>
        <button class="tool-btn" @click="toggleDrill" :class="{ active: isDrillMode }" title="机械练习模式">
          🔄
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { FSRSCard, Rating } from '@/types';

// Props
const props = defineProps<{
  cards: FSRSCard[];
  showStats?: boolean;
  showTimer?: boolean;
  onClose?: () => void;
  onRating?: (card: FSRSCard, rating: Rating, isDrill: boolean) => void;
  onEdit?: (card: FSRSCard) => void;
  onSkip?: (card: FSRSCard) => void;
  getPreview?: (card: FSRSCard) => Map<Rating, FSRSCard>;
  getBlockContent?: (blockId: string) => Promise<string>;
}>();

// State
const currentIndex = ref(0);
const showAnswer = ref(false);
const isDrillMode = ref(false);
const showLeechAlert = ref(false);
const questionContent = ref('');
const answerContent = ref('');
const timerStart = ref(0);
const timerText = ref('0s');

// 预览结果缓存
const previewResults = ref<Map<Rating, FSRSCard>>(new Map());

// 统计
const stats = ref({
  newCount: 0,
  reviewCount: 0,
  againCount: 0,
});

// 评分选项
const ratings = [
  { key: 'again', value: 1 as Rating, label: '忘记' },
  { key: 'hard', value: 2 as Rating, label: '困难' },
  { key: 'good', value: 3 as Rating, label: '一般' },
  { key: 'easy', value: 4 as Rating, label: '简单' },
];

// Computed
const totalCards = computed(() => props.cards.length);
const currentCard = computed(() => props.cards[currentIndex.value]);
const progressPercent = computed(() => 
  totalCards.value > 0 ? (currentIndex.value / totalCards.value) * 100 : 0
);

// 获取间隔文本
function getIntervalText(rating: Rating): string {
  const preview = previewResults.value.get(rating);
  if (!preview) return '';
  
  const days = preview.scheduledDays;
  if (days === 0) return '< 1天';
  if (days === 1) return '1天';
  if (days < 30) return `${days}天`;
  if (days < 365) return `${Math.round(days / 30)}月`;
  return `${(days / 365).toFixed(1)}年`;
}

// 加载卡片内容
async function loadCardContent() {
  if (!currentCard.value || !props.getBlockContent) return;
  
  try {
    // TODO: 实际从思源 API 获取块内容
    questionContent.value = `<p>加载中... (Block: ${currentCard.value.blockId})</p>`;
    answerContent.value = questionContent.value;
    
    const content = await props.getBlockContent(currentCard.value.blockId);
    questionContent.value = content;
    answerContent.value = content;
  } catch (err) {
    questionContent.value = `<p class="error">加载失败</p>`;
  }
}

// 加载预览
function loadPreview() {
  if (!currentCard.value || !props.getPreview) return;
  previewResults.value = props.getPreview(currentCard.value);
}

// 显示答案
function revealAnswer() {
  showAnswer.value = true;
  
  // 检查是否为难点
  if (currentCard.value?.isLeech) {
    showLeechAlert.value = true;
    setTimeout(() => {
      showLeechAlert.value = false;
    }, 3000);
  }
}

// 处理评分
function handleRating(rating: Rating) {
  if (!currentCard.value) return;

  // 更新统计
  if (currentCard.value.state === 0) {
    stats.value.newCount++;
  } else {
    stats.value.reviewCount++;
  }
  if (rating === 1) {
    stats.value.againCount++;
  }

  // 回调
  props.onRating?.(currentCard.value, rating, isDrillMode.value);

  // 下一张
  nextCard();
}

// 下一张卡片
function nextCard() {
  showAnswer.value = false;
  showLeechAlert.value = false;
  timerStart.value = Date.now();

  if (currentIndex.value < totalCards.value - 1) {
    currentIndex.value++;
    loadCardContent();
    loadPreview();
  } else {
    // 复习完成
    currentIndex.value = totalCards.value;
  }
}

// 处理编辑
function handleEdit() {
  if (currentCard.value) {
    props.onEdit?.(currentCard.value);
  }
}

// 处理跳过
function handleSkip() {
  if (currentCard.value) {
    props.onSkip?.(currentCard.value);
    nextCard();
  }
}

// 切换机械练习模式
function toggleDrill() {
  isDrillMode.value = !isDrillMode.value;
}

// 关闭
function handleClose() {
  props.onClose?.();
}

// 计时器
let timerInterval: number;
function startTimer() {
  timerStart.value = Date.now();
  timerInterval = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - timerStart.value) / 1000);
    timerText.value = `${elapsed}s`;
  }, 1000);
}

// 监听卡片变化
watch(() => currentCard.value, () => {
  loadCardContent();
  loadPreview();
}, { immediate: true });

// 生命周期
onMounted(() => {
  startTimer();
  loadCardContent();
  loadPreview();
});

onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});
</script>

<style lang="scss">
.fsrs-review-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

.review-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--b3-border-color);

  .progress-info {
    flex: 1;
    
    .progress-text {
      font-size: 14px;
      color: var(--b3-theme-on-surface);
    }
    
    .progress-bar {
      height: 4px;
      background: var(--b3-theme-surface);
      border-radius: 2px;
      margin-top: 4px;
      
      .progress-fill {
        height: 100%;
        background: var(--b3-theme-primary);
        border-radius: 2px;
        transition: width 0.3s ease;
      }
    }
  }

  .session-stats {
    display: flex;
    gap: 12px;
    font-size: 12px;

    .stat-new { color: #4CAF50; }
    .stat-review { color: #2196F3; }
    .stat-again { color: #f44336; }
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    font-size: 18px;
    cursor: pointer;
    border-radius: 4px;
    color: var(--b3-theme-on-surface);

    &:hover {
      background: var(--b3-theme-surface);
    }
  }
}

.card-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;

  .block-content {
    font-size: 16px;
    line-height: 1.8;
  }

  .card-info {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--b3-border-color);
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    display: flex;
    gap: 16px;

    .leech-badge {
      color: #ff9800;
    }
  }
}

.leech-alert {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff3e0;
  color: #e65100;
  padding: 8px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-text {
    font-size: 20px;
    font-weight: 500;
    margin-bottom: 16px;
  }

  .empty-stats {
    color: var(--b3-theme-on-surface-light);
  }
}

.action-bar {
  padding: 16px;
  border-top: 1px solid var(--b3-border-color);

  .show-answer-bar {
    display: flex;
    justify-content: center;

    .btn-show-answer {
      padding: 12px 48px;
      font-size: 16px;
      background: var(--b3-theme-primary);
      color: var(--b3-theme-on-primary);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        filter: brightness(1.1);
      }

      .timer {
        opacity: 0.8;
        margin-left: 8px;
      }
    }
  }

  .rating-bar {
    display: flex;
    gap: 8px;
    justify-content: center;

    .btn-rating {
      flex: 1;
      max-width: 120px;
      padding: 12px 8px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      transition: transform 0.1s;

      &:hover {
        transform: translateY(-2px);
      }

      .rating-label {
        font-size: 14px;
        font-weight: 500;
      }

      .rating-interval {
        font-size: 12px;
        opacity: 0.8;
      }

      &.btn-again {
        background: linear-gradient(135deg, #ffebee, #ffcdd2);
        color: #c62828;
      }
      &.btn-hard {
        background: linear-gradient(135deg, #fff3e0, #ffe0b2);
        color: #e65100;
      }
      &.btn-good {
        background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
        color: #2e7d32;
      }
      &.btn-easy {
        background: linear-gradient(135deg, #e3f2fd, #bbdefb);
        color: #1565c0;
      }
    }
  }

  .toolbar {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;

    .tool-btn {
      width: 36px;
      height: 36px;
      border: 1px solid var(--b3-border-color);
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;

      &:hover {
        background: var(--b3-theme-surface);
      }

      &.active {
        background: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary);
      }
    }
  }
}
</style>
