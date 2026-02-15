/**
 * BasicCardStrategy 单元测试
 */

import { describe, it, expect } from 'vitest';
import { BasicCardStrategy } from '../BasicCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('BasicCardStrategy', () => {
  const strategy = new BasicCardStrategy();
  
  describe('parse() - >> 符号（正向卡片）', () => {
    it('应该正确解析正向卡片', () => {
      const content = '什么是 DDD？ >> 领域驱动设计';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('什么是 DDD？');
      expect(result.back.html).toBe('领域驱动设计');
    });
    
    it('应该去除首尾空白', () => {
      const content = '  问题  >>  答案  ';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题');
      expect(result.back.html).toBe('答案');
    });
    
    it('应该处理包含换行的内容', () => {
      const content = '问题\n多行内容 >> 答案\n也是多行';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题\n多行内容');
      expect(result.back.html).toBe('答案\n也是多行');
    });
    
    it('应该处理包含 HTML 标签的内容', () => {
      const content = '<p>问题</p> >> <p>答案</p>';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<p>问题</p>');
      expect(result.back.html).toBe('<p>答案</p>');
    });
    
    it('应该处理只有问题没有答案的情况', () => {
      const content = '问题 >>';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理只有答案没有问题的情况', () => {
      const content = '>> 答案';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('答案');
    });
    
    it('应该处理内容中包含多个符号的情况（只分割第一个）', () => {
      const content = '问题 >> 答案 >> 更多内容';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题');
      expect(result.back.html).toBe('答案 >> 更多内容');
    });
    
    it('正面不应该包含任何隐藏类型', () => {
      const content = '问题 >> 答案';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual([]);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = '问题 >> 答案';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
  });
  
  describe('parse() - << 符号（反向卡片）', () => {
    it('应该正确解析反向卡片', () => {
      const content = '领域驱动设计 << 什么是 DDD？';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('什么是 DDD？');
      expect(result.back.html).toBe('领域驱动设计');
    });
    
    it('应该去除首尾空白', () => {
      const content = '  答案  <<  问题  ';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题');
      expect(result.back.html).toBe('答案');
    });
    
    it('应该处理包含换行的内容', () => {
      const content = '答案\n多行内容 << 问题\n也是多行';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题\n也是多行');
      expect(result.back.html).toBe('答案\n多行内容');
    });
    
    it('应该处理只有问题没有答案的情况', () => {
      const content = '<< 问题';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理只有答案没有问题的情况', () => {
      const content = '答案 <<';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('答案');
    });
    
    it('应该处理内容中包含多个符号的情况（只分割第一个）', () => {
      const content = '答案 << 问题 << 更多内容';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题 << 更多内容');
      expect(result.back.html).toBe('答案');
    });
    
    it('正面不应该包含任何隐藏类型', () => {
      const content = '答案 << 问题';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual([]);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = '答案 << 问题';
      const metadata: QuickCardMetadata = { symbol: '<<' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
  });
  
  describe('parse() - <> 符号（双向卡片）', () => {
    it('应该正确解析双向卡片', () => {
      const content = 'DDD <> 领域驱动设计';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('DDD');
      expect(result.back.html).toBe('领域驱动设计');
    });
    
    it('应该去除首尾空白', () => {
      const content = '  概念  <>  定义  ';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('概念');
      expect(result.back.html).toBe('定义');
    });
    
    it('应该处理包含换行的内容', () => {
      const content = '概念\n多行内容 <> 定义\n也是多行';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('概念\n多行内容');
      expect(result.back.html).toBe('定义\n也是多行');
    });
    
    it('应该处理只有左侧没有右侧的情况', () => {
      const content = '概念 <>';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('概念');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理只有右侧没有左侧的情况', () => {
      const content = '<> 定义';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('定义');
    });
    
    it('应该处理内容中包含多个符号的情况（只分割第一个）', () => {
      const content = '概念 <> 定义 <> 更多内容';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('概念');
      expect(result.back.html).toBe('定义 <> 更多内容');
    });
    
    it('正面不应该包含任何隐藏类型', () => {
      const content = '概念 <> 定义';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual([]);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = '概念 <> 定义';
      const metadata: QuickCardMetadata = { symbol: '<>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
  });
  
  describe('shouldHideContent()', () => {
    it('应该对 mark 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.shouldHideContent('mark', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 list 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.shouldHideContent('list', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 heading 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.shouldHideContent('heading', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 superblock 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.shouldHideContent('superblock', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对所有符号类型都返回 false', () => {
      const symbols = ['>>', '<<', '<>'];
      const contentTypes: Array<'mark' | 'list' | 'heading' | 'superblock'> = [
        'mark',
        'list',
        'heading',
        'superblock',
      ];
      
      for (const symbol of symbols) {
        for (const contentType of contentTypes) {
          const metadata: QuickCardMetadata = { symbol };
          const result = strategy.shouldHideContent(contentType, metadata);
          expect(result).toBe(false);
        }
      }
    });
  });
  
  describe('边界情况', () => {
    it('应该处理空内容', () => {
      const content = '';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理只有符号的内容', () => {
      const content = '>>';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理不包含符号的内容', () => {
      const content = '没有符号的内容';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('没有符号的内容');
      expect(result.back.html).toBe('');
    });
    
    it('应该处理包含特殊字符的内容', () => {
      const content = '问题 & 符号 >> 答案 < 标签';
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('问题 & 符号');
      expect(result.back.html).toBe('答案 < 标签');
    });
    
    it('应该处理非常长的内容', () => {
      const longText = 'A'.repeat(10000);
      const content = `${longText} >> ${longText}`;
      const metadata: QuickCardMetadata = { symbol: '>>' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe(longText);
      expect(result.back.html).toBe(longText);
    });
  });
});
