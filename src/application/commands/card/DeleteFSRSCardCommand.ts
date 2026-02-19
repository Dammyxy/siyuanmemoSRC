/**
 * DeleteFSRSCardCommand - 删除 FSRS 卡片命令
 * 
 * @description
 * 用于删除 FSRS 卡片。
 * 支持可选地同时删除 Riff 卡片。
 * 
 * **使用场景**：
 * - 删除单个卡片
 * - 删除卡片并从 Riff 系统中移除
 * - 批量删除（多次调用）
 * 
 * **设计原则**：
 * - 本地删除和 Riff 删除分离
 * - Riff 删除失败不影响本地删除
 * - 返回 boolean 表示卡片是否存在并被删除
 * 
 * @example
 * ```typescript
 * // 只删除本地卡片
 * const command: DeleteFSRSCardCommand = {
 *   cardId: 'card-123'
 * };
 * 
 * // 同时删除 Riff 卡片
 * const command: DeleteFSRSCardCommand = {
 *   cardId: 'card-123',
 *   deleteFromRiff: true
 * };
 * ```
 */

/**
 * 删除 FSRS 卡片命令
 */
export interface DeleteFSRSCardCommand {
  /** 卡片 ID（必需） */
  cardId: string;
  
  /** 
   * 是否同时删除 Riff 卡片（可选）
   * 
   * - true: 同时从 Riff 系统中删除卡片
   * - false/undefined: 只删除本地卡片
   * 
   * 注意：Riff 删除失败不会影响本地删除。
   */
  deleteFromRiff?: boolean;
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
  
  /**
   * 是否从 Riff 删除成功（可选）
   * 
   * 只有当 deleteFromRiff=true 时才有值。
   */
  deletedFromRiff?: boolean;
}
