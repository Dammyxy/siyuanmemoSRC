/**
 * TemplateRegistry 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateRegistry } from '../TemplateRegistry';
import type { ICardTemplate } from '../../types';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  describe('内置模板注册', () => {
    it('应该自动注册所有内置模板', () => {
      const builtinTemplates = registry.getBuiltin();
      expect(builtinTemplates.length).toBeGreaterThan(0);
    });

    it('应该包含 builtin-basic-qa 模板', () => {
      const template = registry.get('builtin-basic-qa');
      expect(template).toBeDefined();
      expect(template?.name).toBe('基础问答');
    });

    it('应该包含 builtin-bidirectional 模板', () => {
      const template = registry.get('builtin-bidirectional');
      expect(template).toBeDefined();
      expect(template?.name).toBe('双向卡片');
    });

    it('应该包含 builtin-quick-card 模板', () => {
      const template = registry.get('builtin-quick-card');
      expect(template).toBeDefined();
      expect(template?.name).toBe('符号卡片');
    });

    it('应该包含 builtin-bidirectional-single 模板', () => {
      const template = registry.get('builtin-bidirectional-single');
      expect(template).toBeDefined();
      expect(template?.name).toBe('双向卡片');
    });

    it('应该包含 builtin-concept-simple 模板', () => {
      const template = registry.get('builtin-concept-simple');
      expect(template).toBeDefined();
      expect(template?.name).toBe('概念卡（简单）');
    });

    it('应该包含 builtin-concept-descriptor 模板', () => {
      const template = registry.get('builtin-concept-descriptor');
      expect(template).toBeDefined();
      expect(template?.name).toBe('概念-描述符');
    });

    it('应该包含 builtin-symbol-qa 模板', () => {
      const template = registry.get('builtin-symbol-qa');
      expect(template).toBeDefined();
      expect(template?.name).toBe('符号问答卡');
    });

    it('应该包含 builtin-quick-bidirectional 模板', () => {
      const template = registry.get('builtin-quick-bidirectional');
      expect(template).toBeDefined();
      expect(template?.name).toBe('快速制卡双向');
    });

    it('应该包含 builtin-list-item 模板', () => {
      const template = registry.get('builtin-list-item');
      expect(template).toBeDefined();
      expect(template?.name).toBe('列表项模版');
    });
  });

  describe('模板查询', () => {
    it('get() 应该返回存在的模板', () => {
      const template = registry.get('builtin-basic-qa');
      expect(template).toBeDefined();
      expect(template?.id).toBe('builtin-basic-qa');
    });

    it('get() 应该对不存在的模板返回 undefined', () => {
      const template = registry.get('non-existent-template');
      expect(template).toBeUndefined();
    });

    it('getAll() 应该返回所有模板', () => {
      const allTemplates = registry.getAll();
      expect(allTemplates.length).toBeGreaterThan(0);
      expect(allTemplates.every(t => t.id && t.name)).toBe(true);
    });

    it('getBuiltin() 应该只返回内置模板', () => {
      const builtinTemplates = registry.getBuiltin();
      expect(builtinTemplates.every(t => t.id.startsWith('builtin-'))).toBe(true);
    });

    it('getCustom() 应该只返回自定义模板', () => {
      // 注册一个自定义模板
      const customTemplate: ICardTemplate = {
        id: 'custom-test',
        name: '测试模板',
        fields: [{ name: 'field1' }],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['field1'],
          },
        ],
      };
      registry.register(customTemplate);

      const customTemplates = registry.getCustom();
      expect(customTemplates.length).toBeGreaterThan(0);
      expect(customTemplates.every(t => !t.id.startsWith('builtin-'))).toBe(true);
      expect(customTemplates.some(t => t.id === 'custom-test')).toBe(true);
    });
  });

  describe('模板注册', () => {
    it('应该成功注册有效的模板', () => {
      const template: ICardTemplate = {
        id: 'test-template',
        name: '测试模板',
        fields: [
          { name: 'question', description: '问题' },
          { name: 'answer', description: '答案' },
        ],
        cardRules: [
          {
            typeMarker: 'qa',
            frontFields: ['question'],
            backFields: ['answer'],
          },
        ],
      };

      const result = registry.register(template);
      expect(result.ok).toBe(true);

      const retrieved = registry.get('test-template');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('测试模板');
    });

    it('应该拒绝缺少 id 的模板', () => {
      const template = {
        name: '无效模板',
        fields: [{ name: 'field1' }],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['field1'],
          },
        ],
      } as ICardTemplate;

      const result = registry.register(template);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Missing template id');
    });

    it('应该拒绝缺少 name 的模板', () => {
      const template = {
        id: 'test-template',
        fields: [{ name: 'field1' }],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['field1'],
          },
        ],
      } as ICardTemplate;

      const result = registry.register(template);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Missing template name');
    });

    it('应该拒绝没有字段的模板', () => {
      const template: ICardTemplate = {
        id: 'test-template',
        name: '测试模板',
        fields: [],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: [],
            backFields: [],
          },
        ],
      };

      const result = registry.register(template);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('must have at least one field');
    });

    it('应该拒绝没有卡片规则的模板', () => {
      const template: ICardTemplate = {
        id: 'test-template',
        name: '测试模板',
        fields: [{ name: 'field1' }],
        cardRules: [],
      };

      const result = registry.register(template);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('must have at least one card rule');
    });

    it('应该拒绝有重复字段名的模板', () => {
      const template: ICardTemplate = {
        id: 'test-template',
        name: '测试模板',
        fields: [
          { name: 'field1' },
          { name: 'field1' }, // 重复
        ],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['field1'],
          },
        ],
      };

      const result = registry.register(template);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Duplicate field name: field1');
    });

    it('应该拒绝引用不存在字段的模板', () => {
      const template: ICardTemplate = {
        id: 'test-template',
        name: '测试模板',
        fields: [{ name: 'field1' }],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['non-existent-field'], // 不存在的字段
          },
        ],
      };

      const result = registry.register(template);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('non-existent field: non-existent-field');
    });
  });

  describe('模板验证', () => {
    it('validateTemplate() 应该返回空数组对于有效模板', () => {
      const template: ICardTemplate = {
        id: 'test-template',
        name: '测试模板',
        fields: [{ name: 'field1' }],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['field1'],
          },
        ],
      };

      const errors = registry.validateTemplate(template);
      expect(errors).toEqual([]);
    });

    it('validateTemplate() 应该返回所有验证错误', () => {
      const template = {
        // 缺少 id 和 name
        fields: [],
        cardRules: [],
      } as ICardTemplate;

      const errors = registry.validateTemplate(template);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Missing template id');
      expect(errors).toContain('Missing template name');
      expect(errors).toContain('Template must have at least one field');
      expect(errors).toContain('Template must have at least one card rule');
    });

    it('validateTemplate() 应该检测重复字段名', () => {
      const template: ICardTemplate = {
        id: 'test',
        name: '测试',
        fields: [
          { name: 'field1' },
          { name: 'field2' },
          { name: 'field1' }, // 重复
        ],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['field1'],
            backFields: ['field2'],
          },
        ],
      };

      const errors = registry.validateTemplate(template);
      expect(errors).toContain('Duplicate field name: field1');
    });

    it('validateTemplate() 应该检测无效的字段引用', () => {
      const template: ICardTemplate = {
        id: 'test',
        name: '测试',
        fields: [{ name: 'field1' }],
        cardRules: [
          {
            typeMarker: 'test',
            frontFields: ['invalid-field'],
            backFields: ['field1'],
          },
        ],
      };

      const errors = registry.validateTemplate(template);
      expect(errors).toContain('Card rule references non-existent field: invalid-field');
    });
  });
});
