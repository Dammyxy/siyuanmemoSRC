/**
 * MultiLineCardStrategy 单元测试
 */

import { describe, it, expect } from 'vitest';
import { MultiLineCardStrategy } from '../MultiLineCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('MultiLineCardStrategy', () => {
  const strategy = new MultiLineCardStrategy();
  
  describe('parse() - >>> 符号（列表模版卡片）', () => {
    it('应该正确解析列表模版卡片', () => {
      const content = '>>> DDD 的四层架构';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的四层架构');
      expect(result.back.html).toBe('DDD 的四层架构');
    });
    
    it('应该去除符号后的首尾空白', () => {
      const content = '>>>  问题内容  ';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题内容');
      expect(result.back.html).toBe('问题内容');
    });
    
    it('应该处理包含换行的内容', () => {
      const content = '>>> DDD 的四层架构\n- 表现层\n- 应用层';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的四层架构\n- 表现层\n- 应用层');
      expect(result.back.html).toBe('DDD 的四层架构\n- 表现层\n- 应用层');
    });
    
    it('应该处理包含 HTML 标签的内容', () => {
      const content = '>>> <p>DDD 的四层架构</p>';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<p>DDD 的四层架构</p>');
      expect(result.back.html).toBe('<p>DDD 的四层架构</p>');
    });
    
    it('应该处理只有符号的内容', () => {
      const content = '>>>';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理符号后没有内容的情况', () => {
      const content = '>>>   ';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理内容中包含多个符号的情况（只移除第一个）', () => {
      const content = '>>> 问题 >>> 更多内容';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题 >>> 更多内容');
      expect(result.back.html).toBe('问题 >>> 更多内容');
    });
    
    it('正面应该包含 list 隐藏类型', () => {
      const content = '>>> DDD 的四层架构';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual(['list']);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = '>>> DDD 的四层架构';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
    
    it('应该处理包含列表项的内容', () => {
      const content = '>>> DDD 的四层架构\n- 表现层\n- 应用层\n- 领域层\n- 基础设施层';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的四层架构\n- 表现层\n- 应用层\n- 领域层\n- 基础设施层');
      expect(result.back.html).toBe('DDD 的四层架构\n- 表现层\n- 应用层\n- 领域层\n- 基础设施层');
    });
    
    it('应该处理包含嵌套列表的内容', () => {
      const content = '>>> DDD 的四层架构\n- 表现层\n  - UI 组件\n  - 视图模型\n- 应用层';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD 的四层架构\n- 表现层\n  - UI 组件\n  - 视图模型\n- 应用层');
      expect(result.back.html).toBe('DDD 的四层架构\n- 表现层\n  - UI 组件\n  - 视图模型\n- 应用层');
    });
  });
  
  describe('shouldHideContent()', () => {
    it('应该对 list 类型返回 true', () => {
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.shouldHideContent('list', metadata);
      
      expect(result).toBe(true);
    });
    
    it('应该对 mark 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.shouldHideContent('mark', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 heading 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.shouldHideContent('heading', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 superblock 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.shouldHideContent('superblock', metadata);
      
      expect(result).toBe(false);
    });
  });
  
  describe('边界情况', () => {
    it('应该处理空内容', () => {
      const content = '';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理不包含符号的内容', () => {
      const content = '没有符号的内容';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('没有符号的内容');
      expect(result.back.html).toBe('没有符号的内容');
    });
    
    it('应该处理包含特殊字符的内容', () => {
      const content = '>>> 问题 & 符号 < 标签';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题 & 符号 < 标签');
      expect(result.back.html).toBe('问题 & 符号 < 标签');
    });
    
    it('应该处理非常长的内容', () => {
      const longText = 'A'.repeat(10000);
      const content = `>>> ${longText}`;
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe(longText);
      expect(result.back.html).toBe(longText);
    });
    
    it('应该处理符号在中间的情况', () => {
      const content = '前面内容 >>> 后面内容';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      // replace 只会替换第一个匹配
      expect(result.front.html).toBe('前面内容  后面内容');
      expect(result.back.html).toBe('前面内容  后面内容');
    });
    
    it('应该处理符号在末尾的情况', () => {
      const content = '内容 >>>';
      const metadata: QuickCardMetadata = { symbol: '>>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('内容');
      expect(result.back.html).toBe('内容');
    });
  });
});
