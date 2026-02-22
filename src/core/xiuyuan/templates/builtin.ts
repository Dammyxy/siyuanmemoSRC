/**
 * 内置模板定义
 */

import type { ICardTemplate } from '../types';
import { BUILTIN_CONCEPT_TEMPLATE } from './builtin-concept';
import { BUILTIN_QUICK_TEMPLATE, BUILTIN_BIDIRECTIONAL_SINGLE_TEMPLATE } from './builtin-quick';

/** 基础问答模板 */
export const BASIC_QA_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: '基础问答',
  description: '需要选中两个块进行制卡，生成一张卡片，第一个块为问题，第二个块为答案',
  category: 'basic',
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

/** 双向卡片模板（两个块） */
export const BIDIRECTIONAL_TEMPLATE: ICardTemplate = {
  id: 'builtin-bidirectional',
  name: '双向卡片',
  description: '需要选中两个块进行制卡，生成两张卡片，它们互为问题和答案',
  category: 'basic',
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

/** 有序列表模版 */
export const LIST_ITEM_TEMPLATE: ICardTemplate = {
  id: 'builtin-list-item',
  name: '有序列表模版',
  description: '自动检测列表项块，如果子级为有序列表项，则为每个子级创建一张卡片。支持提示功能：子列表项使用 → 分隔提示和答案',
  category: 'list',
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

/** 概念-描述符模版 */
export const CONCEPT_DESCRIPTOR_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor',
  name: '概念-描述符',
  description: '用于概念及其属性的卡片',
  category: 'concept',
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

/** 多填空模板 */
export const MULTI_CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-multi-cloze',
  name: '多填空卡片',
  description: '每个标记生成一张独立的卡片',
  category: 'cloze',
  fields: [
    { name: 'content', description: '包含多个填空的内容' },
  ],
  cardRules: [
    {
      typeMarker: 'multi-cloze',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};

/** 概念定义模板（CDF 风格）*/
export const CONCEPT_DEFINITION_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-definition',
  name: '概念定义',
  description: 'CDF 概念定义卡：[[概念]]::定义。生成双向卡片，概念必须是文档块引用',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块（块引用指向的文档块）' },
    { name: 'definition', description: '定义块（包含 :: 符号的块）' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-definition-forward',
      frontFields: ['concept'],
      backFields: ['definition'],
    },
    {
      typeMarker: 'concept-definition-reverse',
      frontFields: ['definition'],
      backFields: ['concept'],
    },
  ],
};

/** 所有内置模板 */
export const BUILTIN_TEMPLATES: ICardTemplate[] = [
  BASIC_QA_TEMPLATE,
  BIDIRECTIONAL_TEMPLATE,
  MULTI_CLOZE_TEMPLATE,
  LIST_ITEM_TEMPLATE,
  CONCEPT_DESCRIPTOR_TEMPLATE,
  CONCEPT_DEFINITION_TEMPLATE,
  BUILTIN_CONCEPT_TEMPLATE,
  BUILTIN_QUICK_TEMPLATE,
  BUILTIN_BIDIRECTIONAL_SINGLE_TEMPLATE,
];
