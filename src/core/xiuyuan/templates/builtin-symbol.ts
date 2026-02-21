/**
 * 内置符号问答卡模板
 * 
 * 用于通过 <> 符号标记的问答卡，适用于：
 * - 自动检测 <问题> 符号创建问答卡
 * - 符号检测制卡
 */

import type { ICardTemplate } from '../types';

export const BUILTIN_SYMBOL_TEMPLATE: ICardTemplate = {
  id: 'builtin-symbol-qa',
  name: '符号问答卡',
  description: '通过 <> 符号标记的问答卡',
  category: 'quick',
  version: '1.0.0',
  
  fields: [
    {
      name: 'content',
      label: '内容',
      type: 'block',
      required: true,
      description: '包含问答符号的内容块',
    },
  ],
  
  cardRules: [
    {
      typeMarker: 'Q',
      frontFields: ['content'],
      backFields: ['content'],
      cardType: 'qa',
    },
  ],
};
