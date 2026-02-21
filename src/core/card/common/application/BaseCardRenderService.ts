/**
 * 基础卡片渲染服务
 * 
 * 职责：
 * - 提供通用的渲染辅助方法
 * - 不包含业务逻辑，只是工具方法集合
 * - 供各个卡片类型的 RenderService 继承使用
 * 
 * 注意：这不是一个完整的 DDD 层，只是共享代码
 */

import { getBlockBreadcrumb } from '@/core/siyuan/api';
import type { BreadcrumbItem } from './types';

export abstract class BaseCardRenderService {
  /**
   * 加载块的面包屑
   * 
   * @param blockId 块 ID
   * @param excludeLast 排除最后几项（默认 1，排除当前块）
   * @returns 面包屑列表
   */
  protected async loadBreadcrumbs(
    blockId: string,
    excludeLast: number = 1
  ): Promise<BreadcrumbItem[]> {
    try {
      const breadcrumbResult = await getBlockBreadcrumb(blockId);
      
      if (!breadcrumbResult || !Array.isArray(breadcrumbResult)) {
        return [];
      }
      
      // 排除最后 N 项
      const parentBreadcrumbs = breadcrumbResult.slice(0, -excludeLast);
      
      const allBreadcrumbs = parentBreadcrumbs.map((item: any) => ({
        id: item.id || '',
        name: item.name || '',
        type: item.type || 'NodeParagraph',
      }));
      
      // 去重：使用 Map 按标准化后的 name 去重
      return this.deduplicateBreadcrumbs(allBreadcrumbs);
    } catch (error) {
      console.error('[BaseCardRenderService] Failed to load breadcrumbs:', error);
      return [];
    }
  }

  /**
   * 去重面包屑
   * 
   * @param breadcrumbs 原始面包屑列表
   * @returns 去重后的面包屑列表
   */
  private deduplicateBreadcrumbs(breadcrumbs: BreadcrumbItem[]): BreadcrumbItem[] {
    const dedupMap = new Map<string, BreadcrumbItem>();
    
    for (const item of breadcrumbs) {
      // 标准化文本：去掉列表符号
      const normalizedName = item.name.replace(/^[•\-\d]+\.?\s*/, '').trim();
      dedupMap.set(normalizedName, {
        id: item.id,
        name: normalizedName,
        type: item.type,
      });
    }
    
    return Array.from(dedupMap.values());
  }

  /**
   * 创建答案分隔线 HTML
   * 
   * @param label 分隔线标签（默认"答案"）
   * @returns HTML 字符串
   */
  protected createAnswerDivider(label: string = '答案'): string {
    return `<div class="card-renderer__answer-divider"><span>${label}</span></div>`;
  }

  /**
   * 创建正面预览 HTML（灰显）
   * 
   * @param frontHtml 正面 HTML
   * @returns 包装后的 HTML
   */
  protected createFrontPreview(frontHtml: string): string {
    return `<div class="card-renderer__front-preview">${frontHtml}</div>`;
  }

  /**
   * 包装答案 HTML
   * 
   * @param answerHtml 答案 HTML
   * @returns 包装后的 HTML
   */
  protected wrapAnswer(answerHtml: string): string {
    return `<div class="card-renderer__answer">${answerHtml}</div>`;
  }

  /**
   * 组合背面 HTML（正面预览 + 分隔线 + 答案）
   * 
   * @param frontHtml 正面 HTML
   * @param answerHtml 答案 HTML
   * @param dividerLabel 分隔线标签
   * @returns 完整的背面 HTML
   */
  protected composeBackHtml(
    frontHtml: string,
    answerHtml: string,
    dividerLabel: string = '答案'
  ): string {
    const preview = this.createFrontPreview(frontHtml);
    const divider = this.createAnswerDivider(dividerLabel);
    const answer = this.wrapAnswer(answerHtml);
    
    return `${preview}${divider}${answer}`;
  }
}
