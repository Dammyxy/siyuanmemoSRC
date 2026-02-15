/**
 * 描述符卡实体
 * 
 * 核心业务逻辑：
 * - 表示一个描述符卡片
 * - 包含父概念信息
 * - 提供属性提取方法
 */

import type { ParentConceptBlock, SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';

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
   * 格式：属性 ;; 描述
   */
  private parseContent(content: string): { attribute: string; description: string } {
    const parts = content.split(';;');
    if (parts.length >= 2) {
      return {
        attribute: parts[0].trim(),
        description: parts.slice(1).join(';;').trim(),
      };
    }

    // 降级：没有 ;; 符号
    return {
      attribute: '属性',
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
   * 获取警告信息（如果有）
   */
  getWarning(): string | null {
    if (!this.hasParentConcept()) {
      return '无法找到父概念，这可能是一个孤立的描述符卡';
    }

    if (!this.isParentConceptCard()) {
      return '父块不是概念卡';
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
