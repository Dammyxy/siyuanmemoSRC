import type FSRSPlugin from '@/index';

export class DockManager {
    constructor(private plugin: FSRSPlugin) { }

    public init() {
        // 注册 Dock 面板
        this.plugin.addDock({
            config: {
                position: 'RightBottom',
                size: { width: 400, height: 500 },
                icon: 'iconCards',
                title: 'FSRS',
            },
            data: { plugin: this.plugin },
            type: 'fsrs-dock',
            init: (dock) => {
                this.initDockPanel(dock.element);
            },
        });
    }

    /**
     * 初始化 Dock 面板
     */
    private initDockPanel(element: HTMLElement) {
        const dueCount = this.plugin.storage.getDueCards().length;
        const totalCount = this.plugin.storage.getAllCards().length;

        element.innerHTML = `
      <div class="fsrs-dock-container">
        <div class="fsrs-dock-header">FSRS ${this.plugin.i18n?.flashcard || '闪卡'}</div>
        <div class="fsrs-dock-content">
          <div class="fsrs-dock-stats">
            <div class="stat-item">
              <span class="stat-value">${dueCount}</span>
              <span class="stat-label">${this.plugin.i18n?.dueCountLabel || '待复习'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${totalCount}</span>
              <span class="stat-label">${this.plugin.i18n?.totalCountLabel || '总卡片'}</span>
            </div>
          </div>
          <div class="fsrs-dock-buttons">
            <button class="fsrs-dock-btn b3-button b3-button--outline" id="fsrs-start-review">
              <svg class="b3-button__icon"><use xlink:href="#iconRiffCard"></use></svg>
              ${this.plugin.i18n?.startReview || '开始复习'}
            </button>
            <button class="fsrs-dock-btn b3-button b3-button--outline" id="fsrs-card-browser">
              <svg class="b3-button__icon"><use xlink:href="#iconLayoutRight"></use></svg>
              ${this.plugin.i18n?.cardBrowser || '卡片浏览器'}
            </button>
          </div>
        </div>
      </div>
    `;

        // 绑定按钮事件
        element.querySelector('#fsrs-start-review')?.addEventListener('click', () => {
            this.plugin.openReviewDialog();
        });

        element.querySelector('#fsrs-card-browser')?.addEventListener('click', () => {
            this.plugin.openCardBrowser();
        });
    }
}
