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
  
  /**
   * 是否为双向卡片（可选）
   * 用于快速卡片模板，标记是否需要生成正反两张卡片
   */
  isBidirectional?: boolean;
  
  /**
   * 背面挖空信息（可选）
   * 用于快速卡片和模板制卡的背面多挖空功能
   */
  backClozeInfo?: {
    /** 原始完整内容 */
    originalContent: string;
    /** 正面内容 */
    front: string;
    /** 背面内容（包含挖空标记） */
    back: string;
    /** 挖空列表 */
    clozes: Array<{
      text: string;
      start: number;
      end: number;
      type: string;
    }>;
    /** 方向：forward=正向, backward=反向, both=双向 */
    direction: 'forward' | 'backward' | 'both';
    /** 符号（可选，用于日志） */
    symbol?: string;
  };
  
  /**
   * 卡片类型（可选）
   * 用于明确指定卡片类型，避免自动检测
   * 例如：'descriptor', 'concept', 'cloze' 等
   */
  cardType?: 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze';
}
