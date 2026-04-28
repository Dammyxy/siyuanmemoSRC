/**
 * DockManager - 管理 Dock 面板
 */

import type { Plugin } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';

export class DockManager {
  constructor(
    _plugin: Plugin,
    private context: ApplicationContext,
    private i18n: Record<string, string>
  ) {}

  /**
   * 初始化 Dock 面板
   */
  async initDockPanel(element: HTMLElement, onStartReview: () => void, onOpenBrowser: () => void): Promise<void> {
    // 通过应用服务获取统计信息
    const cardService = this.context.getCardService();
    const dueCount = await cardService.getDueCount();
    const totalCount = await cardService.getTotalCount();

    element.innerHTML = `
      <div class="siyuanmemo-dock-container">
        <div class="siyuanmemo-dock-header">FSRS ${this.i18n?.flashcard || '闪卡'}</div>
        <div class="siyuanmemo-dock-content">
          <div class="siyuanmemo-dock-stats">
            <div class="stat-item">
              <span class="stat-value">${dueCount}</span>
              <span class="stat-label">${this.i18n?.dueCountLabel || '待复习'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${totalCount}</span>
              <span class="stat-label">${this.i18n?.totalCountLabel || '总卡片'}</span>
            </div>
          </div>
          <div class="siyuanmemo-dock-buttons">
            <button class="siyuanmemo-dock-btn b3-button b3-button--outline" id="fsrs-start-review">
              <svg class="b3-button__icon"><use xlink:href="#iconRiffCard"></use></svg>
              ${this.i18n?.startReview || '开始复习'}
            </button>
            <button class="siyuanmemo-dock-btn b3-button b3-button--outline" id="fsrs-srs-browser">
              <svg class="b3-button__icon"><use xlink:href="#iconLayoutRight"></use></svg>
              ${this.i18n?.srsBrowser || 'SRS 浏览器'}
            </button>
          </div>
        </div>
      </div>
    `;

    // 绑定按钮事件
    element.querySelector('#fsrs-start-review')?.addEventListener('click', onStartReview);
    element.querySelector('#fsrs-srs-browser')?.addEventListener('click', onOpenBrowser);
  }
}
