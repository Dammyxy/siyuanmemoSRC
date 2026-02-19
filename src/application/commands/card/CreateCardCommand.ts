/**
 * CreateCardCommand - 创建卡片命令
 * 
 * @description
 * 封装创建卡片所需的输入参数。
 * 命令对象用于将用户输入传递给用例层，提供类型安全和验证。
 * 
 * **设计原则**：
 * - 数据传输对象（DTO）：仅包含数据，不包含业务逻辑
 * - 类型安全：使用 TypeScript 类型系统确保数据正确性
 * - 验证：提供基本的输入验证
 */

/**
 * 创建卡片命令接口
 * 
 * @interface CreateCardCommand
 */
export interface CreateCardCommand {
  /** 块 ID */
  blockId: string;
  
  /** 模板 ID */
  templateId: string;
  
  /** 卡片面列表 */
  faces: Array<{
    /** 问题内容 */
    question: string;
    /** 答案内容 */
    answer: string;
    /** 问题块 ID（可选） */
    questionBlockId?: string;
    /** 答案块 ID（可选） */
    answerBlockId?: string;
  }>;
  
  /** 优先级（可选，默认为 0） */
  priority?: number;
  
  /** 扩展元数据（可选） */
  meta?: Record<string, unknown>;
}

/**
 * 验证创建卡片命令
 * 
 * @param command - 创建卡片命令
 * @returns 验证结果，如果有错误则返回错误消息
 */
export function validateCreateCardCommand(command: CreateCardCommand): string | null {
  // 验证 blockId
  if (!command.blockId || command.blockId.trim().length === 0) {
    return 'blockId cannot be empty';
  }

  // 验证 templateId
  if (!command.templateId || command.templateId.trim().length === 0) {
    return 'templateId cannot be empty';
  }

  // 验证 faces
  if (!command.faces || command.faces.length === 0) {
    return 'faces must have at least one element';
  }

  // 验证每个 face
  for (let i = 0; i < command.faces.length; i++) {
    const face = command.faces[i];
    
    if (!face.question || face.question.trim().length === 0) {
      return `faces[${i}].question cannot be empty`;
    }
    
    if (!face.answer || face.answer.trim().length === 0) {
      return `faces[${i}].answer cannot be empty`;
    }
  }

  // 验证 priority（如果提供）
  if (command.priority !== undefined && command.priority < 0) {
    return 'priority must be >= 0';
  }

  return null;
}
