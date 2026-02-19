/**
 * TemplateId - 模板 ID 值对象
 * 
 * @description
 * 封装卡片模板的唯一标识符，提供验证和类型安全。
 * 
 * **设计原则**：
 * - 不可变性：一旦创建，值不可改变
 * - 验证逻辑：在创建时验证模板 ID 的有效性
 * - 类型安全：使用类而不是字符串，避免混淆
 */

import { Result, ok, err } from '../../../types/result';

export class TemplateId {
  private constructor(private readonly value: string) {}

  /**
   * 创建 TemplateId
   * 
   * @param value - 模板 ID 字符串
   * @returns Result<TemplateId> - 成功返回 TemplateId，失败返回错误
   */
  static create(value: string): Result<TemplateId> {
    // 验证：不能为空
    if (!value || value.trim().length === 0) {
      return err(new Error('TemplateId cannot be empty'));
    }

    // 验证：长度限制（1-50 字符）
    if (value.length > 50) {
      return err(new Error('TemplateId cannot exceed 50 characters'));
    }

    // 验证：只允许字母、数字、下划线、连字符
    const templateIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!templateIdPattern.test(value)) {
      return err(new Error('TemplateId can only contain letters, numbers, underscores, and hyphens'));
    }

    return ok(new TemplateId(value));
  }

  /**
   * 获取模板 ID 值
   */
  getValue(): string {
    return this.value;
  }

  /**
   * 比较两个 TemplateId 是否相等
   */
  equals(other: TemplateId): boolean {
    return this.value === other.value;
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    return this.value;
  }
}
