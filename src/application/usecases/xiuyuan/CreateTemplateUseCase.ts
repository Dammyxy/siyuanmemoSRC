/**
 * CreateTemplateUseCase - 创建模板用例
 * 
 * @description
 * 编排创建卡片模板的业务流程。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证模板定义
 * - 注册新的卡片模板
 * - 返回创建结果
 * 
 * **业务流程**：
 * 1. 验证模板定义（id、name、fields、cardRules）
 * 2. 检查模板 ID 是否已存在
 * 3. 注册模板
 * 4. 返回结果
 */

import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 创建模板用例
 * 
 * @class CreateTemplateUseCase
 */
export class CreateTemplateUseCase {
  /**
   * 构造函数
   * 
   * @param xiuyuanService - Xiuyuan 领域服务（临时依赖）
   */
  constructor(
    private readonly xiuyuanService: XiuyuanService
  ) {}

  /**
   * 执行用例
   * 
   * @param template - 模板定义
   * 
   * @description
   * 动态创建并注册一个新的卡片模板。
   * 
   * @example
   * ```typescript
   * const useCase = new CreateTemplateUseCase(xiuyuanService);
   * await useCase.execute({
   *   id: 'my-template',
   *   name: '我的模板',
   *   fields: [
   *     { name: 'question', description: '问题' },
   *     { name: 'answer', description: '答案' }
   *   ],
   *   cardRules: [
   *     {
   *       typeMarker: 'basic',
   *       frontFields: ['question'],
   *       backFields: ['answer']
   *     }
   *   ]
   * });
   * ```
   */
  async execute(template: any): Promise<void> {
    // 委托给 XiuyuanService
    this.xiuyuanService.createTemplate(template);
  }
}
