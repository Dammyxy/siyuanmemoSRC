export type ReviewTruthFlushReason = 'review-exit' | 'queue-complete' | 'manual';

export type ReviewTruthFlushClientLike = {
  requestReviewTruthFlush?: (reason: ReviewTruthFlushReason) => boolean;
};

export type ReviewTruthFlushPluginContextLike = {
  getSrsBackendClient?: () => ReviewTruthFlushClientLike | null | undefined;
};

export type ReviewTruthFlushPluginLike = {
  getContext?: () => ReviewTruthFlushPluginContextLike | undefined;
};

export type ReviewTruthFlushLogger = {
  warn?: (...args: unknown[]) => void;
};

export type ReviewTruthFlushHostRuntimeOptions = {
  getPlugin: () => ReviewTruthFlushPluginLike | null | undefined;
  getWindowPlugin: () => ReviewTruthFlushPluginLike | null | undefined;
  logger?: ReviewTruthFlushLogger;
};

export type ReviewTruthFlushHostRuntime = {
  requestReviewTruthFlush(reason: ReviewTruthFlushReason): void;
};

export function createReviewTruthFlushHostRuntime(
  options: ReviewTruthFlushHostRuntimeOptions,
): ReviewTruthFlushHostRuntime {
  function resolveClient(): ReviewTruthFlushClientLike | null {
    const contextFromProps = options.getPlugin()?.getContext?.();
    const contextFromWindow = options.getWindowPlugin()?.getContext?.();
    return contextFromProps?.getSrsBackendClient?.()
      || contextFromWindow?.getSrsBackendClient?.()
      || null;
  }

  return {
    requestReviewTruthFlush(reason): void {
      try {
        resolveClient()?.requestReviewTruthFlush?.(reason);
      } catch (error) {
        options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to request Review truth flush', {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
