/**
 * 多挖孔卡渲染服务
 * 
 * 职责：
 * - 协调多挖孔卡的渲染逻辑
 * - 准备多挖孔卡视图模型
 * - 继承基类的通用功能
 */

import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';

/**
 * 多挖孔卡视图模型
 */
export interface MultiClozeCardViewModel extends BaseCardViewModel {
  currentFace: {
    question: string;
    answer: string;
  };
  faceIndex: number;
  totalFaces: number;
}

/**
 * 多挖孔卡渲染服务
 */
export class MultiClozeCardRenderService extends BaseCardRenderService {
  /**
   * 准备视图模型
   * 
   * @param card FSRSCard，包含 meta.faces 和 meta.faceIndex
   * @returns 视图模型
   */
  async prepareViewModel(card: any): Promise<MultiClozeCardViewModel> {
    const faces = card.meta?.faces || [];
    const faceIndex = card.meta?.faceIndex ?? 0;
    let currentFace = faces[faceIndex] || { question: '', answer: '' };
    
    // 🔧 兼容旧数据：只在问题中将 [...] 转换为 <mark> 标签
    // 答案保持纯文本，不添加样式
    currentFace = {
      question: this.wrapClozeWithMark(currentFace.question),
      answer: this.stripMarkTags(currentFace.answer), // 移除答案中的 mark 标签
    };
    
    // 使用基类方法加载面包屑
    const breadcrumbs = await this.loadBreadcrumbs(card.blockId);
    
    return {
      blockId: card.blockId,
      breadcrumbs,
      currentFace,
      faceIndex,
      totalFaces: faces.length,
    };
  }
  
  /**
   * 将问题中的纯文本 [...] 转换为 <mark>[...]</mark>
   * 兼容旧数据格式
   */
  private wrapClozeWithMark(text: string): string {
    if (!text) return text;
    
    // 如果已经包含 <mark> 标签，直接返回
    if (text.includes('<mark>')) return text;
    
    // 将 [...] 替换为 <mark>[...]</mark>
    return text.replace(/\[\.\.\.]/g, '<mark>[...]</mark>');
  }
  
  /**
   * 移除文本中的 <mark> 标签，保持纯文本
   */
  private stripMarkTags(text: string): string {
    if (!text) return text;
    
    // 移除 <mark> 和 </mark> 标签
    return text.replace(/<\/?mark>/g, '');
  }
}
