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
    const currentFace = faces[faceIndex] || { question: '', answer: '' };
    
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
}
