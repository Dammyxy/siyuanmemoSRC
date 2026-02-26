/**
 * GetAllXiuyuansQuery - 获取所有 Xiuyuan 查询
 * 
 * @description
 * 用于查询所有 Xiuyuan 的查询对象
 */

/**
 * 获取所有 Xiuyuan 查询（当前无参数）
 */
export interface GetAllXiuyuansQuery {
  // 预留扩展，例如分页、过滤等
}

/**
 * 获取所有 Xiuyuan 查询结果
 */
export interface GetAllXiuyuansQueryResult {
  /**
   * Xiuyuan 列表
   */
  xiuyuans: unknown[];
  
  /**
   * 总数
   */
  total: number;
}
