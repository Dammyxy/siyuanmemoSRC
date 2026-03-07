/**
 * CSS class optimizer for review content.
 * Avoids redundant hide/show class writes on the review Protyle host.
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

export const REVIEW_HIDE_CLASSES = [
  'siyuanmemo-review-card__block--hidemark',
  'siyuanmemo-review-card__block--hideli',
  'siyuanmemo-review-card__block--hidesb',
  'siyuanmemo-review-card__block--hideh',
] as const;

export const LEGACY_NATIVE_HIDE_CLASSES = [
  'card__block--hidemark',
  'card__block--hideli',
  'card__block--hidesb',
  'card__block--hideh',
] as const;

const ALL_HIDE_CLASSES = [
  ...REVIEW_HIDE_CLASSES,
  ...LEGACY_NATIVE_HIDE_CLASSES,
] as const;

export function useCssClassOptimizer(options: CssClassOptimizerOptions = {}) {
  const { debugMode = false } = options;
  const logger = createLogger('useCssClassOptimizer');

  let lastState: AnswerVisibilityState | null = null;
  let stats: CssClassOptimizerStats = {
    totalCalls: 0,
    skippedCalls: 0,
    appliedCalls: 0,
  };

  function applyAnswerVisibility(element: HTMLElement, state: AnswerVisibilityState): void {
    stats.totalCalls++;

    if (
      lastState
      && lastState.hasHidden === state.hasHidden
      && lastState.showAnswer === state.showAnswer
    ) {
      stats.skippedCalls++;
      if (debugMode) {
        logger.debug('[useCssClassOptimizer] Skipped (no state change)', state);
      }
      return;
    }

    stats.appliedCalls++;
    lastState = { ...state };

    if (debugMode) {
      logger.debug('[useCssClassOptimizer] Applying CSS classes', state);
    }

    const { hasHidden, showAnswer } = state;
    if (hasHidden && showAnswer) {
      element.classList.remove(...LEGACY_NATIVE_HIDE_CLASSES);
      element.classList.add(...REVIEW_HIDE_CLASSES);
      return;
    }

    element.classList.remove(...ALL_HIDE_CLASSES);
  }

  function resetState(): void {
    lastState = null;
    if (debugMode) {
      logger.debug('[useCssClassOptimizer] State reset');
    }
  }

  function getStats(): CssClassOptimizerStats {
    return { ...stats };
  }

  return {
    applyAnswerVisibility,
    resetState,
    getStats,
  };
}
