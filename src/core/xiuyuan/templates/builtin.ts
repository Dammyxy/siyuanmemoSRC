/**
 * 内置模板定义
 */

import type { ICardTemplate } from '../types';
import { BUILTIN_CONCEPT_TEMPLATE } from './builtin-concept';
import { BUILTIN_QUICK_TEMPLATE } from './builtin-quick';

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

// 已合并到 BUILTIN_QUICK_TEMPLATE，不再需要单独的双向模板

/** 填空模板 */
export const CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-cloze',
  name: '填空卡片',
  description: '包含填空位置的卡片',
  category: 'cloze',
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

/**
 * 多填空模板
 * 
 * @description
 * 用于包含多个填空的块，每个填空生成一张独立的卡片。
 * 支持两种填空符号：{{}} 和 ==
 * 
 * @example
 * ```markdown
 * ==线粒体==是细胞的==能量工厂==，负责生成==ATP==
 * ```
 * 
 * 生成3张卡片：
 * - 卡片1：[___]是细胞的能量工厂，负责生成ATP → 线粒体
 * - �片2：线粒体是细胞的[___]，负责生成ATP → 能量工厂
 * - 卡片3：线粒体是细胞的能量工厂，负责生成[___] → ATP
 * 
 * 注意：
 * - content 字段映射到同一个块
 * - 每张卡片通过 ruleIndex 区分是哪个填空
 * - 渲染时需要解析块内容中的填空符号
 */
export const MULTI_CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-multi-cloze',
  name: '多填空卡片',
  description: '每个填空生成一张独立的卡片',
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
  ], // 注意：实际使用时会根据填空数量动态生成多个 cardRules
};

/**
 * 概念定义模板
 * 
 * @description
 * 用于概念及其定义的卡片。
 * 当一个块引用（指向文档块）使用 :: 符号时，自动识别为概念定义卡：
 * - 块引用的文档块标题作为概念名称
 * - :: 后面的内容作为定义
 * 
 * @example
 * ```markdown
 * [[思源]]::本地 PKM 软件
 * ```
 * 
 * 生成的卡片：
 * - 正面：思源的定义？
 * - 背面：本地 PKM 软件
 * 
 * 支持定义挖空：
 * ```markdown
 * [[思源]]::本地 ==PKM== 软件
 * ```
 * 
 * 生成多张卡片（通过 Xiuyuan 的挖空功能）
 * 
 * 字段说明：
 * - concept: 概念块（块引用指向的文档块）
 * - definition: 定义块（包含 :: 符号的块）
 */
export const CONCEPT_DEFINITION_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-definition',
  name: '概念定义',
  description: '用于概念及其定义的卡片',
  category: 'concept',
  fields: [
    { name: 'concept', description: '概念块（块引用指向的文档块）' },
    { name: 'definition', description: '定义块（包含 :: 符号的块）' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-definition',
      frontFields: ['concept'],
      backFields: ['definition'],
    },
  ],
};

/** 所有内置模板 */
export const BUILTIN_TEMPLATES: ICardTemplate[] = [
  BASIC_QA_TEMPLATE,
  BIDIRECTIONAL_TEMPLATE,
  CLOZE_TEMPLATE,
  MULTI_CLOZE_TEMPLATE,
  LIST_ITEM_TEMPLATE,
  CONCEPT_DESCRIPTOR_TEMPLATE,
  CONCEPT_DEFINITION_TEMPLATE,
  // 🆕 新增的统一架构模板
  BUILTIN_CONCEPT_TEMPLATE,  // 概念卡（简单）
  BUILTIN_QUICK_TEMPLATE,    // 快速卡片（统一单向和双向）
];
