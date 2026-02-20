/**
 * GetAllTemplatesQueryHandler - 获取所有模板查询处理器
 * 
 * @description
 * 处理获取所有模板的查询请求。
 * 
 * **设计原则**：
 * - CQRS 模式：查询和命令分离
 * - 查询处理器：专门处理查询请求
 * - 只读操作：不修改数据
 * 
 * **职责**：
 * - 从模板注册表中获取所有模板
 * - 返回查询结果
 * 
 * **业务流程**：
 * 1. 从模板注册表中查询所有模板
 * 2. 返回模板列表
 */

import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 获取所有模板查询
 */
export interface GetAllTemplatesQuery {
  // 当前无参数，预留扩展
}

/**
 * 获取所有模板查询结果
 */
export interface GetAllTemplatesQueryResult {
  templates: any[];
}

/**
 * 获取所有模板查询处理器
 * 
 * @class GetAllTemplatesQueryHandler
 */
export class GetAllTemplatesQueryHandler {
  /**
   * 构造函数
   * 
   * @param xiuyuanService - Xiuyuan 领域服务（临时依赖）
   */
  constructor(
    private readonly xiuyuanService: XiuyuanService
  ) {}

  /**
   * 处理查询
   * 
   * @param _query - 查询对象（可选，当前未使用）
   * @returns GetAllTemplatesQueryResult - 查询结果
   * 
   * @example
   * ```typescript
   * const handler = new GetAllTemplatesQueryHandler(xiuyuanService);
   * const result = await handler.handle({});
   * console.log('Templates:', result.templates);
   * ```
   */
  async handle(_query: GetAllTemplatesQuery = {}): Promise<GetAllTemplatesQueryResult> {
    const templates = this.xiuyuanService.getAllTemplates();
    
    return { templates };
  }
}
