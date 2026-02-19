/**
 * GetXiuyuanQuery - 获取 Xiuyuan 查询
 * 
 * @description
 * 用于查询单个 Xiuyuan 的查询对象
 */

/**
 * 获取 Xiuyuan 查询
 */
export interface GetXiuyuanQuery {
  /**
   * Xiuyuan ID
   */
  xiuyuanId: string;
}

/**
 * 获取 Xiuyuan 查询结果
 */
export interface GetXiuyuanQueryResult {
  /**
   * Xiuyuan 数据
   */
  xiuyuan: any; // 使用 any 避免循环依赖，实际类型是 IXiuyuan
}
