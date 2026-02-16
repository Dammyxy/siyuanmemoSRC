/**
 * 防抖和节流工具函数
 */

/**
 * 防抖函数 - 延迟执行，只执行最后一次
 * @param fn 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
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
 * 节流函数 - 限制执行频率
 * @param fn 要节流的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  let lastContext: any = null;

  return function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    lastContext = this;

    if (!inThrottle) {
      fn.apply(lastContext, lastArgs);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
        // 执行最后一次调用
        if (lastArgs !== null) {
          fn.apply(lastContext, lastArgs);
        }
      }, limit);
    }
  };
}

/**
 * 请求动画帧节流 - 用于 UI 更新
 * @param fn 要节流的函数
 * @returns 节流后的函数
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;

  return function (this: any, ...args: Parameters<T>) {
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
 * 批处理函数 - 收集多次调用，批量执行
 * @param fn 批处理函数
 * @param delay 批处理延迟（毫秒）
 * @returns 批处理包装函数
 */
export function batch<T, R>(
  fn: (items: T[]) => R,
  delay: number
): (item: T) => void {
  let items: T[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (item: T) {
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
