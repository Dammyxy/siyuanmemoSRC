export type SafeMenuLogger = {
  error?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export type SafeMenuItemLike<TItem> = TItem & {
  label?: string;
  submenu?: SafeMenuItemLike<TItem>[];
  click?: () => void | Promise<void>;
};

export type SafeMenuActionOptions = {
  fallbackLabel?: string;
  logger?: SafeMenuLogger;
  onError?: (label: string, error: unknown) => void | Promise<void>;
};

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

function formatLabel(label: string | undefined, fallbackLabel: string): string {
  return String(label || fallbackLabel).replace(/<[^>]+>/g, '').trim() || fallbackLabel;
}

export function formatMenuActionError(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || fallback);
}

export function wrapSafeMenuAction<TItem>(
  item: SafeMenuItemLike<TItem>,
  action: NonNullable<SafeMenuItemLike<TItem>['click']>,
  options: SafeMenuActionOptions = {},
): () => void | Promise<void> {
  return () => {
    const label = formatLabel(item.label, options.fallbackLabel || '菜单操作');
    const report = (error: unknown) => {
      options.logger?.error?.('[SiYuanMemo] Menu action failed:', {
        label,
        error,
      });
      void Promise.resolve(options.onError?.(label, error)).catch((notifyError) => {
        options.logger?.warn?.('[SiYuanMemo] Failed to report menu action error:', notifyError);
      });
    };

    try {
      const result = action();
      if (isPromiseLike(result)) {
        return Promise.resolve(result).catch(report);
      }
    } catch (error) {
      report(error);
    }
  };
}

export function wrapSafeMenuItem<TItem>(
  item: SafeMenuItemLike<TItem>,
  options: SafeMenuActionOptions = {},
): SafeMenuItemLike<TItem> {
  const wrapped: SafeMenuItemLike<TItem> = { ...item };
  if (item.click) {
    wrapped.click = wrapSafeMenuAction(item, item.click, options);
  }
  if (item.submenu) {
    wrapped.submenu = item.submenu.map((child) => wrapSafeMenuItem(child, options));
  }
  return wrapped;
}
