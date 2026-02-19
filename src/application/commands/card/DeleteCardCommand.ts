/**
 * DeleteCardCommand - 删除卡片命令
 * 
 * @description
 * 封装删除卡片所需的输入参数。
 * 命令对象用于将用户输入传递给用例层，提供类型安全和验证。
 * 
 * **设计原则**：
 * - 数据传输对象（DTO）：仅包含数据，不包含业务逻辑
 * - 类型安全：使用 TypeScript 类型系统确保数据正确性
 * - 验证：提供基本的输入验证
 */

/**
 * 删除卡片命令接口
 * 
 * @interface DeleteCardCommand
 */
export interface DeleteCardCommand {
  /** 卡片 ID */
  cardId: string;
}

/**
 * 验证删除卡片命令
 * 
 * @param command - 删除卡片命令
 * @returns 验证结果，如果有错误则返回错误消息
 */
export function validateDeleteCardCommand(command: DeleteCardCommand): string | null {
  // 验证 cardId
  if (!command.cardId || command.cardId.trim().length === 0) {
    return 'cardId cannot be empty';
  }

  // 验证 cardId 长度
  if (command.cardId.length > 100) {
    return 'cardId cannot exceed 100 characters';
  }

  return null;
}
