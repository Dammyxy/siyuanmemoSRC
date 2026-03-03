/**
 * 描述符卡实体
 * 
 * 核心业务逻辑：
 * - 表示一个描述符卡片
 * - 包含父概念信息
 * - 提供属性提取方法
 */

import type { ParentConceptBlock, SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DescriptorCard');

/**
 * 描述符卡实体
 */
export class DescriptorCard {
  readonly blockId: string;
  readonly content: string;
  readonly html: string;
  readonly parentConcept: ParentConceptBlock | null;
  readonly siblingDescriptors: SiblingDescriptor[];
  readonly attribute: string;
  readonly description: string;

  constructor(data: DescriptorCardData) {
    this.blockId = data.blockId;
    this.content = data.content;
    this.html = data.html;
    this.parentConcept = data.parentConcept;
    this.siblingDescriptors = data.siblingDescriptors;

    // 解析属性和描述
    const parsed = this.parseContent(data.content);
    this.attribute = parsed.attribute;
    this.description = parsed.description;
  }

  /**
   * 解析描述符内容
   * 格式：属性 ;; 描述（正向）
   *       属性 ;< 描述（反向）
   *       属性 ;<> 描述（双向）
   */
  private parseContent(content: string): { attribute: string; description: string } {
    // 🔍 调试日志
    logger.debug('[DescriptorCard] Parsing content:', JSON.stringify(content));
    
    // 🔧 支持三种符号：;;、;<、;<>（以及中文全角版本）
    // 明确列出所有可能的符号，避免歧义
    const match = content.match(/^(.+?)\s*(?:;<>|;<|;;|；《》|；《|；；)\s*(.+)$/s);
    
    logger.debug('[DescriptorCard] Regex match result:', match);
    
    if (match) {
      logger.debug('[DescriptorCard] Parsed - attribute:', match[1].trim(), 'description:', match[2].trim());
      return {
        attribute: match[1].trim(),
        description: match[2].trim(),
      };
    }

    // 降级：没有符号，尝试用 ;; 分割（兼容旧数据）
    const parts = content.split(';;');
    if (parts.length >= 2) {
      logger.debug('[DescriptorCard] Fallback split by ;; - attribute:', parts[0].trim());
      return {
        attribute: parts[0].trim(),
        description: parts.slice(1).join(';;').trim(),
      };
    }

    // 最终降级：整个内容作为描述
    logger.debug('[DescriptorCard] No descriptor symbol found, fallback to description-only parsing');
    return {
      attribute: 'defaultAttribute', // i18n key, resolved by the service layer
      description: content.trim(),
    };
  }

  /**
   * 获取父概念标题
   * 提取 :: 前面的部分
   */
  getParentConceptTitle(): string {
    if (!this.parentConcept) {
      return '';
    }

    const match = this.parentConcept.content.match(/^(.+?)\s*::/);
    if (match) {
      return match[1].trim();
    }

    // 降级：返回前 50 个字符
    return this.parentConcept.content.substring(0, 50);
  }

  /**
   * 获取父概念预览
   * 提取 :: 后面的部分，或返回完整内容
   */
  getParentConceptPreview(): string {
    if (!this.parentConcept) {
      return '';
    }

    const match = this.parentConcept.content.match(/::\s*(.+)/);
    if (match) {
      return match[1].trim();
    }

    // 降级：返回完整内容
    return this.parentConcept.content;
  }

  /**
   * 判断是否有父概念
   */
  hasParentConcept(): boolean {
    return this.parentConcept !== null;
  }

  /**
   * 判断父概念是否为概念卡
   */
  isParentConceptCard(): boolean {
    return this.parentConcept?.isConceptCard || false;
  }

  /**
   * 获取警告信息的 i18n key（如果有）
   * 返回 i18n key，由调用方负责翻译
   */
  getWarning(): string | null {
    if (!this.hasParentConcept()) {
      return 'warningNoParentConcept';
    }

    if (!this.isParentConceptCard()) {
      return 'warningParentNotConceptCard';
    }

    return null;
  }
}

/**
 * 描述符卡数据接口
 */
export interface DescriptorCardData {
  blockId: string;
  content: string;
  html: string;
  parentConcept: ParentConceptBlock | null;
  siblingDescriptors: SiblingDescriptor[];
}
