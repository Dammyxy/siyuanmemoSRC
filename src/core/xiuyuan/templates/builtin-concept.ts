/**
 * 内置概念卡模板
 * 
 * ⚠️ 注意：此模板仅用于代码内部使用，不在模板列表中显示
 * 
 * 用于创建单块概念卡，适用于：
 * - 记忆概念、术语、定义
 * - 自动检测引用创建概念卡
 * - 手动制作概念卡
 */

import type { ICardTemplate } from '../types';

export const BUILTIN_CONCEPT_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-simple',
  name: '概念卡（简单）',
  description: '单块概念卡，用于记忆概念、术语、定义',
  category: 'concept',
  version: '1.0.0',
  
  fields: [
    {
      name: 'concept',
      label: '概念',
      type: 'block',
      required: true,
      description: '概念的内容块',
    },
  ],
  
  cardRules: [
    {
      typeMarker: 'C',
      frontFields: ['concept'],
      backFields: ['concept'],
      cardType: 'concept',
    },
  ],
};
