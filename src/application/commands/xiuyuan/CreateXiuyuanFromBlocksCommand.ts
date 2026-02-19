/**
 * CreateXiuyuanFromBlocksCommand - 从块创建 Xiuyuan 命令
 * 
 * @description
 * 用于从思源笔记块创建 Xiuyuan 和关联卡片的命令对象
 */

/**
 * 从块创建 Xiuyuan 命令
 */
export interface CreateXiuyuanFromBlocksCommand {
  /**
   * 块 ID 列表
   */
  blockIds: string[];
  
  /**
   * 模板 ID
   */
  templateId: string;
  
  /**
   * 字段映射（可选）
   * 例如：{ question: 'block-1', answer: 'block-2' }
   */
  fieldMapping?: Record<string, string>;
  
  /**
   * 牌组 ID（可选）
   */
  deckId?: string;
  
  /**
   * 优先级（可选，1-10）
   */
  priority?: number;
}
