/**
 * 描述符卡实体单元测试
 */

import { describe, it, expect } from 'vitest';
import { DescriptorCard } from '../domain/DescriptorCard';
import type { DescriptorCardData } from '../domain/DescriptorCard';
import type { ParentConceptBlock } from '../infrastructure/DescriptorCardRepository';

describe('DescriptorCard', () => {
  describe('构造函数', () => {
    it('应该正确解析描述符内容', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.attribute).toBe('功能');
      expect(card.description).toBe('生成 ATP');
    });

    it('应该处理没有 ;; 符号的内容', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '这是一个没有符号的内容',
        html: '<p>这是一个没有符号的内容</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.attribute).toBe('defaultAttribute');
      expect(card.description).toBe('这是一个没有符号的内容');
    });

    it('应该处理多个 ;; 符号', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '属性 ;; 描述 ;; 更多描述',
        html: '<p>属性 ;; 描述 ;; 更多描述</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.attribute).toBe('属性');
      expect(card.description).toBe('描述 ;; 更多描述');
    });
  });

  describe('getParentConceptTitle', () => {
    it('应该提取概念标题（:: 前面的部分）', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '细胞 :: 生物体的基本单位',
        html: '<p>细胞 :: 生物体的基本单位</p>',
        isConceptCard: true,
        cardTypeMarker: 'concept',
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getParentConceptTitle()).toBe('细胞');
    });

    it('应该处理没有 :: 符号的父概念', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '这是一个很长的父概念内容，没有双冒号符号，应该被截断到50个字符',
        html: '<p>这是一个很长的父概念内容</p>',
        isConceptCard: false,
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getParentConceptTitle()).toBe('这是一个很长的父概念内容，没有双冒号符号，应该被截断到50个字符');
      expect(card.getParentConceptTitle().length).toBeLessThanOrEqual(50);
    });

    it('应该处理没有父概念的情况', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getParentConceptTitle()).toBe('');
    });
  });

  describe('getParentConceptPreview', () => {
    it('应该提取概念预览（:: 后面的部分）', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '细胞 :: 生物体的基本单位',
        html: '<p>细胞 :: 生物体的基本单位</p>',
        isConceptCard: true,
        cardTypeMarker: 'concept',
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getParentConceptPreview()).toBe('生物体的基本单位');
    });

    it('应该处理没有 :: 符号的父概念', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '完整的父概念内容',
        html: '<p>完整的父概念内容</p>',
        isConceptCard: false,
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getParentConceptPreview()).toBe('完整的父概念内容');
    });
  });

  describe('hasParentConcept', () => {
    it('应该返回 true 当有父概念时', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '细胞 :: 生物体的基本单位',
        html: '<p>细胞 :: 生物体的基本单位</p>',
        isConceptCard: true,
        cardTypeMarker: 'concept',
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.hasParentConcept()).toBe(true);
    });

    it('应该返回 false 当没有父概念时', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.hasParentConcept()).toBe(false);
    });
  });

  describe('isParentConceptCard', () => {
    it('应该返回 true 当父概念是概念卡时', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '细胞 :: 生物体的基本单位',
        html: '<p>细胞 :: 生物体的基本单位</p>',
        isConceptCard: true,
        cardTypeMarker: 'concept',
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.isParentConceptCard()).toBe(true);
    });

    it('应该返回 false 当父概念不是概念卡时', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '普通块',
        html: '<p>普通块</p>',
        isConceptCard: false,
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.isParentConceptCard()).toBe(false);
    });

    it('应该返回 false 当没有父概念时', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.isParentConceptCard()).toBe(false);
    });
  });

  describe('getWarning', () => {
    it('应该返回警告当没有父概念时', () => {
      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept: null,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getWarning()).toBe('warningNoParentConcept');
    });

    it('应该返回警告当父块不是概念卡时', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '普通块',
        html: '<p>普通块</p>',
        isConceptCard: false,
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getWarning()).toBe('warningParentNotConceptCard');
    });

    it('应该返回 null 当一切正常时', () => {
      const parentConcept: ParentConceptBlock = {
        blockId: 'parent-1',
        content: '细胞 :: 生物体的基本单位',
        html: '<p>细胞 :: 生物体的基本单位</p>',
        isConceptCard: true,
        cardTypeMarker: 'concept',
      };

      const data: DescriptorCardData = {
        blockId: 'block-1',
        content: '功能 ;; 生成 ATP',
        html: '<p>功能 ;; 生成 ATP</p>',
        parentConcept,
        siblingDescriptors: [],
      };

      const card = new DescriptorCard(data);

      expect(card.getWarning()).toBeNull();
    });
  });
});
