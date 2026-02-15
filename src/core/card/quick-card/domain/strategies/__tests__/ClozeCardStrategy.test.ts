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
    
    it('正面应该包含 mark 隐藏类型', () => {
      const content = 'DDD 的核心是{{领域模型}}';
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual(['mark']);
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
  
  describe('shouldHideContent()', () => {
    it('应该对 mark 类型返回 true', () => {
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.shouldHideContent('mark', metadata);
      
      expect(result).toBe(true);
    });
    
    it('应该对 list 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.shouldHideContent('list', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 heading 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.shouldHideContent('heading', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 superblock 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '{{}}' };
      
      const result = strategy.shouldHideContent('superblock', metadata);
      
      expect(result).toBe(false);
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
