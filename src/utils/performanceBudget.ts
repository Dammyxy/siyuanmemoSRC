/**
 * 性能预算配置和检查工具
 */

/**
 * 性能预算定义（单位：毫秒）
 */
export const PERFORMANCE_BUDGETS = {
  // 数据库查询
  'db:query:single': 50,      // 单次查询 < 50ms
  'db:query:batch': 200,      // 批量查询 < 200ms
  'db:query:complex': 500,    // 复杂查询 < 500ms

  // UI 渲染
  'ui:render:card': 16,       // 卡片渲染 < 16ms (60fps)
  'ui:render:list': 100,      // 列表渲染 < 100ms
  'ui:render:dialog': 200,    // 对话框渲染 < 200ms

  // 网络请求
  'network:api': 500,         // API 请求 < 500ms
  'network:websocket': 100,   // WebSocket 消息 < 100ms

  // 算法计算
  'algo:fsrs': 10,            // FSRS 计算 < 10ms
  'algo:sort': 50,            // 排序 < 50ms
  'algo:filter': 30,          // 过滤 < 30ms

  // 数据处理
  'data:parse': 50,           // 数据解析 < 50ms
  'data:transform': 100,      // 数据转换 < 100ms
} as const;

export type PerformanceBudgetKey = keyof typeof PERFORMANCE_BUDGETS;

/**
 * 检查性能预算
 */
export function checkBudget(
  name: PerformanceBudgetKey,
  duration: number,
  context?: string
): boolean {
  const budget = PERFORMANCE_BUDGETS[name];
  const exceeded = duration > budget;

  if (exceeded && process.env.NODE_ENV === 'development') {
    const contextStr = context ? ` (${context})` : '';
    console.warn(
      `⚠️ Performance budget exceeded: ${name}${contextStr} took ${duration.toFixed(2)}ms (budget: ${budget}ms)`
    );
  }

  return !exceeded;
}

/**
 * 性能预算装饰器（用于类方法）
 */
export function withBudget(budgetKey: PerformanceBudgetKey) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      try {
        return await originalMethod.apply(this, args);
      } finally {
        const duration = performance.now() - start;
        checkBudget(budgetKey, duration, `${target.constructor.name}.${propertyKey}`);
      }
    };

    return descriptor;
  };
}

/**
 * 性能预算包装函数
 */
export function measureWithBudget<T extends (...args: any[]) => any>(
  budgetKey: PerformanceBudgetKey,
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    const start = performance.now();
    try {
      return await fn(...args);
    } finally {
      const duration = performance.now() - start;
      checkBudget(budgetKey, duration, context);
    }
  }) as T;
}
