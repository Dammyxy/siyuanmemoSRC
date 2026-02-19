/**
 * Priority - 优先级值对象
 * 
 * @description
 * 封装卡片的优先级，提供验证和类型安全。
 * 
 * **设计原则**：
 * - 不可变性：一旦创建，值不可改变
 * - 验证逻辑：在创建时验证优先级的有效性
 * - 业务语义：清晰表达优先级概念
 * 
 * **优先级范围**：
 * - 0: 最低优先级
 * - 10: 最高优先级
 * - 默认: 5（中等优先级）
 */

import { Result, ok, err } from '../../../types/result';

export class Priority {
  private static readonly MIN_PRIORITY = 0;
  private static readonly MAX_PRIORITY = 10;
  public static readonly DEFAULT_PRIORITY = 5;

  private constructor(private readonly value: number) {}

  /**
   * 创建 Priority
   * 
   * @param value - 优先级值（0-10）
   * @returns Result<Priority> - 成功返回 Priority，失败返回错误
   */
  static create(value: number): Result<Priority> {
    // 验证：必须是数字
    if (typeof value !== 'number' || isNaN(value)) {
      return err(new Error('Priority must be a number'));
    }

    // 验证：必须是整数
    if (!Number.isInteger(value)) {
      return err(new Error('Priority must be an integer'));
    }

    // 验证：范围检查（0-10）
    if (value < Priority.MIN_PRIORITY || value > Priority.MAX_PRIORITY) {
      return err(new Error(`Priority must be between ${Priority.MIN_PRIORITY} and ${Priority.MAX_PRIORITY}`));
    }

    return ok(new Priority(value));
  }

  /**
   * 创建默认优先级
   */
  static createDefault(): Priority {
    return new Priority(Priority.DEFAULT_PRIORITY);
  }

  /**
   * 获取优先级值
   */
  getValue(): number {
    return this.value;
  }

  /**
   * 比较两个 Priority 是否相等
   */
  equals(other: Priority): boolean {
    return this.value === other.value;
  }

  /**
   * 比较优先级大小
   * @returns 正数表示当前优先级更高，负数表示更低，0 表示相等
   */
  compareTo(other: Priority): number {
    return this.value - other.value;
  }

  /**
   * 判断是否为高优先级（>= 7）
   */
  isHigh(): boolean {
    return this.value >= 7;
  }

  /**
   * 判断是否为低优先级（<= 3）
   */
  isLow(): boolean {
    return this.value <= 3;
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    return `Priority(${this.value})`;
  }
}
