/**
 * 内置快速卡片模板（统一版）
 * 
 * 用于快速创建的单块卡片，支持：
 * - 快速制卡（单向）
 * - 符号问答卡（<> 符号，单向或双向）
 * - 默认卡片创建
 * 
 * 通过动态生成 cardRules 来支持单向和双向：
 * - 单向：1个 cardRule
 * - 双向：2个 cardRules (forward + reverse)
 */

import type { ICardTemplate } from '../types';

export const BUILTIN_QUICK_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-card',
  name: '快速卡片',
  description: '用【单块】+【符号】制作的卡片，可生成多张卡片，识别 >>、<<、<>、==、{{}}、::、;;，逻辑和【符号监听制卡】一致',
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
