/**
 * MenuManager - 菜单管理器
 * 
 * 职责：
 * - 管理所有菜单的注册和打开
 * - 构建菜单项
 * - 将用户操作委托给 DialogManager
 * 
 * 设计原则：
 * - 单一职责：只负责菜单的构建和显示
 * - 依赖注入：通过构造函数注入 DialogManager
 * - 职责分离：不直接打开对话框，委托给 DialogManager
 * 
 * @see .kiro/specs/ddd-refactoring/design.md - Section 2.5
 * @see .kiro/specs/ddd-refactoring/menu-manager-improvement.md
 */

import type { Plugin } from 'siyuan';
import type { ApplicationContext } from '../ApplicationContext';
import type { DialogManager } from './DialogManager';
import { Menu } from 'siyuan';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MenuManager');

/**
 * MenuManager 类
 * 
 * 管理所有菜单的注册和打开。
 * 
 * 使用示例：
 * ```typescript
 * const dialogManager = new DialogManager(context, plugin);
 * const menuManager = new MenuManager(context, plugin, i18n, dialogManager);
 * 
 * // 注册所有菜单
 * menuManager.registerAll();
 * 
 * // 打开顶栏菜单
 * menuManager.openTopBarMenu(ev);
 * ```
 */
export class MenuManager {
  // ========================================================================
  // 构造函数
  // ========================================================================
  
  /**
   * 创建 MenuManager 实例
   * 
   * @param context - 应用上下文
   * @param plugin - 插件实例
   * @param i18n - 国际化字典
   * @param dialogManager - 对话框管理器（依赖注入）
   */
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    private i18n: Record<string, string>,
    private dialogManager: DialogManager
  ) {}
  
  // ========================================================================
  // 注册菜单
  // ========================================================================
  
  /**
   * 注册所有菜单
   * 
   * 包括：
   * - 顶栏菜单
   * - 块右键菜单
   * - 命令面板
   */
  registerAll(): void {
    this.registerTopBar();
    this.registerBlockMenu();
    this.registerCommands();
  }
  
  /**
   * 注册顶栏菜单
   * 
   * 顶栏菜单通过右键点击顶栏图标打开。
   */
  private registerTopBar(): void {
    // 顶栏菜单的注册在 index.ts 中完成
    // 这里只是占位，实际的菜单打开逻辑在 openTopBarMenu 方法中
  }
  
  /**
   * 注册块右键菜单
   * 
   * 在块右键菜单中添加插件相关的菜单项。
   */
  private registerBlockMenu(): void {
    // TODO: 实现块右键菜单注册
    // 需要监听块右键事件，并添加菜单项
  }
  
  /**
   * 注册命令面板
   * 
   * 在命令面板中添加插件相关的命令。
   */
  private registerCommands(): void {
    // TODO: 实现命令面板注册
    // 使用 plugin.addCommand() 注册命令
  }
  
  // ========================================================================
  // 顶栏菜单
  // ========================================================================
  
  /**
   * 打开顶栏菜单
   * 
   * @param ev - 鼠标事件
   */
  async openTopBarMenu(ev: MouseEvent): Promise<void> {
    const menu = new Menu('fsrs-topbar-menu');
    
    // 通过应用服务获取统计信息
    const cardService = this.context.getCardService();
    const dueResult = await cardService.getDueCards();
    
    // 提取练习
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startReview || 'Start Retrieval Practice',
      accelerator: 'Alt+R',
      click: () => {
        this.openReviewDialog();
      },
    });
    
    // 渐进学习
    menu.addItem({
      icon: 'iconBook',
      label: this.i18n?.startIncrementalLearning || 'Start Incremental Learning',
      accelerator: 'Alt+I',
      click: () => {
        this.openIncrementalLearningDialog();
      },
    });
    
    // 刻意练习
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startDeliberatePractice || 'Start Deliberate Practice',
      accelerator: 'Alt+D',
      click: () => {
        this.openFinalDrillDialog();
      },
    });
    
    // 神经漫游
    menu.addItem({
      icon: 'iconRefresh',
      label: this.i18n?.startNeuralReview || 'Start Neural Roam',
      accelerator: 'Alt+N',
      click: () => {
        this.openNeuralRoamDialog();
      },
    });
    
    // 筛选复习
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startFilterGroupPractice || 'Start Filtered Review',
      accelerator: 'Alt+G',
      click: () => {
        this.openFilterGroupPracticeDialog();
      },
    });
    
    // SRS 浏览器
    menu.addItem({
      icon: 'iconLayoutRight',
      label: this.i18n?.srsBrowser || 'SRS Browser',
      accelerator: 'Alt+B',
      click: () => {
        this.openSRSBrowser();
      },
    });
    
    menu.addSeparator();
    
    // 设置
    menu.addItem({
      icon: 'iconSettings',
      label: this.i18n?.settings || 'Settings',
      click: () => {
        this.openSettings();
      },
    });
    
    menu.addSeparator();
    
    // 统计信息（使用应用服务获取）
    menu.addItem({
      icon: 'iconInfo',
      label: `${this.i18n?.dueCountLabel || 'Due'}: ${dueResult.count} / ${this.i18n?.totalCountLabel || 'Total'}: ${dueResult.total}`,
      type: 'readonly',
    });
    
    // 打开菜单
    const anchor = (ev.currentTarget || ev.target) as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect?.();
    if (rect) {
      menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
      });
    } else {
      menu.open({ x: ev.clientX, y: ev.clientY, isLeft: true });
    }
  }
  
  // ========================================================================
  // 块右键菜单
  // ========================================================================
  
  /**
   * 打开块右键菜单
   * 
   * @param e - 菜单事件
   */
  openBlockMenu(e: unknown): void {
    // TODO: 实现块右键菜单
    logger.debug('Block menu not implemented yet');
    void e;
  }
  
  // ========================================================================
  // 辅助方法 - 委托给 DialogManager
  // ========================================================================
  
  /**
   * 打开提取练习对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openReviewDialog(): void {
    this.dialogManager.openReviewDialog();
  }
  
  /**
   * 打开渐进学习对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openIncrementalLearningDialog(): void {
    this.dialogManager.openIncrementalLearningDialog();
  }
  
  /**
   * 打开刻意练习对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openFinalDrillDialog(): void {
    this.dialogManager.openFinalDrillDialog();
  }
  
  /**
   * 打开神经漫游对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openNeuralRoamDialog(): void {
    this.dialogManager.openNeuralRoamDialog();
  }
  
  /**
   * 打开筛选复习对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openFilterGroupPracticeDialog(): void {
    this.dialogManager.openFilterGroupPracticeDialog();
  }
  
  /**
   * 打开 SRS 浏览器
   * 
   * 委托给 DialogManager 处理
   */
  private openSRSBrowser(): void {
    this.dialogManager.openBrowserDialog();
  }
  
  /**
   * 打开设置对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openSettings(): void {
    this.dialogManager.openSettingsDialog();
  }
  
  // ========================================================================
  // ========================================================================
  // 生命周期管理
  // ========================================================================
  
  /**
   * 销毁菜单管理器
   */
  dispose(): void {
    // 清理资源（如果有的话）
  }
}

