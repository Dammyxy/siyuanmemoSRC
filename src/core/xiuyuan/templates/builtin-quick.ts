/**
 * 内置快速卡片模板
 * 
 * 用于快速创建的单块卡片，适用于：
 * - 快速制卡
 * - 默认卡片创建
 * - 简单的单块记忆
 */

import type { ICardTemplate } from '../types';

export const BUILTIN_QUICK_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-card',
  name: '快速卡片',
  description: '快速创建的单块卡片',
  category: 'quick',
  version: '1.0.0',
  
  fields: [
    {
      name: 'content',
      label: '内容',
      type: 'block',
      required: true,
      description: '卡片内容块',
    },
  ],
  
  cardRules: [
    {
      typeMarker: 'Q',
      frontFields: ['content'],
      backFields: ['content'],
      cardType: 'basic',
    },
  ],
};
