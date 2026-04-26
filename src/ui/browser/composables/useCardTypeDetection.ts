import { ref, computed, onMounted } from 'vue';
import type { BrowserCard } from '../types';
import { batchDetectCardTypes } from '../browserService';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useCardTypeDetection');

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
export function useCardTypeDetection(
  cards: () => BrowserCard[],
  deps: { siyuanApi?: () => BrowserSiyuanPort | null | undefined } = {},
) {
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
          logger.warn('[CardTypeDetection] Storage version mismatch, clearing...');
          clearHistory();
          return;
        }

        detectionHistory.value = new Set(data.blockIds || []);
        lastDetectionTime.value = data.timestamp || 0;
        logger.info('[CardTypeDetection] ✅ Loaded history:', detectionHistory.value.size, 'cards');
      }
    } catch (err) {
      logger.error('[CardTypeDetection] Failed to load history:', err);
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
      logger.error('[CardTypeDetection] Failed to save history:', err);
    }
  }

  /**
   * 清除检测历史（强制重新检测）
   */
  function clearHistory(): void {
    detectionHistory.value.clear();
    lastDetectionTime.value = 0;
    localStorage.removeItem(STORAGE_KEY);
    logger.info('[CardTypeDetection] 🗑️ History cleared');
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
    // ✅ 强制重置状态（防止上次异常导致的卡住）
    if (isDetecting.value) {
      logger.warn('[CardTypeDetection] ⚠️ isDetecting was true, forcing reset');
      isDetecting.value = false;
    }

    const unidentified = getUnidentifiedCards();
    if (unidentified.length === 0) {
      logger.info('[CardTypeDetection] ✅ No unidentified cards found');
      return;
    }

    logger.info(`[CardTypeDetection] 🔍 Detecting ${unidentified.length} unidentified cards...`);
    isDetecting.value = true;

    const startTime = Date.now();
    const MIN_DISPLAY_TIME = 500; // 最小显示 500ms，避免闪烁

    try {
      // ✅ 创建超时 Promise（30秒超时保护）
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Detection timeout after 30s')), 30000);
      });

      // 执行检测，设置超时
      const result = await Promise.race([
        batchDetectCardTypes(unidentified, {
          siyuanApi: deps.siyuanApi?.() || undefined,
        }),
        timeoutPromise,
      ]);

      stats.value = result;
      logger.info('[CardTypeDetection] ✅ Detection complete:', result);

      // 更新检测历史
      for (const card of unidentified) {
        detectionHistory.value.add(card.blockId);
      }
      saveHistory();

    } catch (err) {
      logger.error('[CardTypeDetection] ❌ Detection failed:', err);

      // ✅ 异常时也要更新历史（标记这些卡片为已检测，避免重复失败）
      for (const card of unidentified) {
        detectionHistory.value.add(card.blockId);
      }
      saveHistory();

      stats.value = { detected: 0, updated: 0, failed: unidentified.length };
    } finally {
      // ✅ 延迟重置状态，确保 UI 有时间渲染
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsed);

      if (remainingTime > 0) {
        logger.info(`[CardTypeDetection] ⏳ Waiting ${remainingTime}ms before resetting state...`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      isDetecting.value = false;
      logger.info('[CardTypeDetection] ✅ State reset complete');
    }
  }

  // ========== 生命周期 ==========

  onMounted(() => {
    loadHistory();

    // ✅ 强制重置状态（防止从上次继承）
    if (isDetecting.value) {
      logger.warn('[CardTypeDetection] ⚠️ Detected stale isDetecting state on mount, resetting...');
      isDetecting.value = false;
    }
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
