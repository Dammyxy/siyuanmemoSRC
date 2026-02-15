/**
 * DescriptorCardStrategy 单元测试
 */

import { describe, it, expect } from 'vitest';
import { DescriptorCardStrategy } from '../DescriptorCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('DescriptorCardStrategy', () => {
  const strategy = new DescriptorCardStrategy();
  
  describe('parse() - ;; 符号（描述符卡片 - 基础模式）', () => {
    it('应该正确解析描述符卡片', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点');
      expect(result.back.html).toBe('特点<br/>易于扩展');
    });
    
    it('应该去除首尾空白', () => {
      const content = '  描述符  ;;  描述内容  ';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('描述符');
      expect(result.back.html).toBe('描述符<br/>描述内容');
    });
    
    it('应该处理包含换行的描述', () => {
      const content = '特点;;易于扩展\n支持多种卡片类型';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点');
      expect(result.back.html).toBe('特点<br/>易于扩展\n支持多种卡片类型');
    });
    
    it('应该处理包含 HTML 标签的内容', () => {
      const content = '<strong>特点</strong>;;易于<em>扩展</em>';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('<strong>特点</strong>');
      expect(result.back.html).toBe('<strong>特点</strong><br/>易于<em>扩展</em>');
    });
    
    it('应该处理只有描述符没有描述的情况', () => {
      const content = '特点;;';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点');
      expect(result.back.html).toBe('特点<br/>');
    });
    
    it('应该处理只有描述没有描述符的情况', () => {
      const content = ';;易于扩展';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('<br/>易于扩展');
    });
    
    it('应该处理内容中包含多个符号的情况（只分割第一个）', () => {
      const content = '特点;;易于扩展;;更多内容';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点');
      expect(result.back.html).toBe('特点<br/>易于扩展;;更多内容');
    });
    
    it('正面应该包含 mark 隐藏类型', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual(['mark']);
    });
    
    it('反面不应该包含任何隐藏类型', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
  });
  
  describe('parse() - ;; 符号（描述符卡片 - Xiuyuan 模版）', () => {
    it('应该在 Xiuyuan 模版下显示父块概念', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: true,
        parentBlockId: '123'
      };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点（关于：父块概念）');
      expect(result.back.html).toBe('特点<br/>易于扩展');
    });
    
    it('应该在 Xiuyuan 模版下保持反面不变', () => {
      const content = '特点;;易于扩展和维护';
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: true
      };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.html).toBe('特点<br/>易于扩展和维护');
    });
    
    it('Xiuyuan 模版下正面应该包含 mark 隐藏类型', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: true
      };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.hiddenTypes).toEqual(['mark']);
    });
    
    it('Xiuyuan 模版下反面不应该包含任何隐藏类型', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: true
      };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.back.hiddenTypes).toEqual([]);
    });
    
    it('未启用 Xiuyuan 模版时应该使用基础模式', () => {
      const content = '特点;;易于扩展';
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: false
      };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点');
      expect(result.back.html).toBe('特点<br/>易于扩展');
    });
  });
  
  describe('shouldHideContent()', () => {
    it('应该对 mark 类型返回 true', () => {
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.shouldHideContent('mark', metadata);
      
      expect(result).toBe(true);
    });
    
    it('应该对 list 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.shouldHideContent('list', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 heading 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.shouldHideContent('heading', metadata);
      
      expect(result).toBe(false);
    });
    
    it('应该对 superblock 类型返回 false', () => {
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.shouldHideContent('superblock', metadata);
      
      expect(result).toBe(false);
    });
    
    it('Xiuyuan 模版下应该对 mark 类型返回 true', () => {
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: true
      };
      
      const result = strategy.shouldHideContent('mark', metadata);
      
      expect(result).toBe(true);
    });
  });
  
  describe('边界情况', () => {
    it('应该处理空内容', () => {
      const content = '';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('<br/>');
    });
    
    it('应该处理只有符号的内容', () => {
      const content = ';;';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('');
      expect(result.back.html).toBe('<br/>');
    });
    
    it('应该处理不包含符号的内容', () => {
      const content = '没有符号的内容';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('没有符号的内容');
      expect(result.back.html).toBe('没有符号的内容<br/>');
    });
    
    it('应该处理包含特殊字符的内容', () => {
      const content = '特点 & 描述符;;描述 < 标签';
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('特点 & 描述符');
      expect(result.back.html).toBe('特点 & 描述符<br/>描述 < 标签');
    });
    
    it('应该处理非常长的内容', () => {
      const longText = 'A'.repeat(10000);
      const content = `${longText};;${longText}`;
      const metadata: QuickCardMetadata = { symbol: ';;' };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe(longText);
      expect(result.back.html).toBe(`${longText}<br/>${longText}`);
    });
    
    it('Xiuyuan 模版下应该处理空描述符', () => {
      const content = ';;描述内容';
      const metadata: QuickCardMetadata = { 
        symbol: ';;',
        isXiuyuanTemplate: true
      };
      
      const result = strategy.parse(content, metadata);
      
      expect(result.front.html).toBe('（关于：父块概念）');
      expect(result.back.html).toBe('<br/>描述内容');
    });
  });
});
