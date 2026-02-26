/**
 * Debounce and throttle helpers.
 */

type Procedure<TThis, TArgs extends unknown[], TResult> = (this: TThis, ...args: TArgs) => TResult;

/**
 * Debounce: execute only after calls stop for `delay` ms.
 */
export function debounce<TThis, TArgs extends unknown[], TResult>(
  fn: Procedure<TThis, TArgs, TResult>,
  delay: number
): (this: TThis, ...args: TArgs) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: TThis, ...args: TArgs): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle: limit execution to at most once per `limit` ms.
 */
export function throttle<TThis, TArgs extends unknown[], TResult>(
  fn: Procedure<TThis, TArgs, TResult>,
  limit: number
): (this: TThis, ...args: TArgs) => void {
  let inThrottle = false;
  let lastArgs: TArgs | null = null;
  let lastContext: TThis | null = null;

  return function (this: TThis, ...args: TArgs): void {
    lastArgs = args;
    lastContext = this;

    if (!inThrottle) {
      fn.apply(lastContext, lastArgs);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
        if (lastArgs !== null && lastContext !== null) {
          fn.apply(lastContext, lastArgs);
        }
      }, limit);
    }
  };
}

/**
 * requestAnimationFrame-based throttle for UI updates.
 */
export function rafThrottle<TThis, TArgs extends unknown[], TResult>(
  fn: Procedure<TThis, TArgs, TResult>
): (this: TThis, ...args: TArgs) => void {
  let rafId: number | null = null;

  return function (this: TThis, ...args: TArgs): void {
    if (rafId !== null) {
      return;
    }

    rafId = requestAnimationFrame(() => {
      fn.apply(this, args);
      rafId = null;
    });
  };
}

/**
 * Batch incoming items and flush after `delay` ms.
 */
export function batch<T, R>(
  fn: (items: T[]) => R,
  delay: number
): (item: T) => void {
  let items: T[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (item: T): void {
    items.push(item);

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (items.length > 0) {
        fn(items);
        items = [];
      }
      timeoutId = null;
    }, delay);
  };
}
