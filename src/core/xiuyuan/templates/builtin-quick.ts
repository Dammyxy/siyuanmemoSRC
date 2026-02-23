/**
 * 内置快速卡片模板（统一版）
 * 
 * 用于快速创建的单块卡片，支持：
 * - 快速制卡（单向）
 * - 符号问答卡（单向）
 * - 默认卡片创建
 * 
 * 通过动态生成 cardRules 来支持单向和双向：
 * - 单向：1个 cardRule
 * - 双向：2个 cardRules (forward + reverse)
 */

import type { ICardTemplate } from '../types';

export const BUILTIN_QUICK_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-card',
  name: '符号卡片',
  description: '在单个块里，搭配符号生成单张卡片。<br/>【示例】：会泽百家>>至公天下',
  category: 'quick',
  version: '1.0.0',
  
  fields: [
    {
      name: 'content',
      label: '内容',
      type: 'block',
      required: true,
      description: '卡片内容块（可包含符号）',
    },
  ],
  
  // 默认单向卡片规则
  // 双向卡片会在创建时动态添加 reverse 规则
  cardRules: [
    {
      typeMarker: 'Q',
      frontFields: ['content'],
      backFields: ['content'],
      cardType: 'basic',
    },
  ],
};

/**
 * 双向卡片模板（单块）
 * 
 * 用于单个块创建双向卡片，使用 <> 符号。
 * 
 * @example
 * ```markdown
 * DDD <> Domain-Driven Design
 * ```
 * 
 * 生成2张卡片：
 * - 卡片1：DDD → Domain-Driven Design
 * - 卡片2：Domain-Driven Design → DDD
 */
export const BUILTIN_BIDIRECTIONAL_SINGLE_TEMPLATE: ICardTemplate = {
  id: 'builtin-bidirectional-single',
  name: '双向卡片',
  description: '在单个块里，使用 <> 符号生成两张互为问答的卡片。<br/>【示例】：会泽百家<>至公天下',
  category: 'quick',
  version: '1.0.0',
  
  fields: [
    {
      name: 'content',
      label: '内容',
      type: 'block',
      required: true,
      description: '卡片内容块（包含 <> 符号）',
    },
  ],
  
  cardRules: [
    {
      typeMarker: 'forward',
      frontFields: ['content'],
      backFields: ['content'],
      cardType: 'basic',
    },
    {
      typeMarker: 'reverse',
      frontFields: ['content'],
      backFields: ['content'],
      cardType: 'basic',
    },
  ],
};
