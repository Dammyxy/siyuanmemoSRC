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

import { Result, ok, err } from '@/types/result';
import type { ICardTemplate } from '@/core/xiuyuan/types';

/**
 * 创建模板用例
 * 
 * @class CreateTemplateUseCase
 */
export class CreateTemplateUseCase {
  /**
   * 构造函数
   * 
   * @param templateRegistry - 模板注册表
   */
  constructor(
    private readonly templateRegistry: Map<string, ICardTemplate>
  ) {}

  /**
   * 执行用例
   * 
   * @param template - 模板定义
   * @returns Result<void> - 成功返回 ok，失败返回错误
   * 
   * @description
   * 动态创建并注册一个新的卡片模板。
   * 
   * @example
   * ```typescript
   * const useCase = new CreateTemplateUseCase(templateRegistry);
   * const result = await useCase.execute({
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
   * 
   * if (result.ok) {
   *   console.log('Template created successfully');
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async execute(template: ICardTemplate): Promise<Result<void>> {
    try {
      // 1. 验证模板定义
      if (!template.id || !template.name) {
        return err(new Error('Template must have id and name'));
      }

      if (!template.fields || template.fields.length === 0) {
        return err(new Error('Template must have at least one field'));
      }

      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template must have at least one card rule'));
      }

      // 2. 检查模板 ID 是否已存在
      if (this.templateRegistry.has(template.id)) {
        return err(new Error(`Template already exists: ${template.id}`));
      }

      // 3. 注册模板
      this.templateRegistry.set(template.id, template);

      return ok(undefined);
    } catch (error) {
      console.error('[CreateTemplateUseCase] Failed:', error);
      return err(error as Error);
    }
  }
}
