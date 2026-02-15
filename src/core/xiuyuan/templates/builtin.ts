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

/**
 * 列表项模版
 * 
 * @description
 * 用于列表项块的模版卡片。
 * 当一个列表项块有多个子级列表项时，自动识别为模版卡：
 * - 父列表项内容作为问题（正面）
 * - 每个子级列表项作为独立卡片的答案（背面）
 * 
 * @example
 * ```markdown
 * - 什么是 FSRS？（父列表项）
 *   - FSRS 是一种间隔重复算法（子级1 → 卡片1的答案）
 *   - 它基于记忆遗忘曲线（子级2 → 卡片2的答案）
 *   - 可以优化复习时间（子级3 → 卡片3的答案）
 * ```
 * 
 * 生成3张卡片，每张卡片的正面都是"什么是 FSRS？"，背面分别是3个子级列表项。
 */
export const LIST_ITEM_TEMPLATE: ICardTemplate = {
  id: 'builtin-list-item',
  name: '列表项模版',
  description: '父列表项作为问题，每个子列表项作为独立答案',
  fields: [
    { name: 'question', description: '问题（父列表项）' },
    { name: 'answer', description: '答案（子列表项）' },
  ],
  cardRules: [
    {
      typeMarker: 'list-qa',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};

/**
 * 概念-描述符模版
 * 
 * @description
 * 用于概念及其属性描述的卡片。
 * 当一个概念块（使用 :: 符号）有子块使用 ;; 符号时，自动识别为概念-描述符卡：
 * - 概念块内容作为上下文
 * - 描述符块内容作为问答对
 * 
 * @example
 * ```markdown
 * 线粒体 :: 细胞的能量工厂
 *   ├─ 起源 ;; 被认为是通过内共生起源的
 *   ├─ 功能 ;; 为细胞生成ATP
 *   └─ 结构 ;; 具有双层膜结构
 * ```
 * 
 * 生成的卡片：
 * - 正面：线粒体 - 起源
 * - 反面：线粒体 :: 细胞的能量工厂 + 起源 ;; 被认为是通过内共生起源的
 */
export const CONCEPT_DESCRIPTOR_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor',
  name: '概念-描述符',
  description: '用于概念及其属性的卡片',
  fields: [
    { name: 'concept', description: '概念块' },
    { name: 'descriptor', description: '描述符块' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-descriptor',
      frontFields: ['concept', 'descriptor'],
      backFields: ['concept', 'descriptor'],
    },
  ],
};

/** 所有内置模板 */
export const BUILTIN_TEMPLATES: ICardTemplate[] = [
  BASIC_QA_TEMPLATE,
  BIDIRECTIONAL_TEMPLATE,
  CLOZE_TEMPLATE,
  LIST_ITEM_TEMPLATE,
  CONCEPT_DESCRIPTOR_TEMPLATE,
];
