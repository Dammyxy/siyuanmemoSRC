/**
 * Xiuyuan Card Meta Types
 * 
 * Xiuyuan 卡片的 meta 数据结构定义
 */

/**
 * Xiuyuan 卡片的 meta 数据
 * 
 * 存储在 FSRSCard.meta 中，用于复习界面渲染
 */
export interface XiuyuanCardMeta {
  // === Xiuyuan 相关 ===
  /** 所属的 Xiuyuan ID */
  xiuyuanID: string;
  
  /** 使用的模板 ID */
  templateID: string;
  
  /** 使用的规则索引（对应 template.cardRules 的索引） */
  ruleIndex: number;
  
  // === 字段映射 ===
  /** 正面字段名列表（如 ['question']） */
  frontFields: string[];
  
  /** 背面字段名列表（如 ['answer']） */
  backFields: string[];
  
  /** 字段名 → 块 ID 的映射 */
  fieldMapping: Record<string, string>;
  
  // === 渲染信息（从 fieldMapping 计算得出） ===
  /** 正面要显示的块 ID 列表 */
  frontBlockIDs: string[];
  
  /** 背面要显示的块 ID 列表 */
  backBlockIDs: string[];
  
  // === 卡片类型标记 ===
  /** 卡片类型标记（如 'forward', 'reverse'），用于区分同一规则生成的不同卡片 */
  typeMarker?: string;
  
  // === 列表模版卡专用字段 ===
  /** 当前卡片的提示文本 */
  cue?: string;
  
  /** 当前卡片的答案文本 */
  answer?: string;
  
  /** 所有子列表项信息（用于渐进式显示） */
  allChildren?: Array<{
    id: string;
    cue: string;
    answer: string;
    index: number;
  }>;
  
  /** 当前卡片在所有子列表项中的索引 */
  currentIndex?: number;
}

/**
 * 从字段映射计算渲染信息
 * 
 * @param frontFields 正面字段名列表
 * @param backFields 背面字段名列表
 * @param fieldMapping 字段名 → 块 ID 的映射
 * @returns 正面和背面的块 ID 列表
 */
export function calculateRenderBlockIDs(
  frontFields: string[],
  backFields: string[],
  fieldMapping: Record<string, string>
): { frontBlockIDs: string[]; backBlockIDs: string[] } {
  const frontBlockIDs = frontFields
    .map(field => fieldMapping[field])
    .filter(Boolean);
  
  const backBlockIDs = backFields
    .map(field => fieldMapping[field])
    .filter(Boolean);
  
  return { frontBlockIDs, backBlockIDs };
}

/**
 * 生成 Xiuyuan 卡片 ID
 * 
 * 格式：xy_card_{xiuyuanID}_{ruleIndex}_{timestamp}_{random}
 * 
 * @param xiuyuanID Xiuyuan ID
 * @param ruleIndex 规则索引
 * @returns 唯一的卡片 ID
 */
export function generateXiuyuanCardID(xiuyuanID: string, ruleIndex: number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `xy_card_${xiuyuanID}_${ruleIndex}_${timestamp}_${random}`;
}

/**
 * 检查卡片是否是 Xiuyuan 卡片
 * 
 * @param card FSRSCard
 * @returns 是否是 Xiuyuan 卡片
 */
export function isXiuyuanCard(card: any): card is { meta: XiuyuanCardMeta } {
  return !!(card?.meta?.xiuyuanID && card?.meta?.frontBlockIDs);
}
