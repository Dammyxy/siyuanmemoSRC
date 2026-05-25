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
 * 
 * **版本历史**：
 * - v1: 原始版本，支持 faces 数组
 * - v2: 扩展版本，支持更多卡片类型和自动模板选择
 */

/**
 * 卡片类型枚举
 * 根据 xiuyuan-unification 规范，只支持 4 种类型
 */
export type CardType = 'item' | 'topic' | 'concept' | 'descriptor';

/**
 * 调度器类型枚举
 */
export type SchedulerType = 'fsrs-v6' | 'a-factor-v2';

/**
 * 卡片来源
 */
export type CardSource = 'manual' | 'auto' | 'symbol' | 'quick';

export interface ProgressiveLineage {
  kind?: 'piece' | 'excerpt' | 'derived-item' | 'daily-trace';
  sessionId?: string;
  mode?: 'linear' | 'nonlinear';
  pieceDocId?: string;
  pieceIndex?: number;
  sourceDocId?: string;
  sourceBlockId?: string;
  sourceBlockIds?: string[];
  parentExcerptId?: string;
  parentTopicCardId?: string;
  storageMode?: 'workbench' | 'source-child';
  creationRuleId?: string;
  answerFingerprint?: string;
  sourceLineage?: unknown;
  payloadIdentity?: unknown;
  disclosureState?: unknown;
}

/**
 * 创建卡片命令接口
 * 
 * @interface CreateCardCommand
 */
export interface CreateCardCommand {
  /** 块 ID（单个块） */
  blockId?: string;
  
  /** 块 ID 列表（多个块，用于模板卡片） */
  blockIds?: string[];
  
  /** 模板 ID（可选，如果未指定则自动选择） */
  templateId?: string;
  
  /** 卡片面列表（v1 格式，向后兼容） */
  faces?: Array<{
    /** 问题内容 */
    question: string;
    /** 答案内容 */
    answer: string;
    /** 问题块 ID（可选） */
    questionBlockId?: string;
    /** 答案块 ID（可选） */
    answerBlockId?: string;
  }>;
  
  /** 字段映射（v2 格式，用于模板卡片） */
  fieldMapping?: Record<string, string>;
  
  /** 卡组 ID（可选，默认使用内置卡组） */
  deckId?: string;
  
  /** 卡片类型（可选，用于自动选择模板，默认为 'item'） */
  cardType?: CardType;
  
  /** 调度器类型（可选，默认根据卡片类型自动选择） */
  schedulerType?: SchedulerType;
  
  /** 优先级（可选，默认为 50） */
  priority?: number;

  /** 摘抄来源块 ID（如果该卡片来自摘抄） */
  extractedFrom?: string;

  /** 渐进阅读 lineage 信息 */
  progressiveLineage?: ProgressiveLineage;
  
  /** 扩展元数据（可选） */
  metadata?: {
    /** 是否自动创建 */
    autoCreated?: boolean;
    /** 是否符号检测 */
    symbolDetected?: boolean;
    /** 卡片来源 */
    source?: CardSource;
    /** 其他元数据 */
    [key: string]: unknown;
  };
  
  /** 旧版元数据字段（向后兼容） */
  meta?: {
    /** 是否自动创建 */
    autoCreated?: boolean;
    /** 是否符号检测 */
    symbolDetected?: boolean;
    /** 卡片来源 */
    source?: CardSource;
    /** 其他元数据 */
    [key: string]: unknown;
  };
}

/**
 * 验证创建卡片命令
 * 
 * @param command - 创建卡片命令
 * @returns 验证结果，如果有错误则返回错误消息
 */
export function validateCreateCardCommand(command: CreateCardCommand): string | null {
  // 验证 blockId 或 blockIds（至少有一个）
  const hasBlockId = command.blockId && command.blockId.trim().length > 0;
  const hasBlockIds = command.blockIds && command.blockIds.length > 0;
  
  if (!hasBlockId && !hasBlockIds) {
    return 'blockId or blockIds must be provided';
  }

  // templateId 现在是可选的（自动选择）
  // 如果提供了 templateId，验证它不为空
  if (command.templateId !== undefined && command.templateId.trim().length === 0) {
    return 'templateId cannot be empty string';
  }

  // 验证 cardType（如果提供）
  if (command.cardType !== undefined) {
    const validTypes: CardType[] = ['item', 'topic', 'concept', 'descriptor'];
    if (!validTypes.includes(command.cardType)) {
      return `cardType must be one of: ${validTypes.join(', ')}`;
    }
  }

  // 验证 schedulerType（如果提供）
  if (command.schedulerType !== undefined) {
    const validSchedulers: SchedulerType[] = ['fsrs-v6', 'a-factor-v2'];
    if (!validSchedulers.includes(command.schedulerType)) {
      return `schedulerType must be one of: ${validSchedulers.join(', ')}`;
    }
  }

  // 验证 faces（如果使用 v1 格式）
  if (command.faces) {
    if (command.faces.length === 0) {
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
  }

  // 验证 priority（如果提供）
  if (command.priority !== undefined) {
    if (typeof command.priority !== 'number') {
      return 'priority must be a number';
    }
    if (command.priority < 0 || command.priority > 100) {
      return 'priority must be between 0 and 100';
    }
  }

  return null;
}
