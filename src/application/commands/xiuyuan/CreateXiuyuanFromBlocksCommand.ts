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
  
  /**
   * 自定义模版（可选）
   * 用于动态生成 cardRules 的场景（如多填空卡片）
   */
  template?: any;
  
  /**
   * 填空信息（可选）
   * 用于多填空卡片,包含原始内容和填空位置
   */
  clozeInfo?: {
    /**
     * 原始内容（包含所有填空标记）
     */
    originalContent: string;
    /**
     * 填空列表
     */
    clozes: Array<{
      text: string;
      start: number;
      end: number;
      type: string;
    }>;
  };
}
