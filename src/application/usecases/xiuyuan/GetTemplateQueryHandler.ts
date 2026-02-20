/**
 * GetTemplateQueryHandler - 获取模板查询处理器
 * 
 * @description
 * 处理获取单个模板的查询请求。
 * 
 * **设计原则**：
 * - CQRS 模式：查询和命令分离
 * - 查询处理器：专门处理查询请求
 * - 只读操作：不修改数据
 * 
 * **职责**：
 * - 验证查询参数
 * - 从模板注册表中获取模板
 * - 返回查询结果
 * 
 * **业务流程**：
 * 1. 验证 templateId
 * 2. 从模板注册表中查询模板
 * 3. 如果不存在，抛出错误
 * 4. 返回模板
 */

import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 获取模板查询
 */
export interface GetTemplateQuery {
  templateId: string;
}

/**
 * 获取模板查询结果
 */
export interface GetTemplateQueryResult {
  template: any;
}

/**
 * 获取模板查询处理器
 * 
 * @class GetTemplateQueryHandler
 */
export class GetTemplateQueryHandler {
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
   * @param query - 查询对象
   * @returns GetTemplateQueryResult - 查询结果
   * @throws Error 如果模板不存在
   * 
   * @example
   * ```typescript
   * const handler = new GetTemplateQueryHandler(xiuyuanService);
   * const result = await handler.handle({ templateId: 'basic' });
   * console.log('Template:', result.template);
   * ```
   */
  async handle(query: GetTemplateQuery): Promise<GetTemplateQueryResult> {
    const template = this.xiuyuanService.getTemplate(query.templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${query.templateId}`);
    }
    
    return { template };
  }
}
