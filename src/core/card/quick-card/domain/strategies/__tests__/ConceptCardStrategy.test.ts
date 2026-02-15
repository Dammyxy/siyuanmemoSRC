/**
 * ConceptCardStrategy 单元测试
 */

import { describe, it, expect } from 'vitest';
import { ConceptCardStrategy } from '../ConceptCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('ConceptCardStrategy', () => {
  const strategy = new ConceptCardStrategy();
  
  describe('parse() - :: 符号（概念卡片）', () => {
    it('应该正确解析概念卡片', () => {
      const content = 'DDD::领域驱动设计';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD');
      expect(result.back.html).toBe('DDD<br/>领域驱动设计');
    });
    
    it('应该去除首尾空白', () => {
      const content = '  概念  ::  定义  ';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('概念');
      expect(result.back.html).toBe('概念<br/>定义');
    });
    
    it('应该处理包含换行的定义', () => {
      const content = 'DDD::领域驱动设计\n一种软件开发方法论';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD');
      expect(result.back.html).toBe('DDD<br/>领域驱动设计\n一种软件开发方法论');
    });
    
    it('应该处理包含 HTML 标签的内容', () => {
      const content = '<strong>DDD</strong>::<em>领域驱动设计</em>';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<strong>DDD</strong>');
      expect(result.back.html).toBe('<strong>DDD</strong><br/><em>领域驱动设计</em>');
    });
    
    it('应该处理只有概念没有定义的情况', () => {
      const content = 'DDD::';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD');
      expect(result.back.html).toBe('DDD<br/>');
    });
    
    it('应该处理只有定义没有概念的情况', () => {
      const content = '::领域驱动设计';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('<br/>领域驱动设计');
    });
    
    it('应该处理内容中包含多个符号的情况（只分割第一个）', () => {
      const content = 'DDD::领域驱动设计::更多内容';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD');
      expect(result.back.html).toBe('DDD<br/>领域驱动设计::更多内容');
    });
    
    it('正面应该包含 mark 隐藏类型', () => {
      const content = 'DDD::领域驱动设计';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual(['mark']);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = 'DDD::领域驱动设计';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
    
    it('应该处理长定义', () => {
      const content = 'DDD::领域驱动设计（Domain-Driven Design）是一种软件开发方法论，强调将业务领域的复杂性作为软件设计的核心。';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD');
      expect(result.back.html).toBe('DDD<br/>领域驱动设计（Domain-Driven Design）是一种软件开发方法论，强调将业务领域的复杂性作为软件设计的核心。');
    });
  });
  
  describe('shouldHideContent()', () => {
    it('应该对 mark 类型返回 true', () => {
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.shouldHideContent('mark', metadata);
      
      expect(result).toBe(true);
    });
    
    it('应该对 list 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.shouldHideContent('list', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 heading 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.shouldHideContent('heading', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 superblock 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.shouldHideContent('superblock', metadata);
      
      expect(result).toBe(false);
    });
  });
  
  describe('边界情况', () => {
    it('应该处理空内容', () => {
      const content = '';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('<br/>');
    });
    
    it('应该处理只有符号的内容', () => {
      const content = '::';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('<br/>');
    });
    
    it('应该处理不包含符号的内容', () => {
      const content = '没有符号的内容';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('没有符号的内容');
      expect(result.back.html).toBe('没有符号的内容<br/>');
    });
    
    it('应该处理包含特殊字符的内容', () => {
      const content = 'DDD & 概念::定义 < 标签';
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD & 概念');
      expect(result.back.html).toBe('DDD & 概念<br/>定义 < 标签');
    });
    
    it('应该处理非常长的内容', () => {
      const longText = 'A'.repeat(10000);
      const content = `${longText}::${longText}`;
      const metadata: QuickCardMetadata = { symbol: '::' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe(longText);
      expect(result.back.html).toBe(`${longText}<br/>${longText}`);
    });
  });
});
