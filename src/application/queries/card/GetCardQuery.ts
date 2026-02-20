/**
 * GetCardQuery - 获取单个卡片查询
 * 
 * @description
 * 用于查询单个卡片的查询对象
 */

/**
 * 获取卡片查询
 */
export interface GetCardQuery {
  /**
   * 卡片 ID
   */
  cardId: string;
}

/**
 * 获取卡片查询结果
 */
export interface GetCardQueryResult {
  /**
   * 卡片数据（FSRSCard 格式）
   * 如果卡片不存在，则为 null
   */
  card: any | null; // 使用 any 避免循环依赖，实际类型是 FSRSCard | null
}
