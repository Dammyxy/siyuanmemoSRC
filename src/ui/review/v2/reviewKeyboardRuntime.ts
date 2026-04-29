type TimerId = ReturnType<typeof globalThis.setTimeout>;

type ReviewKeyboardLogger = {
  debug?: (...args: unknown[]) => void;
};

export type ReviewDuplicateKeyGuardOptions = {
  debounceMs?: number;
  logger?: ReviewKeyboardLogger;
  now?: () => number;
  setTimeout?: (handler: () => void, timeout: number) => TimerId;
  clearTimeout?: (timerId: TimerId) => void;
};

export type ReviewDuplicateKeyGuard = {
  shouldIgnore(key: string): boolean;
  reset(): void;
};

export type ReviewGlobalEventBinding = {
  target: EventTarget | null | undefined;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

const DEFAULT_KEY_PRESS_DEBOUNCE_MS = 30;

export function createReviewDuplicateKeyGuard(
  options: ReviewDuplicateKeyGuardOptions = {},
): ReviewDuplicateKeyGuard {
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_KEY_PRESS_DEBOUNCE_MS);
  const now = options.now ?? (() => Date.now());
  const schedule = options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout));
  const cancel = options.clearTimeout ?? ((timerId) => globalThis.clearTimeout(timerId));
  let lastKeyPressTime = 0;
  let lastKeyPressed = '';
  let isProcessingKey = false;
  let resetTimer: TimerId | null = null;

  const resetProcessing = (): void => {
    isProcessingKey = false;
    resetTimer = null;
  };

  const reset = (): void => {
    if (resetTimer !== null) {
      cancel(resetTimer);
      resetTimer = null;
    }
    lastKeyPressTime = 0;
    lastKeyPressed = '';
    isProcessingKey = false;
  };

  return {
    shouldIgnore(key: string): boolean {
      const timestamp = now();
      const timeSinceLastPress = timestamp - lastKeyPressTime;

      if (isProcessingKey && key === lastKeyPressed) {
        options.logger?.debug?.('[SiYuanMemo][ReviewView] Key is being processed, ignoring:', key);
        return true;
      }

      if (key === lastKeyPressed && timeSinceLastPress < debounceMs) {
        options.logger?.debug?.('[SiYuanMemo][ReviewView] Ignoring duplicate key press:', key, 'timeSince:', timeSinceLastPress);
        return true;
      }

      lastKeyPressTime = timestamp;
      lastKeyPressed = key;
      isProcessingKey = true;

      if (resetTimer !== null) {
        cancel(resetTimer);
      }
      resetTimer = schedule(resetProcessing, debounceMs);

      return false;
    },
    reset,
  };
}

export function bindReviewGlobalEvents(bindings: ReviewGlobalEventBinding[]): () => void {
  const activeBindings = bindings.filter((binding) => Boolean(binding.target));

  for (const binding of activeBindings) {
    binding.target?.addEventListener(binding.type, binding.listener, binding.options);
  }

  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;

    for (const binding of [...activeBindings].reverse()) {
      binding.target?.removeEventListener(binding.type, binding.listener, binding.options);
    }
  };
}
