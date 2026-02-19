/**
 * UpdateCardCommand - 更新卡片命令
 * 
 * @description
 * 封装更新卡片所需的输入参数。
 * 命令对象用于将用户输入传递给用例层，提供类型安全和验证。
 * 
 * **设计原则**：
 * - 数据传输对象（DTO）：仅包含数据，不包含业务逻辑
 * - 类型安全：使用 TypeScript 类型系统确保数据正确性
 * - 验证：提供基本的输入验证
 * - 部分更新：支持只更新部分字段
 */

import { ScheduleInfo } from '../../../core/xiuyuan/domain/ScheduleInfo';

/**
 * 更新卡片命令接口
 * 
 * @interface UpdateCardCommand
 */
export interface UpdateCardCommand {
  /** 卡片 ID（必需） */
  cardId: string;
  
  /** 修缘 ID（必需，用于定位聚合根） */
  xiuyuanId: string;
  
  /** 面索引（可选） */
  faceIndex?: number;
  
  /** 调度信息（可选） */
  scheduleInfo?: ScheduleInfo;
}

/**
 * 验证更新卡片命令
 * 
 * @param command - 更新卡片命令
 * @returns 验证结果，如果有错误则返回错误消息
 */
export function validateUpdateCardCommand(command: UpdateCardCommand): string | null {
  // 验证 cardId
  if (!command.cardId || command.cardId.trim().length === 0) {
    return 'cardId cannot be empty';
  }

  // 验证 cardId 长度
  if (command.cardId.length > 100) {
    return 'cardId cannot exceed 100 characters';
  }

  // 验证 xiuyuanId
  if (!command.xiuyuanId || command.xiuyuanId.trim().length === 0) {
    return 'xiuyuanId cannot be empty';
  }

  // 验证 xiuyuanId 长度
  if (command.xiuyuanId.length > 100) {
    return 'xiuyuanId cannot exceed 100 characters';
  }

  // 验证 faceIndex（如果提供）
  if (command.faceIndex !== undefined && command.faceIndex < 0) {
    return 'faceIndex must be >= 0';
  }

  // 至少需要提供一个更新字段
  if (command.faceIndex === undefined && command.scheduleInfo === undefined) {
    return 'At least one field must be provided for update';
  }

  return null;
}
