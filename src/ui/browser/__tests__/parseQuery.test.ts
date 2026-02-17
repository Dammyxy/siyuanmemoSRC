/**
 * 测试搜索查询解析功能
 * 
 * 特别测试全角符号和 HTML 转义符号的支持
 */

import { describe, it, expect } from 'vitest';
import { parseQuery } from '../browserService';

describe('parseQuery - 数值条件解析', () => {
  it('应该正确解析半角小于号', () => {
    const result = parseQuery('prior<50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<',
      value: 50,
    });
  });

  it('应该正确解析全角小于号', () => {
    const result = parseQuery('prior＜50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<',
      value: 50,
    });
  });

  it('应该正确解析 HTML 转义小于号', () => {
    const result = parseQuery('prior&lt;50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<',
      value: 50,
    });
  });

  it('应该正确解析全角小于等于号', () => {
    const result = parseQuery('priority＜＝50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<=',
      value: 50,
    });
  });

  it('应该正确解析 HTML 转义小于等于号', () => {
    const result = parseQuery('priority&le;50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<=',
      value: 50,
    });
  });

  it('应该正确解析全角大于号', () => {
    const result = parseQuery('priority＞50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '>',
      value: 50,
    });
  });

  it('应该正确解析 HTML 转义大于号', () => {
    const result = parseQuery('priority&gt;50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '>',
      value: 50,
    });
  });

  it('应该正确解析全角大于等于号', () => {
    const result = parseQuery('priority＞＝50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '>=',
      value: 50,
    });
  });

  it('应该正确解析 HTML 转义大于等于号', () => {
    const result = parseQuery('priority&ge;50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '>=',
      value: 50,
    });
  });

  it('应该正确解析全角等号', () => {
    const result = parseQuery('priority＝50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '=',
      value: 50,
    });
  });

  it('应该正确解析全角不等号', () => {
    const result = parseQuery('priority！＝50');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '!=',
      value: 50,
    });
  });

  it('应该支持多个条件组合', () => {
    const result = parseQuery('prior＜50 interval＞10');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<',
      value: 50,
    });
    expect(result.conditions.interval).toHaveLength(1);
    expect(result.conditions.interval![0]).toEqual({
      operator: '>',
      value: 10,
    });
  });

  it('应该支持字段别名', () => {
    const result = parseQuery('prior＜50');
    expect(result.conditions.priority).toHaveLength(1);
    
    const result2 = parseQuery('priority＜50');
    expect(result2.conditions.priority).toHaveLength(1);
    
    expect(result.conditions.priority![0]).toEqual(result2.conditions.priority![0]);
  });

  it('应该支持浮点数', () => {
    const result = parseQuery('difficulty＜5.5');
    expect(result.conditions.difficulty).toHaveLength(1);
    expect(result.conditions.difficulty![0]).toEqual({
      operator: '<',
      value: 5.5,
    });
  });

  it('应该支持负数', () => {
    const result = parseQuery('interval＞-1');
    expect(result.conditions.interval).toHaveLength(1);
    expect(result.conditions.interval![0]).toEqual({
      operator: '>',
      value: -1,
    });
  });
});

describe('parseQuery - 其他功能', () => {
  it('应该正确解析标签', () => {
    const result = parseQuery('tag:test');
    expect(result.tags).toContain('test');
  });

  it('应该正确解析 deck', () => {
    const result = parseQuery('deck:mydeck');
    expect(result.decks).toContain('mydeck');
  });

  it('应该正确解析状态', () => {
    const result = parseQuery('state:new');
    expect(result.states).toContain(0); // CardState.New
  });

  it('应该正确解析自由文本', () => {
    const result = parseQuery('hello world');
    expect(result.text).toBe('hello world');
  });

  it('应该支持混合查询', () => {
    const result = parseQuery('tag:test prior＜50 hello');
    expect(result.tags).toContain('test');
    expect(result.conditions.priority).toHaveLength(1);
    expect(result.conditions.priority![0]).toEqual({
      operator: '<',
      value: 50,
    });
    expect(result.text).toBe('hello');
  });
});
