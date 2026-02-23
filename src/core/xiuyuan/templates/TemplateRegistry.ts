/**
 * TemplateRegistry - 模板注册器
 * 
 * @description
 * 管理所有内置和自定义模板，提供模板注册、查询和验证功能。
 * 
 * 核心功能：
 * - 注册模板（包含验证）
 * - 查询模板（按 ID、类型）
 * - 验证模板定义
 * - 自动注册所有内置模板
 * 
 * @example
 * ```typescript
 * const registry = new TemplateRegistry();
 * 
 * // 获取模板
 * const template = registry.get('builtin-basic-qa');
 * 
 * // 注册自定义模板
 * const result = registry.register({
 *   id: 'custom-vocab',
 *   name: '词汇卡',
 *   fields: [
 *     { name: 'word', description: '单词' },
 *     { name: 'translation', description: '翻译' }
 *   ],
 *   cardRules: [
 *     {
 *       typeMarker: 'vocab',
 *       frontFields: ['word'],
 *       backFields: ['translation']
 *     }
 *   ]
 * });
 * ```
 */

import type { ICardTemplate } from '../types';
import { BUILTIN_TEMPLATES, ALL_TEMPLATES } from './builtin';
import { BUILTIN_CONCEPT_TEMPLATE } from './builtin-concept';
import { ok, err, type Result } from '@/types/result';

/**
 * 模板注册器
 */
export class TemplateRegistry {
  private templates: Map<string, ICardTemplate> = new Map();

  constructor() {
    // 注册所有内置模板
    this.registerBuiltinTemplates();
  }

  /**
   * 注册模板
   * 
   * @param template - 模板定义
   * @returns Result<void> - 成功返回 ok，失败返回包含错误信息的 err
   * 
   * @example
   * ```typescript
   * const result = registry.register({
   *   id: 'custom-template',
   *   name: '自定义模板',
   *   fields: [{ name: 'field1' }],
   *   cardRules: [{ typeMarker: 'custom', frontFields: ['field1'], backFields: ['field1'] }]
   * });
   * 
   * if (!result.ok) {
   *   console.error('Template validation failed:', result.error);
   * }
   * ```
   */
  register(template: ICardTemplate): Result<void, Error> {
    // 验证模板
    const errors = this.validateTemplate(template);
    if (errors.length > 0) {
      return err(new Error(`Template validation failed: ${errors.join(', ')}`));
    }

    this.templates.set(template.id, template);
    return ok(undefined);
  }

  /**
   * 获取模板
   * 
   * @param templateId - 模板 ID
   * @returns 模板定义，如果不存在返回 undefined
   * 
   * @example
   * ```typescript
   * const template = registry.get('builtin-basic-qa');
   * if (template) {
   *   console.log('Template found:', template.name);
   * }
   * ```
   */
  get(templateId: string): ICardTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * 获取所有模板
   * 
   * @returns 所有模板的数组
   * 
   * @example
   * ```typescript
   * const allTemplates = registry.getAll();
   * console.log(`Total templates: ${allTemplates.length}`);
   * ```
   */
  getAll(): ICardTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 获取所有内置模板
   * 
   * @returns 所有内置模板的数组（ID 以 'builtin-' 开头）
   * 
   * @example
   * ```typescript
   * const builtinTemplates = registry.getBuiltin();
   * console.log('Builtin templates:', builtinTemplates.map(t => t.name));
   * ```
   */
  getBuiltin(): ICardTemplate[] {
    return this.getAll().filter(t => t.id.startsWith('builtin-'));
  }

  /**
   * 获取所有自定义模板
   * 
   * @returns 所有自定义模板的数组（ID 不以 'builtin-' 开头）
   * 
   * @example
   * ```typescript
   * const customTemplates = registry.getCustom();
   * console.log('Custom templates:', customTemplates.map(t => t.name));
   * ```
   */
  getCustom(): ICardTemplate[] {
    return this.getAll().filter(t => !t.id.startsWith('builtin-'));
  }

  /**
   * 验证模板定义
   * 
   * @param template - 模板定义
   * @returns 验证错误列表，如果验证通过返回空数组
   * 
   * 验证规则：
   * - 必须有 id 和 name
   * - 必须至少有一个字段
   * - 必须至少有一个卡片规则
   * - 字段名称必须唯一
   * - 卡片规则引用的字段必须存在
   * 
   * @example
   * ```typescript
   * const errors = registry.validateTemplate(template);
   * if (errors.length > 0) {
   *   console.error('Validation errors:', errors);
   * }
   * ```
   */
  validateTemplate(template: ICardTemplate): string[] {
    const errors: string[] = [];

    // 验证必需字段
    if (!template.id) {
      errors.push('Missing template id');
    }
    if (!template.name) {
      errors.push('Missing template name');
    }

    // 验证字段
    if (!template.fields || template.fields.length === 0) {
      errors.push('Template must have at least one field');
    }

    // 验证卡片规则
    if (!template.cardRules || template.cardRules.length === 0) {
      errors.push('Template must have at least one card rule');
    }

    // 检查字段名唯一性
    if (template.fields && template.fields.length > 0) {
      const fieldNames = new Set<string>();
      for (const field of template.fields) {
        if (fieldNames.has(field.name)) {
          errors.push(`Duplicate field name: ${field.name}`);
        }
        fieldNames.add(field.name);
      }

      // 检查卡片规则引用的字段存在
      if (template.cardRules && template.cardRules.length > 0) {
        for (const rule of template.cardRules) {
          // 检查 frontFields
          for (const fieldName of rule.frontFields || []) {
            if (!fieldNames.has(fieldName)) {
              errors.push(`Card rule references non-existent field: ${fieldName}`);
            }
          }
          // 检查 backFields
          for (const fieldName of rule.backFields || []) {
            if (!fieldNames.has(fieldName)) {
              errors.push(`Card rule references non-existent field: ${fieldName}`);
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * 注册所有内置模板
   * 
   * @private
   */
  private registerBuiltinTemplates(): void {
    // 🆕 注册所有模板（包括内部使用的变体）
    for (const template of ALL_TEMPLATES) {
      const result = this.register(template);
      if (!result.ok) {
        console.error(`Failed to register builtin template ${template.id}:`, result.error);
      }
    }
    
    // 单独注册概念卡模板（仅用于代码内部，不显示在列表中）
    const conceptResult = this.register(BUILTIN_CONCEPT_TEMPLATE);
    if (!conceptResult.ok) {
      console.error(`Failed to register builtin-concept-simple template:`, conceptResult.error);
    }
  }
}
