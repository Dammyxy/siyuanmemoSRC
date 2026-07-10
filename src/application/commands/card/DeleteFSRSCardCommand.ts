/**
 * DeleteFSRSCardCommand - 删除 FSRS 卡片命令
 * 
 * @description
 * 用于删除 SiYuanMemo 本地 FSRS 卡片。
 * 
 * **使用场景**：
 * - 删除单个卡片
 * - 批量删除（多次调用）
 * 
 * **设计原则**：
 * - 删除只影响 SiYuanMemo 本地状态
 * - 返回 boolean 表示卡片是否存在并被删除
 * 
 * @example
 * ```typescript
 * // 只删除本地卡片
 * const command: DeleteFSRSCardCommand = {
 *   cardId: 'card-123'
 * };
 * ```
 */

/**
 * 删除 FSRS 卡片命令
 */
export interface DeleteFSRSCardCommand {
  /** 卡片 ID（必需） */
  cardId: string;
}

/**
 * 批量删除 FSRS 卡片命令。
 */
export interface DeleteFSRSCardsCommand {
  /** 卡片 ID 列表 */
  cardIds: string[];
}

/**
 * 删除 FSRS 卡片命令结果
 */
export interface DeleteFSRSCardCommandResult {
  /** 
   * 是否成功删除
   *
   * - true: 卡片存在并已删除
   * - false: 卡片不存在
   */
  deleted: boolean;
}

/**
 * 批量删除 FSRS 卡片结果。
 */
export interface DeleteFSRSCardsCommandResult {
  attemptedCount: number;
  deletedCount: number;
  deletedCardIds: string[];
  failedCardIds: string[];
}
