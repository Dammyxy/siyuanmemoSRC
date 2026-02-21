/**
 * TabManager - Tab 管理器
 * 
 * 职责：
 * - 管理所有 Tab 的注册和打开
 * - 统一 Tab 生命周期管理
 * - 提供 Tab 访问接口
 * 
 * @see .kiro/specs/ddd-refactoring/design.md - Section 2.5
 */

import type { Plugin } from 'siyuan';
import type { ApplicationContext } from '../ApplicationContext';
import { openTab, Constants } from 'siyuan';
import { createApp } from 'vue';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { ReviewView } from '@/ui/review/v2';
import { pushErrMsg } from '@/core/siyuan/api';
/// #if !BROWSER
import { ipcRenderer } from 'electron';
/// #endif

/**
 * 复习 Tab 选项
 */
export interface ReviewTabOptions {
  /** 提供者（可选） */
  provider?: any;
  /** 队列（可选） */
  queue?: any;
  /** 适配器 */
  adapter: any;
  /** 标题 */
  title: string;
}

/**
 * TabManager 类
 * 
 * 管理所有 Tab 的注册和打开。
 * 
 * 使用示例：
 * ```typescript
 * const tabManager = new TabManager(context, plugin);
 * 
 * // 注册所有 Tab
 * tabManager.registerAll();
 * 
 * // 打开浏览器 Tab
 * tabManager.openBrowserTab();
 * 
 * // 打开复习 Tab
 * tabManager.openReviewTab({
 *   adapter: myAdapter,
 *   title: '提取练习'
 * });
 * ```
 */
export class TabManager {
  // ========================================================================
  // Tab 类型常量
  // ========================================================================
  
  private readonly TAB_TYPE: string;
  private readonly REVIEW_TAB_TYPE: string;
  
  // ========================================================================
  // 构造函数
  // ========================================================================
  
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin
  ) {
    this.TAB_TYPE = this.plugin.name + '-browser';
    this.REVIEW_TAB_TYPE = this.plugin.name + '-review';
  }
  
  // ========================================================================
  // 注册 Tab
  // ========================================================================
  
  /**
   * 注册所有 Tab
   * 
   * 包括：
   * - SRS 浏览器 Tab
   * - 复习界面 Tab
   */
  registerAll(): void {
    this.registerBrowserTab();
    this.registerReviewTab();
  }
  
  /**
   * 注册 SRS 浏览器 Tab
   * 
   * 浏览器 Tab 用于查看和管理所有卡片。
   */
  private registerBrowserTab(): void {
    const self = this;
    
    this.plugin.addTab({
      type: this.TAB_TYPE,
      init() {
        const app = createApp(SRSBrowser, {
          app: self.plugin.app,
          i18n: self.context.getI18n() || {},
          mode: 'tab',
          plugin: self.plugin,
        });
        app.mount(this.element);
        (this as any).vueApp = app;
      },
      destroy() {
        if ((this as any).vueApp) {
          (this as any).vueApp.unmount();
        }
      },
    });
  }
  
  /**
   * 注册复习界面 Tab
   * 
   * 复习 Tab 用于进行卡片复习。
   */
  private registerReviewTab(): void {
    const plugin = this.plugin;
    
    this.plugin.addTab({
      type: this.REVIEW_TAB_TYPE,
      init() {
        // 从 Tab data 恢复状态
        const savedProvider = (this as any).data?.provider;
        const savedQueue = (this as any).data?.queue;
        const savedAdapter = (this as any).data?.adapter;
        const savedTitle = (this as any).data?.title;
        const savedProviderId = (this as any).data?.providerId || 'retrieval';

        console.log('[FSRS Review Tab] Restoring state:', {
          hasProvider: !!savedProvider,
          hasQueue: !!savedQueue,
          hasAdapter: !!savedAdapter,
          title: savedTitle,
          providerId: savedProviderId,
        });

        // 如果有 savedQueue，使用 queue + adapter 模式
        if (savedQueue && savedAdapter) {
          console.log('[FSRS Review Tab] Using queue + adapter mode');
          const app = createApp(ReviewView, {
            app: plugin.app,
            i18n: (plugin as any).i18n || {},
            mode: 'tab',
            title: savedTitle,
            queue: savedQueue,
            adapter: savedAdapter,
            plugin: plugin, // 🆕 传递 plugin 实例
          });
          app.mount(this.element);
          (this as any).vueApp = app;
          return;
        }

        // 否则使用 provider 模式（默认）
        console.log('[FSRS Review Tab] Using provider mode');
        const app = createApp(ReviewView, {
          app: plugin.app,
          i18n: (plugin as any).i18n || {},
          mode: 'tab',
          title: savedTitle || '提取练习',
          provider: savedProvider,
          plugin: plugin, // 🆕 传递 plugin 实例
        });
        app.mount(this.element);
        (this as any).vueApp = app;
      },
      destroy() {
        if ((this as any).vueApp) {
          (this as any).vueApp.unmount();
        }
      },
    });
  }
  
  // ========================================================================
  // 打开 Tab
  // ========================================================================
  
  /**
   * 打开 SRS 浏览器 Tab
   * 
   * 在右侧打开一个新的浏览器 Tab，用于查看和管理所有卡片。
   */
  openBrowserTab(): void {
    openTab({
      app: this.plugin.app,
      custom: {
        icon: 'iconCard',
        title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
        id: this.plugin.name + this.TAB_TYPE,
        data: {},
      },
      position: 'right',
    });
  }
  
  /**
   * 打开复习界面 Tab
   * 
   * 在右侧打开一个新的复习 Tab，用于进行卡片复习。
   * 
   * @param options - 复习 Tab 选项
   * @param options.provider - 提供者（可选）
   * @param options.queue - 队列（可选）
   * @param options.adapter - 适配器
   * @param options.title - 标题
   */
  openReviewTab(options: ReviewTabOptions): void {
    try {
      const providerId = options.provider?.id || (options.queue ? 'queue-based' : 'retrieval');
      
      // 🔧 修复循环引用问题：不直接传递对象，而是传递配置信息
      // 在 Tab 的 init 中重新创建这些对象
      openTab({
        app: this.plugin.app,
        custom: {
          icon: 'iconSiyuanMemo',
          title: options.title,
          id: this.plugin.name + this.REVIEW_TAB_TYPE,
          data: {
            // 只传递配置信息，不传递对象实例
            providerId: providerId,
            title: options.title,
            // 如果需要队列信息，传递队列类型而不是实例
            queueType: options.queue?.getType?.() || null,
          },
        },
        position: 'right',
      });
    } catch (err) {
      console.error('[TabManager] Failed to open review tab:', err);
    }
  }
  
  /**
   * 在新窗口中打开复习界面
   * 
   * @param options - 复习 Tab 选项
   */
  openReviewInNewWindow(options: ReviewTabOptions): void {
    /// #if !BROWSER
    try {
      const providerId = options.provider?.id || (options.queue ? 'queue-based' : 'retrieval');
      
      // 🔧 修复：不传递完整对象，只传递必要的标识符
      // 新窗口会重新创建 provider/queue/adapter
      const json = [{
        "title": options.title,
        "icon": "iconSiyuanMemo",
        "instance": "Tab",
        "children": {
          "instance": "Custom",
          "customModelType": this.REVIEW_TAB_TYPE,
          "customModelData": {
            // 只传递标识符，不传递完整对象（避免循环引用）
            "providerId": providerId,
            "title": options.title,
            // 新窗口会根据 providerId 重新创建 provider/queue/adapter
          }
        }
      }];
      
      // 发送到主进程（参考思源原生实现）
      ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {
        url: `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?v=${Constants.SIYUAN_VERSION}&json=${encodeURIComponent(JSON.stringify(json))}`
      });
      
      console.log('[TabManager] Opened review in new window');
    } catch (err) {
      console.error('[TabManager] Failed to open review in new window:', err);
      void pushErrMsg(this.context.getI18n()?.openFailed || '打开新窗口失败');
    }
    /// #else
    // 浏览器环境降级：使用 Tab 模式
    console.warn('[TabManager] New window not supported in browser, using tab instead');
    this.openReviewTab(options);
    /// #endif
  }
  
  /**
   * 打开文档 Tab
   * 
   * 在编辑器中打开指定的文档块。
   * 
   * @param blockId - 块 ID
   */
  openDocumentTab(blockId: string): void {
    if (!blockId) {
      console.warn('[TabManager] Cannot open document: blockId is empty');
      return;
    }
    
    try {
      (this.plugin.app as any).openTab({
        app: this.plugin.app,
        doc: { id: blockId },
      });
    } catch (err) {
      console.error('[TabManager] Failed to open document tab:', err);
    }
  }
  
  // ========================================================================
  // 生命周期管理
  // ========================================================================
  
  /**
   * 销毁 Tab 管理器
   * 
   * 注意：Tab 的生命周期由思源笔记管理，这里不需要手动清理。
   */
  dispose(): void {
    // Tab 的生命周期由思源笔记管理，不需要手动清理
  }
}
