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

import type { ICardTemplate } from '@/core/xiuyuan/types';

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
  templates: ICardTemplate[];
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
   * @param templateRegistry - 模板注册表
   */
  constructor(
    private readonly templateRegistry: Map<string, ICardTemplate>
  ) {}

  /**
   * 处理查询
   * 
   * @param _query - 查询对象（可选，当前未使用）
   * @returns GetAllTemplatesQueryResult - 查询结果
   * 
   * @example
   * ```typescript
   * const handler = new GetAllTemplatesQueryHandler(templateRegistry);
   * const result = await handler.handle({});
   * console.log('Templates:', result.templates);
   * ```
   */
  async handle(_query: GetAllTemplatesQuery = {}): Promise<GetAllTemplatesQueryResult> {
    const allTemplates = Array.from(this.templateRegistry.values());
    
    // 过滤掉内部使用的模板（方向变体）
    // 这些模板只在内部使用，不应该在模板选择对话框中显示
    const internalTemplateIds = [
      'builtin-concept-definition-forward',
      'builtin-concept-definition-reverse',
      'builtin-concept-descriptor-reverse',
      'builtin-concept-descriptor-both',
    ];
    
    const templates = allTemplates.filter(
      template => !internalTemplateIds.includes(template.id)
    );
    
    return { templates };
  }
}
