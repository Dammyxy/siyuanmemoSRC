import FSRSPlugin from '../../index';
import { pushMsg, pushErrMsg } from '@/core/siyuan/api';
import { openTab, Menu } from 'siyuan';
import { createVueDialog } from '@/utils/dialog';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { riff } from '@/core/siyuan';
import { ATTR_CARD_ID } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { createDefaultCard, type FSRSCard } from '@/types';
import { markBlockAsCard, unmarkBlockAsCard, getCardBlockIds } from '@/core/siyuan/block';
import { sql } from '@/core/siyuan/api';
import { ReviewService } from '../../services/ReviewService';
import { CardService } from '../../services/CardService';

/**
 * 插件UI操作的组装器
 * 负责将UI相关的操作逻辑从主插件类中分离
 */
export class PluginUIAssembler {
  constructor(
    private plugin: FSRSPlugin,
    private reviewService: ReviewService,
    private cardService: CardService
  ) {}

  /**
   * 设置顶栏和相关事件
   */
  setupTopBar() {
    try {
      this.plugin.addIcons(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="iconSiyuanMemo" viewBox="0 0 24 24">
    <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/>
  </symbol>
</svg>`);
      this.plugin.topBarElement = this.plugin.addTopBar({
        icon: 'iconSiyuanMemo',
        title: this.plugin.i18n?.topbarTitle || '间隔重复系统 (左键SRS浏览器/右键菜单)',
        position: 'right',
        callback: () => {
          if (!this.plugin.isInitialized) {
            void pushMsg(this.plugin.i18n?.loading || '插件初始化中，请稍后...');
            return;
          }
          this.openSRSBrowser();
        },
      });
      this.plugin.topBarElement.classList.add('fsrs-topbar');

      this.plugin.topBarContextMenuHandler = (ev: MouseEvent) => {
        ev.preventDefault();
        this.plugin.openTopBarMenu(ev);
      };
      this.plugin.topBarElement!.addEventListener('contextmenu', this.plugin.topBarContextMenuHandler);
    } catch (err) {
      console.error('[SiYuanMemo] Failed to register topbar:', err);
    }
  }

  private ensureTopbarMounted(): void {
    const el = this.plugin.topBarElement;
    if (!el) return;
    if (el.isConnected) return;

    const right = document.querySelector('.toolbar__right') as HTMLElement | null;
    const left = document.querySelector('.toolbar__left') as HTMLElement | null;
    const container = right || left;
    if (container) {
      try {
        container.appendChild(el);
        el.style.display = '';
        el.style.opacity = '1';
        el.style.pointerEvents = '';
        return;
      } catch (err) {
        if (!this.plugin.didWarnTopbarMount) {
          console.warn('[SiYuanMemo] Failed to remount topbar element:', err);
          this.plugin.didWarnTopbarMount = true;
        }
        return;
      }
    }

    if (!this.plugin.didWarnTopbarMount) {
      console.warn('[SiYuanMemo] Topbar container not found; topbar button may be hidden by layout');
      this.plugin.didWarnTopbarMount = true;
    }
  }

  /**
   * 打开卡片浏览器（Dialog 模式）
   * 实现单例模式：避免重复打开多个浏览器窗口
   */
  openSRSBrowser() {
    // 如果已有打开的浏览器，先销毁
    if (this.plugin.srsBrowserDialog) {
      this.plugin.srsBrowserDialog.destroy();
    }

    this.plugin.srsBrowserDialog = createVueDialog({
      title: this.plugin.i18n?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        app: this.plugin.app,
        i18n: this.plugin.i18n || {},
        mode: 'dialog',
        plugin: this.plugin,
      },
      events: {
        convertToTab: () => {
          // 关闭对话框并打开 Tab
          this.plugin.srsBrowserDialog?.destroy();
          this.plugin.srsBrowserDialog = null;
          this.openSRSBrowserTab();
        },
      },
      width: '90vw',
      height: '80vh',
      onClose: () => {
        // 对话框关闭时清理引用
        this.plugin.srsBrowserDialog = null;
      },
    });
  }

  /**
   * 打开卡片浏览器（Tab 模式）
   */
  openSRSBrowserTab() {
    openTab({
      app: this.plugin.app,
      custom: {
        icon: 'iconCard',
        title: this.plugin.i18n?.srsBrowser || 'SRS 浏览器',
        id: this.plugin.name + this.plugin.TAB_TYPE,
        data: {},
      },
      position: 'right',
    });
  }

  /**
   * 初始化 Dock 面板
   */
  initDockPanel(element: HTMLElement) {
    const dueCount = this.plugin.storage.getDueCards().length;
    const totalCount = this.plugin.storage.getAllCards().length;

    element.innerHTML = `
      <div class="siyuanmemo-dock-container">
        <div class="siyuanmemo-dock-header">FSRS ${this.plugin.i18n?.flashcard || '闪卡'}</div>
        <div class="siyuanmemo-dock-content">
          <div class="siyuanmemo-dock-stats">
            <div class="stat-item">
              <span class="stat-value">${dueCount}</span>
              <span class="stat-label">${this.plugin.i18n?.dueCountLabel || '待复习'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${totalCount}</span>
              <span class="stat-label">${this.plugin.i18n?.totalCountLabel || '总卡片'}</span>
            </div>
          </div>
          <div class="siyuanmemo-dock-buttons">
            <button class="siyuanmemo-dock-btn b3-button b3-button--outline" id="fsrs-start-review">
              <svg class="b3-button__icon"><use xlink:href="#iconRiffCard"></use></svg>
              ${this.plugin.i18n?.startReview || '开始复习'}
            </button>
            <button class="siyuanmemo-dock-btn b3-button b3-button--outline" id="fsrs-srs-browser">
              <svg class="b3-button__icon"><use xlink:href="#iconLayoutRight"></use></svg>
              ${this.plugin.i18n?.srsBrowser || 'SRS 浏览器'}
            </button>
          </div>
        </div>
      </div>
    `;

    // 绑定按钮事件
    element.querySelector('#fsrs-start-review')?.addEventListener('click', () => {
      this.plugin.openReviewDialog();
    });

    element.querySelector('#fsrs-srs-browser')?.addEventListener('click', () => {
      this.openSRSBrowser();
    });
  }
}

/**
 * 插件块菜单处理器
 * 负责处理与块相关的菜单操作
 */
export class BlockMenuAssembler {
  constructor(
    private plugin: FSRSPlugin,
    private cardService: CardService
  ) {}

  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  handleBlockIconClick(e: any) {
    this.cardService.handleBlockIconClick(e);
  }
}