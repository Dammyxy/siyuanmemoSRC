/**
 * DeleteCardsCommand - 批量删除卡片命令
 * 
 * @description
 * 用于批量删除多张卡片的命令对象。
 * 
 * **设计原则**：
 * - 命令模式：封装批量删除请求
 * - 不可变：命令对象创建后不可修改
 * - 验证：提供验证函数确保命令有效
 * 
 * **使用场景**：
 * - 用户在卡片浏览器中选择多张卡片并删除
 * - 批量清理过期卡片
 * - 删除某个 Xiuyuan 下的所有卡片
 */

/**
 * 批量删除卡片命令
 * 
 * @interface DeleteCardsCommand
 */
export interface DeleteCardsCommand {
  /** 卡片 ID 列表 */
  cardIds: string[];
}

/**
 * 批量删除卡片结果
 * 
 * @interface DeleteCardsResult
 */
export interface DeleteCardsResult {
  /** 成功删除的卡片数量 */
  deletedCount: number;
  /** 成功删除的卡片 ID 列表 */
  deletedCardIds: string[];
  /** 失败的卡片 ID 列表 */
  failedCardIds: string[];
}

/**
 * 验证批量删除卡片命令
 * 
 * @param command - 批量删除卡片命令
 * @returns 验证错误信息，如果验证通过则返回 null
 * 
 * @example
 * ```typescript
 * const error = validateDeleteCardsCommand({ cardIds: [] });
 * if (error) {
 *   console.error('Invalid command:', error);
 * }
 * ```
 */
export function validateDeleteCardsCommand(command: DeleteCardsCommand): string | null {
  if (!command) {
    return 'Command is required';
  }

  if (!Array.isArray(command.cardIds)) {
    return 'cardIds must be an array';
  }

  if (command.cardIds.length === 0) {
    return 'cardIds cannot be empty';
  }

  for (const cardId of command.cardIds) {
    if (!cardId || typeof cardId !== 'string') {
      return 'All cardIds must be non-empty strings';
    }
  }

  return null;
}
