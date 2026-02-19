/**
 * BlockId - 思源块 ID 值对象
 * 
 * @description
 * 封装思源笔记的块 ID，提供验证和类型安全。
 * 
 * **设计原则**：
 * - 不可变性：一旦创建，值不可改变
 * - 验证逻辑：在创建时验证块 ID 的有效性
 * - 类型安全：使用类而不是字符串，避免混淆
 */

import { Result, ok, err } from '../../../types/result';

export class BlockId {
  private constructor(private readonly value: string) {}

  /**
   * 创建 BlockId
   * 
   * @param value - 块 ID 字符串
   * @returns Result<BlockId> - 成功返回 BlockId，失败返回错误
   */
  static create(value: string): Result<BlockId> {
    // 验证：不能为空
    if (!value || value.trim().length === 0) {
      return err(new Error('BlockId cannot be empty'));
    }

    // 验证：思源块 ID 格式（20 位数字+字母）
    // 思源块 ID 格式示例：20210808180117-6v0mkxr
    const blockIdPattern = /^[0-9]{14}-[a-z0-9]{7}$/;
    if (!blockIdPattern.test(value)) {
      return err(new Error(`Invalid BlockId format: ${value}`));
    }

    return ok(new BlockId(value));
  }

  /**
   * 获取块 ID 值
   */
  getValue(): string {
    return this.value;
  }

  /**
   * 比较两个 BlockId 是否相等
   */
  equals(other: BlockId): boolean {
    return this.value === other.value;
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    return this.value;
  }
}
