/**
 * CSS 类优化器 Composable
 * 避免重复应用相同的 CSS 类，提升性能
 */

import { createLogger } from '@/utils/logger';

interface AnswerVisibilityState {
  hasHidden: boolean;
  showAnswer: boolean;
}

interface CssClassOptimizerOptions {
  debugMode?: boolean;
}

interface CssClassOptimizerStats {
  totalCalls: number;
  skippedCalls: number;
  appliedCalls: number;
}

export function useCssClassOptimizer(options: CssClassOptimizerOptions = {}) {
  const { debugMode = false } = options;
  const logger = createLogger('useCssClassOptimizer');
  
  let lastState: AnswerVisibilityState | null = null;
  let stats: CssClassOptimizerStats = {
    totalCalls: 0,
    skippedCalls: 0,
    appliedCalls: 0,
  };

  /**
   * 应用答案显示/隐藏的 CSS 类
   * 只在状态改变时才真正应用，避免不必要的 DOM 操作
   */
  function applyAnswerVisibility(element: HTMLElement, state: AnswerVisibilityState): void {
    stats.totalCalls++;

    // 检查状态是否改变
    if (lastState && 
        lastState.hasHidden === state.hasHidden && 
        lastState.showAnswer === state.showAnswer) {
      stats.skippedCalls++;
      if (debugMode) {
        logger.debug('[useCssClassOptimizer] Skipped (no state change)', state);
      }
      return;
    }

    // 状态改变，应用 CSS 类
    stats.appliedCalls++;
    lastState = { ...state };

    if (debugMode) {
      logger.debug('[useCssClassOptimizer] Applying CSS classes', state);
    }

    const { hasHidden, showAnswer } = state;

    if (hasHidden && showAnswer) {
      // 有隐藏内容且未显示答案：添加隐藏类
      element.classList.add(
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hidesb',
        'card__block--hideh'
      );
    } else {
      // 移除隐藏类
      element.classList.remove(
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hidesb',
        'card__block--hideh'
      );
    }
  }

  /**
   * 重置状态（例如切换卡片时）
   */
  function resetState(): void {
    lastState = null;
    if (debugMode) {
      logger.debug('[useCssClassOptimizer] State reset');
    }
  }

  /**
   * 获取统计信息
   */
  function getStats(): CssClassOptimizerStats {
    return { ...stats };
  }

  return {
    applyAnswerVisibility,
    resetState,
    getStats,
  };
}
