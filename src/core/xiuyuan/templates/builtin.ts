/**
 * 内置模板定义
 * 
 * ⚠️ 注意：BUILTIN_CONCEPT_TEMPLATE 仅用于代码内部，不在 BUILTIN_TEMPLATES 列表中
 */

import type { ICardTemplate } from '../types';
import { BUILTIN_CONCEPT_TEMPLATE } from './builtin-concept';
import { BUILTIN_QUICK_TEMPLATE, BUILTIN_BIDIRECTIONAL_SINGLE_TEMPLATE } from './builtin-quick';

/** 基础问答模板 */
export const BASIC_QA_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: '基础问答',
  description: '需要选中两个块进行制卡，生成一张卡片，第一个块为问题，第二个块为答案。',
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

/** 有序列表卡 */
export const LIST_ITEM_TEMPLATE: ICardTemplate = {
  id: 'builtin-list-item',
  name: '有序列表卡',
  description: `根据有序列表子级，生成多张对应的卡片。需要右键列表项块使用，子级得是有序列表。支持为每张子级卡片写单独的提示，用【→】分割提示和答案。
<div style="margin-top: 8px; padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;">
  <div style="font-weight: 500; margin-bottom: 4px;">【示例】：</div>
  <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
    <li>[[思源笔记]]
      <ol style="padding-left: 20px;">
        <li>会泽→百家</li>
        <li>至公→天下</li>
      </ol>
    </li>
  </ul>
</div>`,
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

/** 概念描述符卡 */
export const CONCEPT_DESCRIPTOR_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor',
  name: '概念描述符卡',
  description: `用于记忆概念及其属性的卡片，需要在列表块里块引用文档块，使用传递型双链。
<div style="margin-top: 8px; padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;">
  <div style="font-weight: 500; margin-bottom: 4px;">【示例】：</div>
  <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
    <li>[[中子星]]
      <ul style="padding-left: 20px;">
        <li>定义;;介于白矮星和黑洞之间的极端致密天体</li>
        <li>前身;; 8-30倍 太阳质量的恒星残留核心</li>
        <li>直观密度 ;; 一茶匙重达 10 亿吨</li>
        <li>特殊变种 ;; 脉冲星</li>
        <li>临界点 ;; 奥本海默极限，超过则坍缩为黑洞</li>
      </ul>
    </li>
  </ul>
</div>`,
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

/** 描述符卡 */
export const CONCEPT_DESCRIPTOR_AUTO_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor-auto',
  name: '描述符卡',
  description: '选中包含【;;】的块后使用此模版，会将其制作为描述符卡，并自动向上探路查找概念块（标题块、文档块或者是引用的文档块）',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块（自动查找）' },
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
  description: '每个标记生成一张独立的卡片。<br/>【示例】：会泽==百家==，至公==天下==',
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

/** 概念定义卡（CDF 风格）*/
export const CONCEPT_DEFINITION_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-definition',
  name: '概念定义卡',
  description: '为概念和定义生成双向卡片，需要块引用文档块，并用【::】隔开定义内容。<br/>【示例】：[[中子星]]::介于白矮星和黑洞之间的极端致密天体',
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
  CONCEPT_DESCRIPTOR_AUTO_TEMPLATE,
  CONCEPT_DEFINITION_TEMPLATE,
  BUILTIN_QUICK_TEMPLATE,
  BUILTIN_BIDIRECTIONAL_SINGLE_TEMPLATE,
];
