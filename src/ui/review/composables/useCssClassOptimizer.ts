/**
 * useCssClassOptimizer - CSS 类应用优化
 * 
 * 避免重复应用 CSS 类，减少 DOM 操作。
 * 
 * 职责：
 * - 跟踪上次应用的状态
 * - 只在状态改变时应用 CSS 类
 * - 提供统一的 CSS 类应用接口
 * 
 * 性能优化：
 * - 避免重复的 DOM 操作
 * - 减少不必要的重绘
 * 
 * @see .kiro/specs/performance/performance-optimization-plan.md - Phase 3
 */

import { ref } from 'vue';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useCssClassOptimizer');

/**
 * CSS 类应用状态
 */
interface CssClassState {
  hasHidden: boolean;
  showAnswer: boolean;
}

/**
 * CSS 类优化器 Composable
 * 
 * @param options - 配置选项
 * @returns CSS 类管理方法
 * 
 * @example
 * ```typescript
 * const { applyAnswerVisibility } = useCssClassOptimizer();
 * 
 * // 应用 CSS 类（只在状态改变时才会真正应用）
 * applyAnswerVisibility(element, {
 *   hasHidden: true,
 *   showAnswer: false,
 * });
 * ```
 */
export function useCssClassOptimizer(options?: {
  debugMode?: boolean;
}) {
  const debugMode = options?.debugMode ?? false;
  
  // 上次应用的状态
  const lastAppliedState = ref<CssClassState | null>(null);
  
  // 应用次数统计
  const applyCount = ref(0);
  const skipCount = ref(0);
  
  /**
   * 应用答案显示/隐藏的 CSS 类
   * 
   * 只在状态改变时才会真正应用，避免重复的 DOM 操作。
   * 
   * @param element - DOM 元素
   * @param state - CSS 类状态
   */
  function applyAnswerVisibility(
    element: HTMLElement | null,
    state: CssClassState
  ): void {
    if (!element) {
      if (debugMode) {
        logger.warn('[useCssClassOptimizer] Element is null, skipping');
      }
      return;
    }
    
    // 检查状态是否改变
    if (lastAppliedState.value &&
        lastAppliedState.value.hasHidden === state.hasHidden &&
        lastAppliedState.value.showAnswer === state.showAnswer) {
      // 状态未改变，跳过
      skipCount.value++;
      
      if (debugMode) {
        logger.info('[useCssClassOptimizer] State unchanged, skipping:', {
          state,
          skipCount: skipCount.value,
        });
      }
      
      return;
    }
    
    // 状态改变，应用 CSS 类
    applyCount.value++;
    
    if (debugMode) {
      logger.info('[useCssClassOptimizer] Applying CSS classes:', {
        state,
        applyCount: applyCount.value,
      });
    }
    
    const hideClasses = [
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh',
    ];
    
    if (!state.hasHidden) {
      // 没有隐藏内容，移除所有隐藏类
      element.classList.remove(...hideClasses);
    } else if (state.showAnswer) {
      // 显示"显示答案"按钮 → 隐藏答案
      element.classList.add(...hideClasses);
    } else {
      // 不显示"显示答案"按钮 → 显示答案
      element.classList.remove(...hideClasses);
    }
    
    // 记录状态
    lastAppliedState.value = { ...state };
  }
  
  /**
   * 重置状态
   * 
   * 清除上次应用的状态，下次调用会强制应用。
   */
  function resetState(): void {
    lastAppliedState.value = null;
    
    if (debugMode) {
      logger.info('[useCssClassOptimizer] State reset');
    }
  }
  
  /**
   * 获取统计信息
   * 
   * @returns 统计信息
   */
  function getStats() {
    return {
      applyCount: applyCount.value,
      skipCount: skipCount.value,
      skipRate: applyCount.value > 0
        ? (skipCount.value / (applyCount.value + skipCount.value) * 100).toFixed(2) + '%'
        : '0%',
    };
  }
  
  return {
    applyAnswerVisibility,
    resetState,
    getStats,
  };
}
