import { ref, computed, onMounted } from 'vue';
import type { BrowserCard } from '../types';
import { batchDetectCardTypes } from '../browserService';

/**
 * 卡片类型检测 Composable
 *
 * 功能：
 * - 自动检测未识别的卡片
 * - 智能增量检测（只检测新卡）
 * - 使用 LocalStorage 记录检测历史
 * - 防抖处理，避免并发检测
 *
 * @param cards 卡片列表的 getter 函数（响应式）
 * @returns Composable 接口
 */
export function useCardTypeDetection(cards: () => BrowserCard[]) {
  // ========== 状态 ==========
  const isDetecting = ref(false);
  const detectionHistory = ref<Set<string>>(new Set());
  const lastDetectionTime = ref<number>(0);
  const stats = ref<{ detected: number; updated: number; failed: number }>({
    detected: 0,
    updated: 0,
    failed: 0,
  });

  // LocalStorage 配置
  const STORAGE_KEY = 'fsrs-card-type-detection-history';
  const STORAGE_VERSION = 1;

  // ========== LocalStorage 管理 ==========

  /**
   * 从 LocalStorage 加载检测历史
   */
  function loadHistory(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);

        // 版本检查
        if (data.version !== STORAGE_VERSION) {
          console.warn('[CardTypeDetection] Storage version mismatch, clearing...');
          clearHistory();
          return;
        }

        detectionHistory.value = new Set(data.blockIds || []);
        lastDetectionTime.value = data.timestamp || 0;
        console.log('[CardTypeDetection] ✅ Loaded history:', detectionHistory.value.size, 'cards');
      }
    } catch (err) {
      console.error('[CardTypeDetection] Failed to load history:', err);
      clearHistory();
    }
  }

  /**
   * 保存检测历史到 LocalStorage
   */
  function saveHistory(): void {
    try {
      const data = {
        version: STORAGE_VERSION,
        blockIds: Array.from(detectionHistory.value),
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[CardTypeDetection] Failed to save history:', err);
    }
  }

  /**
   * 清除检测历史（强制重新检测）
   */
  function clearHistory(): void {
    detectionHistory.value.clear();
    lastDetectionTime.value = 0;
    localStorage.removeItem(STORAGE_KEY);
    console.log('[CardTypeDetection] 🗑️ History cleared');
  }

  // ========== 核心逻辑 ==========

  /**
   * 获取未识别的卡片（智能增量）
   *
   * 筛选条件：
   * 1. 没有类型 (cardType === undefined)
   * 2. 不在检测历史中
   */
  function getUnidentifiedCards(): BrowserCard[] {
    const currentCards = cards();
    return currentCards.filter(c =>
      !c.cardType && !detectionHistory.value.has(c.blockId)
    );
  }

  /**
   * 执行类型检测
   */
  async function detect(): Promise<void> {
    // 防抖：已在检测中
    if (isDetecting.value) {
      console.log('[CardTypeDetection] ⏸️ Detection already in progress, skipping...');
      return;
    }

    const unidentified = getUnidentifiedCards();
    if (unidentified.length === 0) {
      console.log('[CardTypeDetection] ✅ No unidentified cards found');
      return;
    }

    console.log(`[CardTypeDetection] 🔍 Detecting ${unidentified.length} unidentified cards...`);
    isDetecting.value = true;

    try {
      // 调用 Service 层
      const result = await batchDetectCardTypes(unidentified);

      stats.value = result;
      console.log('[CardTypeDetection] ✅ Detection complete:', result);

      // 更新检测历史
      for (const card of unidentified) {
        detectionHistory.value.add(card.blockId);
      }
      saveHistory();

    } catch (err) {
      console.error('[CardTypeDetection] ❌ Detection failed:', err);
      stats.value = { detected: 0, updated: 0, failed: unidentified.length };
    } finally {
      isDetecting.value = false;
    }
  }

  // ========== 生命周期 ==========

  onMounted(() => {
    loadHistory();
  });

  // ========== 返回接口 ==========

  return {
    // 状态（只读）
    isDetecting: computed(() => isDetecting.value),
    stats: computed(() => stats.value),
    unidentifiedCount: computed(() => getUnidentifiedCards().length),
    historySize: computed(() => detectionHistory.value.size),

    // 方法
    detect,
    clearHistory,
    getUnidentifiedCards,
  };
}
