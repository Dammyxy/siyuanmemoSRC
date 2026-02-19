/**
 * GetCardsQuery - 获取卡片列表查询
 * 
 * @description
 * 用于查询卡片列表的查询对象，支持可选的过滤条件
 */

/**
 * 卡片过滤条件
 */
export interface CardFilter {
  /**
   * 按卡片状态过滤
   */
  state?: number;
  
  /**
   * 按 deckId 过滤
   */
  deckId?: string;
  
  /**
   * 按标签过滤
   */
  tags?: string[];
  
  /**
   * 自定义过滤函数
   */
  customFilter?: (card: any) => boolean;
}

/**
 * 获取卡片列表查询
 */
export interface GetCardsQuery {
  /**
   * 可选的过滤条件
   */
  filter?: CardFilter;
}

/**
 * 获取卡片列表查询结果
 */
export interface GetCardsQueryResult {
  /**
   * 卡片列表
   */
  cards: any[]; // 使用 any 避免循环依赖，实际类型是 FSRSCard[]
  
  /**
   * 卡片总数
   */
  total: number;
}
