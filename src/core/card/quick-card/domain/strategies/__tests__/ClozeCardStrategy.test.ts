/**
 * ClozeCardStrategy 单元测试
 */

import { describe, it, expect } from 'vitest';
import { ClozeCardStrategy } from '../ClozeCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('ClozeCardStrategy', () => {
  const strategy = new ClozeCardStrategy();
  
  describe('parse() - {{}} 符号（填空卡片）', () => {
    it('应该正确解析单个填空', () => {
      const content = 'DDD 的核心是{{领域模型}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域模型</mark>');
    });
    
    it('应该正确解析多个填空', () => {
      const content = 'DDD 的核心是{{领域模型}}和{{通用语言}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]和[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域模型</mark>和<mark>通用语言</mark>');
    });
    
    it('应该处理开头的填空', () => {
      const content = '{{DDD}}是一种软件开发方法论';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...]是一种软件开发方法论');
      expect(result.back.html).toBe('<mark>DDD</mark>是一种软件开发方法论');
    });
    
    it('应该处理结尾的填空', () => {
      const content = '软件开发方法论是{{DDD}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('软件开发方法论是[...]');
      expect(result.back.html).toBe('软件开发方法论是<mark>DDD</mark>');
    });
    
    it('应该处理连续的填空', () => {
      const content = '{{DDD}}{{领域驱动设计}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...][...]');
      expect(result.back.html).toBe('<mark>DDD</mark><mark>领域驱动设计</mark>');
    });
    
    it('应该处理包含空格的填空', () => {
      const content = 'DDD 的核心是{{ 领域模型 }}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark> 领域模型 </mark>');
    });
    
    it('应该处理包含换行的填空', () => {
      const content = 'DDD 的核心是{{领域模型\n通用语言}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域模型\n通用语言</mark>');
    });
    
    it('应该处理空填空', () => {
      const content = 'DDD 的核心是{{}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark></mark>');
    });
    
    it('应该处理包含 HTML 标签的填空', () => {
      const content = 'DDD 的核心是{{<strong>领域模型</strong>}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark><strong>领域模型</strong></mark>');
    });
    
    it('正面不应该包含任何隐藏类型（已在 parse 中处理）', () => {
      const content = 'DDD 的核心是{{领域模型}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual([]);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = 'DDD 的核心是{{领域模型}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
    
    it('应该处理三个以上的填空', () => {
      const content = '{{A}}、{{B}}、{{C}}、{{D}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...]、[...]、[...]、[...]');
      expect(result.back.html).toBe('<mark>A</mark>、<mark>B</mark>、<mark>C</mark>、<mark>D</mark>');
    });
  });
  
  describe('parse() - == 符号（填空卡片）', () => {
    it('应该正确解析单个填空', () => {
      const content = 'DDD 的核心是==领域模型==';
      const metadata: QuickCardMetadata = { symbol: '==' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域模型</mark>');
    });
    
    it('应该正确解析多个填空', () => {
      const content = 'DDD 的核心是==领域模型==和==通用语言==';
      const metadata: QuickCardMetadata = { symbol: '==' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]和[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域模型</mark>和<mark>通用语言</mark>');
    });
    
    it('应该处理开头的填空', () => {
      const content = '==DDD==是一种软件开发方法论';
      const metadata: QuickCardMetadata = { symbol: '==' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...]是一种软件开发方法论');
      expect(result.back.html).toBe('<mark>DDD</mark>是一种软件开发方法论');
    });
    
    it('应该处理结尾的填空', () => {
      const content = '软件开发方法论是==DDD==';
      const metadata: QuickCardMetadata = { symbol: '==' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('软件开发方法论是[...]');
      expect(result.back.html).toBe('软件开发方法论是<mark>DDD</mark>');
    });
    
    it('应该处理连续的填空', () => {
      const content = '==DDD====领域驱动设计==';
      const metadata: QuickCardMetadata = { symbol: '==' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...][...]');
      expect(result.back.html).toBe('<mark>DDD</mark><mark>领域驱动设计</mark>');
    });
  });
  
  describe('parse() - 混合使用 {{}} 和 == 符号', () => {
    it('应该同时处理两种符号', () => {
      const content = '{{DDD}}的核心是==领域模型==和{{通用语言}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...]的核心是[...]和[...]');
      expect(result.back.html).toBe('<mark>DDD</mark>的核心是<mark>领域模型</mark>和<mark>通用语言</mark>');
    });
    
    it('应该处理多个混合填空', () => {
      const content = '==A==、{{B}}、==C==、{{D}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...]、[...]、[...]、[...]');
      expect(result.back.html).toBe('<mark>A</mark>、<mark>B</mark>、<mark>C</mark>、<mark>D</mark>');
    });
  });
  
  describe('parse() - 多填空卡片（typeMarker）', () => {
    it('应该只隐藏第 1 个填空（cloze-0）', () => {
      const content = '==A==、==B==、==C==';
      const metadata: QuickCardMetadata = { symbol: '==', typeMarker: 'cloze-0' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('[...]、<mark>B</mark>、<mark>C</mark>');
      expect(result.back.html).toBe('<mark>A</mark>、B、C');
    });
    
    it('应该只隐藏第 2 个填空（cloze-1）', () => {
      const content = '==A==、==B==、==C==';
      const metadata: QuickCardMetadata = { symbol: '==', typeMarker: 'cloze-1' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<mark>A</mark>、[...]、<mark>C</mark>');
      expect(result.back.html).toBe('A、<mark>B</mark>、C');
    });
    
    it('应该只隐藏第 3 个填空（cloze-2）', () => {
      const content = '==A==、==B==、==C==';
      const metadata: QuickCardMetadata = { symbol: '==', typeMarker: 'cloze-2' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<mark>A</mark>、<mark>B</mark>、[...]');
      expect(result.back.html).toBe('A、B、<mark>C</mark>');
    });
    
    it('应该支持混合符号的多填空', () => {
      const content = '{{A}}、==B==、{{C}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}', typeMarker: 'cloze-1' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<mark>A</mark>、[...]、<mark>C</mark>');
      expect(result.back.html).toBe('A、<mark>B</mark>、C');
    });
  });
  
  describe('shouldHideContent()', () => {
    it('应该对所有类型返回 false（不使用 hiddenTypes 机制）', () => {
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      expect(strategy.shouldHideContent('mark', metadata)).toBe(false);
      expect(strategy.shouldHideContent('list', metadata)).toBe(false);
      expect(strategy.shouldHideContent('heading', metadata)).toBe(false);
      expect(strategy.shouldHideContent('superblock', metadata)).toBe(false);
    });
  });
  
  describe('边界情况', () => {
    it('应该处理空内容', () => {
      const content = '';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理不包含填空的内容', () => {
      const content = '没有填空的内容';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('没有填空的内容');
      expect(result.back.html).toBe('没有填空的内容');
    });
    
    it('应该处理只有左括号的内容', () => {
      const content = 'DDD 的核心是{{领域模型';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是{{领域模型');
      expect(result.back.html).toBe('DDD 的核心是{{领域模型');
    });
    
    it('应该处理只有右括号的内容', () => {
      const content = 'DDD 的核心是领域模型}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是领域模型}}');
      expect(result.back.html).toBe('DDD 的核心是领域模型}}');
    });
    
    it('应该处理嵌套的括号（不支持嵌套）', () => {
      const content = 'DDD 的核心是{{领域{{模型}}}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      // 正则会匹配第一个 {{ 到第一个 }}
      expect(result.front.html).toBe('DDD 的核心是[...]}}');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域{{模型</mark>}}');
    });
    
    it('应该处理包含特殊字符的填空', () => {
      const content = 'DDD 的核心是{{领域 & 模型}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe('DDD 的核心是<mark>领域 & 模型</mark>');
    });
    
    it('应该处理非常长的填空内容', () => {
      const longText = 'A'.repeat(10000);
      const content = `DDD 的核心是{{${longText}}}`;
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的核心是[...]');
      expect(result.back.html).toBe(`DDD 的核心是<mark>${longText}</mark>`);
    });
  });
});
