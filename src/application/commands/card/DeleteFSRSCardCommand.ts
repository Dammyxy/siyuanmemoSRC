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
 *   deleteFromRiff: true,
 *   deleteIntent: 'native-hard-delete',
 *   confirmDangerousNativeDelete: true
 * };
 * ```
 */

import type {
  CardDeleteIntent,
  NativeHardDeleteOwnershipProof,
} from '@/core/xiuyuan/domain/events/CardDeleteIntent';

/**
 * 删除 FSRS 卡片命令
 */
export interface DeleteFSRSCardCommand {
  /** 卡片 ID（必需） */
  cardId: string;

  /**
   * 是否同时删除 Riff 卡片（可选）
   * 
   * - true: 请求从 Riff 系统中删除卡片
   * - false/undefined: 只删除本地卡片
   *
   * 注意：true 只是请求，仍必须提供 native-hard-delete intent
   * 和危险确认或可靠所有权证明。
   *
   * 注意：Riff 删除失败不会影响本地删除。
   */
  deleteFromRiff?: boolean;

  /**
   * 删除意图。默认 local-tombstone；native-hard-delete 必须显式传入。
   */
  deleteIntent?: CardDeleteIntent;

  /**
   * 调用方已完成危险 native 删除确认。
   */
  confirmDangerousNativeDelete?: boolean;

  /**
   * 可靠证明该 native Riff 卡由 SiYuanMemo 拥有。
   */
  ownershipProof?: NativeHardDeleteOwnershipProof;
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
