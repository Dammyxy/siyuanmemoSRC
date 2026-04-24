/**
 * Xiuyuan Card Meta Types
 * 
 * Xiuyuan 卡片的 meta 数据结构定义
 */

import type { CdfDirectPathSegment } from '@/core/card/common/application/cdfDirectScene';

/**
 * Xiuyuan 卡片的 meta 数据
 * 
 * 存储在 FSRSCard.meta 中，用于复习界面渲染
 */
export interface XiuyuanCardMeta {
  // === Xiuyuan 相关 ===
  /** 所属的 Xiuyuan ID */
  xiuyuanID: string;
  
  /** 卡片面索引（对应 Xiuyuan.faces 的索引） */
  faceIndex: number;
  
  /** 使用的模板 ID */
  templateID: string;
  
  // === 渲染信息 ===
  /** 正面要显示的块 ID 列表 */
  frontBlockIDs: string[];
  
  /** 背面要显示的块 ID 列表 */
  backBlockIDs: string[];
  
  // === 卡片类型标记 ===
  /** 卡片类型标记（如 'forward', 'reverse', 'concept-definition-cloze-0'） */
  typeMarker?: string;

  /** 字段映射（例如 concept/descriptor/content） */
  fieldMapping?: Record<string, string>;
  
  // === 列表模版卡专用字段 ===
  /** 当前卡片的提示文本 */
  cue?: string;
  
  /** 当前卡片的答案文本 */
  answer?: string;
  
  /** 所有子列表项信息（用于渐进式显示） */
  allChildren?: Array<{
    id: string;
    cue: string;
    answer: string;
    index: number;
    source?: string;
    directPath?: CdfDirectPathSegment[];
  }>;
  
  /** 当前卡片在所有子列表项中的索引 */
  currentIndex?: number;
}

/**
 * 从 CardFace 提取渲染信息
 * 
 * @param face CardFace 对象
 * @returns 正面和背面的块 ID 列表
 */
export function extractRenderBlockIDs(face: {
  questionBlockId?: string;
  answerBlockId?: string;
}): { frontBlockIDs: string[]; backBlockIDs: string[] } {
  const frontBlockIDs = face.questionBlockId ? [face.questionBlockId] : [];
  const backBlockIDs = face.answerBlockId ? [face.answerBlockId] : [];
  
  return { frontBlockIDs, backBlockIDs };
}

/**
 * 生成 Xiuyuan 卡片 ID
 * 
 * 格式：xy_card_{xiuyuanID}_{faceIndex}_{timestamp}_{random}
 * 
 * @param xiuyuanID Xiuyuan ID
 * @param faceIndex 卡片面索引
 * @returns 唯一的卡片 ID
 */
export function generateXiuyuanCardID(xiuyuanID: string, faceIndex: number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `xy_card_${xiuyuanID}_${faceIndex}_${timestamp}_${random}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function normalizeMetaString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveFieldMappingValue(meta: XiuyuanCardMeta, key: string): string {
  return normalizeMetaString(meta.fieldMapping?.[key]);
}

/**
 * 检查卡片是否是 Xiuyuan 卡片
 * 
 * @param card FSRSCard
 * @returns 是否是 Xiuyuan 卡片
 */
export function isXiuyuanCard(card: unknown): card is { meta: XiuyuanCardMeta } {
  if (!card || typeof card !== 'object') {
    return false;
  }

  const meta = (card as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object') {
    return false;
  }

  const metaRecord = meta as Record<string, unknown>;
  return typeof metaRecord.xiuyuanID === 'string' && isStringArray(metaRecord.frontBlockIDs);
}

/**
 * 检查卡片是否是概念定义卡
 * 
 * @param card FSRSCard
 * @returns 是否是概念定义卡
 */
export function isConceptDefinitionCard(card: unknown): boolean {
  if (!isXiuyuanCard(card)) return false;

  const typeMarker = card.meta.typeMarker;
  if (typeMarker && (
    typeMarker === 'concept-definition-forward' || 
    typeMarker === 'concept-definition-reverse' ||
    typeMarker.startsWith('concept-definition-cloze-')
  )) {
    return true;
  }

  const templateID = normalizeMetaString(card.meta.templateID);
  if (templateID.startsWith('builtin-concept-definition')) {
    return true;
  }

  return resolveFieldMappingValue(card.meta, 'definition').length > 0;
}

/**
 * 检查卡片是否是概念卡（builtin-concept-simple）
 * 
 * @param card FSRSCard
 * @returns 是否是概念卡
 */
export function isConceptCard(card: unknown): boolean {
  if (!isXiuyuanCard(card)) return false;
  return card.meta.typeMarker === 'C';
}

/**
 * 检查卡片是否是描述符语义卡
 *
 * @param card FSRSCard
 * @returns 是否是描述符卡
 */
export function isDescriptorSemanticCard(card: unknown): boolean {
  if (!isXiuyuanCard(card)) return false;

  const typeMarker = normalizeMetaString(card.meta.typeMarker);
  if (typeMarker.startsWith('concept-descriptor') || typeMarker.startsWith('descriptor-')) {
    return true;
  }

  const templateID = normalizeMetaString(card.meta.templateID);
  if (templateID.startsWith('builtin-concept-descriptor')) {
    return true;
  }

  return resolveFieldMappingValue(card.meta, 'descriptor').length > 0;
}

/**
 * 从概念块内容中提取概念名称（隐藏定义）
 * 
 * @description
 * 支持的格式：
 * 1. 概念定义：`Cell :: 生命的基本单位` → `Cell`
 * 2. 块引用：`((id '程序性知识')) :: 定义` → `程序性知识`
 * 3. 简单概念：`Mitochondria` → `Mitochondria`
 * 
 * @param content 块内容
 * @returns 概念名称
 */
export function extractConceptName(content: string): string {
  if (!content) {
    return '';
  }

  // 场景 1 & 2：包含 :: 的概念定义
  if (content.includes('::')) {
    const beforeColon = content.split('::')[0].trim();
    
    // 场景 2：块引用形式 ((id '名称'))
    const refMatch = beforeColon.match(/\(\([^\)]+\s+'([^']+)'\)\)/);
    if (refMatch) {
      return refMatch[1]; // 提取引用的名称
    }
    
    // 场景 1：普通文本
    return beforeColon;
  }
  
  // 场景 3：简单概念（没有定义）
  return content;
}

/**
 * 检查内容是否包含概念定义语法
 * 
 * @param content 块内容
 * @returns 是否包含 :: 语法
 */
export function hasConceptDefinitionSyntax(content: string): boolean {
  return content?.includes('::') || false;
}
