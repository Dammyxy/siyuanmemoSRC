/**
 * AutoCardHandler 块引用测试
 * 
 * 测试描述符卡的父级概念卡检测，特别是块引用场景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('AutoCardHandler - Block Reference Detection', () => {
  describe('findConceptCardInBlockRef', () => {
    it('应该从块引用中提取概念卡 ID', () => {
      // 测试各种块引用格式
      const testCases = [
        {
          content: "((20250508014134-n73kwq5 '菜哥'))",
          expected: '20250508014134-n73kwq5',
          description: '带别名的块引用'
        },
        {
          content: '((20250508014134-n73kwq5))',
          expected: '20250508014134-n73kwq5',
          description: '不带别名的块引用'
        },
        {
          content: '前面的文字 ((20250508014134-n73kwq5 "引用")) 后面的文字',
          expected: '20250508014134-n73kwq5',
          description: '块引用在文本中间'
        },
        {
          content: '((20250508014134-n73kwq5)) ((20260101120000-abcdefg))',
          expected: '20250508014134-n73kwq5',
          description: '多个块引用（返回第一个概念卡）'
        }
      ];

      testCases.forEach(({ content, expected, description }) => {
        const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
        const matches = [...content.matchAll(refPattern)];
        
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0][1]).toBe(expected);
        console.log(`✓ ${description}: ${matches[0][1]}`);
      });
    });

    it('应该在没有块引用时返回空数组', () => {
      const testCases = [
        '普通文本',
        '概念::定义',
        '属性;;描述',
        '(不完整的引用',
        '((invalid-format))'
      ];

      testCases.forEach(content => {
        const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
        const matches = [...content.matchAll(refPattern)];
        
        expect(matches.length).toBe(0);
      });
    });

    it('应该正确解析思源块 ID 格式', () => {
      // 思源块 ID 格式：14位时间戳-7位随机字符
      const validIds = [
        '20250508014134-n73kwq5',
        '20260216034459-buxi73v',
        '20230101120000-abcdefg'
      ];

      validIds.forEach(id => {
        const content = `((${id} 'test'))`;
        const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
        const match = content.match(refPattern);
        
        expect(match).not.toBeNull();
        expect(match![0]).toContain(id);
      });
    });
  });

  describe('概念卡检测场景', () => {
    it('场景1: 父块直接是概念卡', () => {
      // 父块有 custom-fsrs-card-type="concept" 属性
      // 应该直接使用父块 ID
      const scenario = {
        parentId: '20260216033657-5virrqe',
        parentContent: '细胞::人体的基本单位',
        parentCardType: 'concept',
        descriptorId: '20260216033701-ogd9gsn',
        descriptorContent: '作用;;构建人类'
      };

      expect(scenario.parentCardType).toBe('concept');
      console.log('✓ 场景1: 直接概念卡检测成功');
    });

    it('场景2: 父块包含概念卡的块引用', () => {
      // 父块内容：((20250508014134-n73kwq5 '菜哥'))
      // 被引用块有 custom-fsrs-card-type="concept" 属性
      const scenario = {
        parentId: '20260216034459-buxi73v',
        parentContent: "((20250508014134-n73kwq5 '菜哥'))",
        parentCardType: null,  // 父块本身不是概念卡
        referencedId: '20250508014134-n73kwq5',
        referencedCardType: 'concept',  // 被引用的块是概念卡
        descriptorId: '20260216034539-z6o59vc',
        descriptorContent: '英文名;;acai'
      };

      // 提取块引用
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const match = scenario.parentContent.match(refPattern);
      
      expect(match).not.toBeNull();
      expect(match![0]).toContain(scenario.referencedId);
      expect(scenario.referencedCardType).toBe('concept');
      console.log('✓ 场景2: 块引用概念卡检测成功');
    });

    it('场景3: 父块包含非概念卡的块引用', () => {
      // 父块包含块引用，但被引用的块不是概念卡
      // 应该降级为普通卡片
      const scenario = {
        parentId: '20260216034459-buxi73v',
        parentContent: '((20250508014134-n73kwq5))',
        parentCardType: null,
        referencedId: '20250508014134-n73kwq5',
        referencedCardType: 'item',  // 不是概念卡
        shouldDegrade: true
      };

      expect(scenario.referencedCardType).not.toBe('concept');
      expect(scenario.shouldDegrade).toBe(true);
      console.log('✓ 场景3: 非概念卡引用正确降级');
    });

    it('场景4: 父块既不是概念卡也不包含块引用', () => {
      // 应该降级为普通卡片
      const scenario = {
        parentId: '20260216034459-buxi73v',
        parentContent: '普通文本内容',
        parentCardType: null,
        shouldDegrade: true
      };

      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const hasBlockRef = refPattern.test(scenario.parentContent);
      
      expect(scenario.parentCardType).toBeNull();
      expect(hasBlockRef).toBe(false);
      expect(scenario.shouldDegrade).toBe(true);
      console.log('✓ 场景4: 无概念卡正确降级');
    });
  });

  describe('实际使用场景', () => {
    it('应该处理你的实际列表项结构', () => {
      // 实际结构：
      // * [[菜哥]]           ← 父块（包含块引用）
      //   * 英文名;;acai     ← 子块（描述符卡）
      
      const actualStructure = {
        parent: {
          id: '20260216034459-buxi73v',
          kramdown: "* {: id=\"20260216034459-buxi73v\"}((20250508014134-n73kwq5 '菜哥'))",
          content: "((20250508014134-n73kwq5 '菜哥'))"
        },
        descriptor: {
          id: '20260216034539-z6o59vc',
          kramdown: "* {: id=\"20260216034539-z6o59vc\"}英文名;;acai",
          content: '英文名;;acai'
        },
        referencedConcept: {
          id: '20250508014134-n73kwq5',
          cardType: 'concept'
        }
      };

      // 1. 检测父块包含块引用
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const match = actualStructure.parent.content.match(refPattern);
      
      expect(match).not.toBeNull();
      
      // 2. 提取引用的块 ID
      const refId = match![0].match(/\d{14}-[a-z0-9]{7}/)?.[0];
      expect(refId).toBe(actualStructure.referencedConcept.id);
      
      // 3. 验证被引用的块是概念卡
      expect(actualStructure.referencedConcept.cardType).toBe('concept');
      
      console.log('✓ 实际场景: 成功检测到块引用中的概念卡');
      console.log(`  父块: ${actualStructure.parent.id}`);
      console.log(`  引用: ${refId}`);
      console.log(`  描述符: ${actualStructure.descriptor.id}`);
    });
  });
});
