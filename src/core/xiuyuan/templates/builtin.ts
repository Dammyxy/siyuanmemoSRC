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
  nameKey: 'templateNameBasicQa',
  description: '需要选中两个块进行制卡，生成一张卡片，第一个块为问题，第二个块为答案。',
  descriptionKey: 'templateDescBasicQa',
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
  nameKey: 'templateNameBidirectional',
  description: '需要选中两个块进行制卡，生成两张卡片，它们互为问题和答案',
  descriptionKey: 'templateDescBidirectional',
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
  nameKey: 'templateNameListItem',
  descriptionKey: 'templateDescListItem',
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
  nameKey: 'templateNameConceptDescriptor',
  descriptionKey: 'templateDescConceptDescriptor',
  description: `用于批量创建概念的定义卡片和属性卡片，支持混合使用。需要在列表块里块引用文档块，使用传递型双链。
<div style="margin-top: 8px; padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;">
  <div style="font-weight: 500; margin-bottom: 4px;">【示例】：混合使用定义和描述符</div>
  <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
    <li>[[中子星]]::介于白矮星和黑洞之间的极端致密天体
      <ul style="padding-left: 20px;">
        <li>前身;; 8-30倍 太阳质量的恒星残留核心</li>
        <li>直观密度 ;; 一茶匙重达 10 亿吨</li>
        <li>特殊变种 ;; 脉冲星</li>
        <li>临界点 ;; 奥本海默极限，超过则坍缩为黑洞</li>
      </ul>
    </li>
  </ul>
  <div style="margin-top: 8px; font-size: 0.9em; color: var(--b3-theme-on-surface-light);">
    支持符号：<br/>
    • 定义（顶层块引用）：【::】双向、【:>】正向、【:<】反向<br/>
    • 描述符（子级）：【;;】正向、【;<】反向、【;<>】双向
  </div>
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

/** 描述符卡（自动识别方向）*/
export const CONCEPT_DESCRIPTOR_AUTO_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor-auto',
  name: '描述符卡',
  nameKey: 'templateNameDescriptorAuto',
  descriptionKey: 'templateDescDescriptorAuto',
  description: '选中包含描述符符号的块后使用此模版，会将其制作为描述符卡，并自动向上探路查找概念块（标题块、文档块或者是引用的文档块）。<br/>支持三种方向：<br/>【;;】或【；；】→ 仅正向（默认）<br/>【;<】或【；《】→ 仅反向<br/>【;<>】或【；《》】→ 双向',
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
  nameKey: 'templateNameMultiCloze',
  descriptionKey: 'templateDescMultiCloze',
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

/** 概念定义卡（CDF 风格，双向）*/
export const CONCEPT_DEFINITION_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-definition',
  name: '概念定义卡',
  nameKey: 'templateNameConceptDefinition',
  descriptionKey: 'templateDescConceptDefinition',
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

/** 概念定义卡（仅正向）*/
export const CONCEPT_DEFINITION_FORWARD_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-definition-forward',
  name: '概念定义卡（仅正向）',
  nameKey: 'templateNameConceptDefinitionForward',
  description: '为概念和定义生成正向卡片，需要块引用文档块，并用【:>】隔开定义内容。<br/>【示例】：[[中子星]]:>介于白矮星和黑洞之间的极端致密天体',
  descriptionKey: 'templateDescConceptDefinitionForward',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块（块引用指向的文档块）' },
    { name: 'definition', description: '定义块（包含 :> 符号的块）' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-definition-forward',
      frontFields: ['concept'],
      backFields: ['definition'],
    },
  ],
};

/** 概念定义卡（仅反向）*/
export const CONCEPT_DEFINITION_REVERSE_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-definition-reverse',
  name: '概念定义卡（仅反向）',
  nameKey: 'templateNameConceptDefinitionReverse',
  description: '为概念和定义生成反向卡片，需要块引用文档块，并用【:<】隔开定义内容。<br/>【示例】：[[中子星]]:<介于白矮星和黑洞之间的极端致密天体',
  descriptionKey: 'templateDescConceptDefinitionReverse',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块（块引用指向的文档块）' },
    { name: 'definition', description: '定义块（包含 :< 符号的块）' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-definition-reverse',
      frontFields: ['definition'],
      backFields: ['concept'],
    },
  ],
};

/** 概念描述符卡（仅反向）*/
export const CONCEPT_DESCRIPTOR_REVERSE_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor-reverse',
  name: '概念描述符卡（仅反向）',
  nameKey: 'templateNameConceptDescriptorReverse',
  description: '为概念和描述符生成反向卡片，使用【;<】符号。<br/>【示例】：属性;<描述',
  descriptionKey: 'templateDescConceptDescriptorReverse',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块' },
    { name: 'descriptor', description: '描述符块' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-descriptor-reverse',
      frontFields: ['concept', 'descriptor'],  // 🔧 修复：包含概念块和描述符块
      backFields: ['concept', 'descriptor'],   // 🔧 修复：包含概念块和描述符块
    },
  ],
};

/** 概念描述符卡（双向）*/
export const CONCEPT_DESCRIPTOR_BOTH_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor-both',
  name: '概念描述符卡（双向）',
  nameKey: 'templateNameConceptDescriptorBoth',
  description: '为概念和描述符生成双向卡片，使用【;<>】符号。<br/>【示例】：属性;<>描述',
  descriptionKey: 'templateDescConceptDescriptorBoth',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块' },
    { name: 'descriptor', description: '描述符块' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-descriptor-forward',
      frontFields: ['concept', 'descriptor'],  // 正向卡：概念 → 描述符
      backFields: ['concept', 'descriptor'],
    },
    {
      typeMarker: 'concept-descriptor-reverse',
      frontFields: ['concept', 'descriptor'],  // 🔧 修复：反向卡也需要包含概念块
      backFields: ['concept', 'descriptor'],
    },
  ],
};

/** 所有内置模板（用户可见） */
export const BUILTIN_TEMPLATES: ICardTemplate[] = [
  BASIC_QA_TEMPLATE,
  BIDIRECTIONAL_TEMPLATE,
  MULTI_CLOZE_TEMPLATE,
  LIST_ITEM_TEMPLATE,
  CONCEPT_DESCRIPTOR_TEMPLATE,
  CONCEPT_DESCRIPTOR_AUTO_TEMPLATE,  // 只显示这一个，自动识别方向
  // CONCEPT_DESCRIPTOR_REVERSE_TEMPLATE,  // 内部使用，不显示
  // CONCEPT_DESCRIPTOR_BOTH_TEMPLATE,  // 内部使用，不显示
  CONCEPT_DEFINITION_TEMPLATE,  // 只显示这一个，自动识别方向
  // CONCEPT_DEFINITION_FORWARD_TEMPLATE,  // 内部使用，不显示
  // CONCEPT_DEFINITION_REVERSE_TEMPLATE,  // 内部使用，不显示
  BUILTIN_QUICK_TEMPLATE,
  BUILTIN_BIDIRECTIONAL_SINGLE_TEMPLATE,
];

/** 所有模板（包括内部使用的变体） */
export const ALL_TEMPLATES: ICardTemplate[] = [
  ...BUILTIN_TEMPLATES,
  CONCEPT_DEFINITION_FORWARD_TEMPLATE,
  CONCEPT_DEFINITION_REVERSE_TEMPLATE,
  CONCEPT_DESCRIPTOR_REVERSE_TEMPLATE,
  CONCEPT_DESCRIPTOR_BOTH_TEMPLATE,
];
