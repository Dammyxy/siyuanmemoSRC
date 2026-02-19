/**
 * XiuyuanId - 修缘唯一标识符值对象
 * 
 * @description
 * 封装 Xiuyuan 的唯一标识符，提供验证和类型安全。
 * 
 * **设计原则**：
 * - 不可变性：一旦创建，值不可改变
 * - 验证逻辑：在创建时验证 ID 的有效性
 * - 类型安全：使用类而不是字符串，避免混淆
 */

import { Result, ok, err } from '../../../types/result';

export class XiuyuanId {
  private constructor(private readonly value: string) {}

  /**
   * 创建 XiuyuanId
   * 
   * @param value - ID 字符串
   * @returns Result<XiuyuanId> - 成功返回 XiuyuanId，失败返回错误
   */
  static create(value: string): Result<XiuyuanId> {
    // 验证：不能为空
    if (!value || value.trim().length === 0) {
      return err(new Error('XiuyuanId cannot be empty'));
    }

    // 验证：长度限制（1-100 字符）
    if (value.length > 100) {
      return err(new Error('XiuyuanId cannot exceed 100 characters'));
    }

    return ok(new XiuyuanId(value));
  }

  /**
   * 获取 ID 值
   */
  getValue(): string {
    return this.value;
  }

  /**
   * 比较两个 XiuyuanId 是否相等
   */
  equals(other: XiuyuanId): boolean {
    return this.value === other.value;
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    return this.value;
  }
}
