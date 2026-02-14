/**
 * 内置模板定义
 */

import type { ICardTemplate } from '../types';

/** 基础问答模板 */
export const BASIC_QA_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: '基础问答',
  description: '简单的问答卡片，第一个块为问题，第二个块为答案',
  fields: [
    { name: 'question', description: '问题' },
    { name: 'answer', description: '答案' },
  ],
  cardRules: [
    {
      typeMarker: 'qa',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};

/** 双向卡片模板 */
export const BIDIRECTIONAL_TEMPLATE: ICardTemplate = {
  id: 'builtin-bidirectional',
  name: '双向卡片',
  description: '生成正向和反向两张卡片',
  fields: [
    { name: 'term', description: '术语' },
    { name: 'definition', description: '定义' },
  ],
  cardRules: [
    {
      typeMarker: 'forward',
      frontFields: ['term'],
      backFields: ['definition'],
    },
    {
      typeMarker: 'reverse',
      frontFields: ['definition'],
      backFields: ['term'],
    },
  ],
};

/** 填空模板 */
export const CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-cloze',
  name: '填空卡片',
  description: '包含填空位置的卡片',
  fields: [
    { name: 'content', description: '包含填空的内容' },
  ],
  cardRules: [
    {
      typeMarker: 'cloze',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};

/** 所有内置模板 */
export const BUILTIN_TEMPLATES: ICardTemplate[] = [
  BASIC_QA_TEMPLATE,
  BIDIRECTIONAL_TEMPLATE,
  CLOZE_TEMPLATE,
];
