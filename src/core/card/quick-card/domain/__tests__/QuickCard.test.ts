/**
 * QuickCard 实体单元测试
 */

import { describe, it, expect } from 'vitest';
import { QuickCard } from '../QuickCard';
import { CardFace } from '../CardFace';
import type { QuickCardType } from '../types';

describe('QuickCard', () => {
  describe('构造函数', () => {
    it('应该正确创建 QuickCard 实例', () => {
      const frontFace = new CardFace({
        html: '<p>问题</p>',
        hiddenTypes: [],
      });
      
      const backFace = new CardFace({
        html: '<p>答案</p>',
        hiddenTypes: [],
      });
      
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: frontFace,
        backContent: backFace,
        metadata: { symbol: '>>' },
      });
      
      expect(card.id).toBe('card-123');
      expect(card.blockId).toBe('block-456');
      expect(card.type).toBe('basic');
      expect(card.frontContent).toBe(frontFace);
      expect(card.backContent).toBe(backFace);
      expect(card.metadata.symbol).toBe('>>');
    });
    
    it('应该创建包含完整元数据的 QuickCard', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'descriptor',
        frontContent: new CardFace({ html: '<p>描述符</p>', hiddenTypes: [] }),
        backContent: new CardFace({ html: '<p>描述内容</p>', hiddenTypes: [] }),
        metadata: {
          symbol: ';;',
          parentBlockId: 'parent-789',
          isXiuyuanTemplate: true,
        },
      });
      
      expect(card.metadata.symbol).toBe(';;');
      expect(card.metadata.parentBlockId).toBe('parent-789');
      expect(card.metadata.isXiuyuanTemplate).toBe(true);
    });
    
    it('应该创建不同类型的快速卡片', () => {
      const types: QuickCardType[] = ['basic', 'concept', 'descriptor', 'cloze', 'multiLine'];
      
      types.forEach(type => {
        const card = new QuickCard({
          id: `card-${type}`,
          blockId: 'block-123',
          type,
          frontContent: new CardFace({ html: '<p>正面</p>', hiddenTypes: [] }),
          backContent: new CardFace({ html: '<p>反面</p>', hiddenTypes: [] }),
          metadata: { symbol: '>>' },
        });
        
        expect(card.type).toBe(type);
      });
    });
  });
  
  describe('getFace()', () => {
    it('应该返回正面内容', () => {
      const frontFace = new CardFace({
        html: '<p>问题</p>',
        hiddenTypes: ['mark'],
      });
      
      const backFace = new CardFace({
        html: '<p>答案</p>',
        hiddenTypes: [],
      });
      
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: frontFace,
        backContent: backFace,
        metadata: { symbol: '>>' },
      });
      
      const face = card.getFace('front');
      
      expect(face).toBe(frontFace);
      expect(face.html).toBe('<p>问题</p>');
      expect(face.hiddenTypes).toEqual(['mark']);
    });
    
    it('应该返回反面内容', () => {
      const frontFace = new CardFace({
        html: '<p>问题</p>',
        hiddenTypes: ['mark'],
      });
      
      const backFace = new CardFace({
        html: '<p>答案</p>',
        hiddenTypes: [],
      });
      
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: frontFace,
        backContent: backFace,
        metadata: { symbol: '>>' },
      });
      
      const face = card.getFace('back');
      
      expect(face).toBe(backFace);
      expect(face.html).toBe('<p>答案</p>');
      expect(face.hiddenTypes).toEqual([]);
    });
    
    it('应该正确区分正反面', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({ html: '<p>正面</p>', hiddenTypes: ['mark'] }),
        backContent: new CardFace({ html: '<p>反面</p>', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });
      
      const front = card.getFace('front');
      const back = card.getFace('back');
      
      expect(front).not.toBe(back);
      expect(front.html).toBe('<p>正面</p>');
      expect(back.html).toBe('<p>反面</p>');
    });
  });
  
  describe('shouldHideContent()', () => {
    it('应该返回 true 当正面包含指定的隐藏类型', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'cloze',
        frontContent: new CardFace({
          html: '<p>填空题</p>',
          hiddenTypes: ['mark'],
        }),
        backContent: new CardFace({
          html: '<p>答案</p>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '{{}}' },
      });
      
      expect(card.shouldHideContent('mark')).toBe(true);
    });
    
    it('应该返回 false 当正面不包含指定的隐藏类型', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({
          html: '<p>问题</p>',
          hiddenTypes: [],
        }),
        backContent: new CardFace({
          html: '<p>答案</p>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '>>' },
      });
      
      expect(card.shouldHideContent('mark')).toBe(false);
      expect(card.shouldHideContent('list')).toBe(false);
      expect(card.shouldHideContent('heading')).toBe(false);
      expect(card.shouldHideContent('superblock')).toBe(false);
    });
    
    it('应该正确判断多个隐藏类型', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'multiLine',
        frontContent: new CardFace({
          html: '<p>问题</p>',
          hiddenTypes: ['mark', 'list', 'heading'],
        }),
        backContent: new CardFace({
          html: '<p>答案</p>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '>>>' },
      });
      
      expect(card.shouldHideContent('mark')).toBe(true);
      expect(card.shouldHideContent('list')).toBe(true);
      expect(card.shouldHideContent('heading')).toBe(true);
      expect(card.shouldHideContent('superblock')).toBe(false);
    });
    
    it('应该只检查正面的隐藏类型，不受反面影响', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({
          html: '<p>正面</p>',
          hiddenTypes: ['mark'],
        }),
        backContent: new CardFace({
          html: '<p>反面</p>',
          hiddenTypes: ['list', 'heading'],
        }),
        metadata: { symbol: '>>' },
      });
      
      // 只检查正面的隐藏类型
      expect(card.shouldHideContent('mark')).toBe(true);
      expect(card.shouldHideContent('list')).toBe(false);
      expect(card.shouldHideContent('heading')).toBe(false);
    });
  });
  
  describe('实体特性', () => {
    it('应该是不可变的（所有属性只读）', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({ html: '<p>正面</p>', hiddenTypes: [] }),
        backContent: new CardFace({ html: '<p>反面</p>', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });
      
      // TypeScript 会在编译时阻止修改 readonly 属性
      expect(card.id).toBe('card-123');
      expect(card.blockId).toBe('block-456');
      expect(card.type).toBe('basic');
    });
    
    it('应该通过 id 标识唯一性', () => {
      const card1 = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({ html: '<p>正面</p>', hiddenTypes: [] }),
        backContent: new CardFace({ html: '<p>反面</p>', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });
      
      const card2 = new QuickCard({
        id: 'card-456',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({ html: '<p>正面</p>', hiddenTypes: [] }),
        backContent: new CardFace({ html: '<p>反面</p>', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });
      
      // 不同的 id 表示不同的卡片
      expect(card1.id).not.toBe(card2.id);
    });
    
    it('应该通过 blockId 关联思源块', () => {
      const card = new QuickCard({
        id: 'card-123',
        blockId: 'block-456',
        type: 'basic',
        frontContent: new CardFace({ html: '<p>正面</p>', hiddenTypes: [] }),
        backContent: new CardFace({ html: '<p>反面</p>', hiddenTypes: [] }),
        metadata: { symbol: '>>' },
      });
      
      expect(card.blockId).toBe('block-456');
    });
  });
  
  describe('业务场景测试', () => {
    it('应该支持基础卡片场景', () => {
      const card = new QuickCard({
        id: 'card-basic',
        blockId: 'block-123',
        type: 'basic',
        frontContent: new CardFace({
          html: '<p>什么是 DDD？</p>',
          hiddenTypes: [],
        }),
        backContent: new CardFace({
          html: '<p>领域驱动设计</p>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '>>' },
      });
      
      expect(card.type).toBe('basic');
      expect(card.getFace('front').html).toBe('<p>什么是 DDD？</p>');
      expect(card.getFace('back').html).toBe('<p>领域驱动设计</p>');
      expect(card.shouldHideContent('mark')).toBe(false);
    });
    
    it('应该支持填空卡片场景', () => {
      const card = new QuickCard({
        id: 'card-cloze',
        blockId: 'block-123',
        type: 'cloze',
        frontContent: new CardFace({
          html: '<p>DDD 的核心是[...]和[...]</p>',
          hiddenTypes: ['mark'],
        }),
        backContent: new CardFace({
          html: '<p>DDD 的核心是<mark>领域模型</mark>和<mark>通用语言</mark></p>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '{{}}' },
      });
      
      expect(card.type).toBe('cloze');
      expect(card.shouldHideContent('mark')).toBe(true);
      expect(card.getFace('front').getCssClasses()).toContain('card__block--hidemark');
      expect(card.getFace('back').getCssClasses()).toEqual([]);
    });
    
    it('应该支持列表模版卡片场景', () => {
      const card = new QuickCard({
        id: 'card-multiline',
        blockId: 'block-123',
        type: 'multiLine',
        frontContent: new CardFace({
          html: '<p>DDD 的四层架构</p>',
          hiddenTypes: ['list'],
        }),
        backContent: new CardFace({
          html: '<p>DDD 的四层架构</p><ul><li>表现层</li><li>应用层</li><li>领域层</li><li>基础设施层</li></ul>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '>>>' },
      });
      
      expect(card.type).toBe('multiLine');
      expect(card.shouldHideContent('list')).toBe(true);
      expect(card.getFace('front').getCssClasses()).toContain('card__block--hideli');
    });
    
    it('应该支持概念卡片场景', () => {
      const card = new QuickCard({
        id: 'card-concept',
        blockId: 'block-123',
        type: 'concept',
        frontContent: new CardFace({
          html: '<p>DDD</p>',
          hiddenTypes: ['mark'],
        }),
        backContent: new CardFace({
          html: '<p>DDD</p><br/><p>领域驱动设计，一种软件开发方法论</p>',
          hiddenTypes: [],
        }),
        metadata: { symbol: '::' },
      });
      
      expect(card.type).toBe('concept');
      expect(card.getFace('front').html).toBe('<p>DDD</p>');
    });
    
    it('应该支持描述符卡片场景（Xiuyuan 模版）', () => {
      const card = new QuickCard({
        id: 'card-descriptor',
        blockId: 'block-123',
        type: 'descriptor',
        frontContent: new CardFace({
          html: '<p>优点（关于：DDD）</p>',
          hiddenTypes: ['mark'],
        }),
        backContent: new CardFace({
          html: '<p>优点</p><br/><p>提高代码可维护性</p>',
          hiddenTypes: [],
        }),
        metadata: {
          symbol: ';;',
          parentBlockId: 'parent-456',
          isXiuyuanTemplate: true,
        },
      });
      
      expect(card.type).toBe('descriptor');
      expect(card.metadata.isXiuyuanTemplate).toBe(true);
      expect(card.metadata.parentBlockId).toBe('parent-456');
    });
  });
});
