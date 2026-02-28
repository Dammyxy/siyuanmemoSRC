/**
 * IPluginFacade - 插件外观接口
 * 
 * 定义插件对外暴露的最小接口。
 * 这是 DDD 架构中的 Facade 模式。
 * 
 * 职责：
 * - 提供插件基本信息
 * - 提供设置访问
 * - 提供应用上下文访问
 * 
 * 设计原则：
 * - 最小化公开 API
 * - 隐藏内部实现细节
 * - 提供清晰的访问路径
 * 
 * @see .kiro/specs/ddd-refactoring/phase2-god-object-removal-plan.md
 */

import type { ApplicationContext } from '../ApplicationContext';

/**
 * 插件外观接口
 * 
 * 所有插件实现都应该实现此接口。
 * 外部代码只依赖此接口，不依赖具体实现。
 * 
 * 使用示例：
 * ```typescript
 * // 获取应用上下文
 * const context = plugin.getContext();
 * 
 * // 访问应用服务
 * const storage = context.getStorage();
 * const dialogManager = context.getDialogManager();
 * 
 * // 打开设置
 * plugin.openSettings();
 * 
 * // 获取到期卡片数量
 * const count = await plugin.getDueCount();
 * ```
 */
export interface IPluginFacade {
  /**
   * 是否为移动端
   * 
   * 用于判断当前运行环境，以便调整 UI 布局。
   */
  readonly isMobile: boolean;
  
  /**
   * 是否为浏览器端
   * 
   * 用于判断当前运行环境，以便调整功能可用性。
   */
  readonly isBrowser: boolean;
  
  /**
   * 获取应用上下文
   * 
   * 通过上下文可以访问所有应用服务：
   * - Storage: 数据存储
   * - DialogManager: 对话框管理
   * - CardService: 卡片服务
   * - EventBus: 事件总线
   * - 等等...
   * 
   * 这是访问应用功能的推荐方式。
   * 
   * @returns 应用上下文实例
   * 
   * @example
   * ```typescript
   * const context = plugin.getContext();
   * const storage = context.getStorage();
   * const cards = await storage.getAllCards();
   * ```
   */
  getContext(): ApplicationContext;
  
  /**
   * 打开设置对话框
   * 
   * 这是一个便捷方法，等价于：
   * `plugin.getContext().getDialogManager().openSettingsDialog(defaultTab)`
   * 
   * @param defaultTab - 默认打开的标签页（可选）
   * 
   * @example
   * ```typescript
   * // 打开设置对话框
   * plugin.openSettings();
   * 
   * // 打开特定标签页
   * plugin.openSettings('fsrs');
   * ```
   */
  openSettings(defaultTab?: string): void;
  
  /**
   * 获取到期卡片数量
   * 
   * 这是一个便捷方法，等价于：
   * `plugin.getContext().getCardService().getDueCount()`
   * 
   * @returns 到期卡片数量
   * 
   * @example
   * ```typescript
   * const count = await plugin.getDueCount();
   * console.log(`到期卡片数量：${count}`);
   * ```
   */
  getDueCount(): Promise<number>;

  /**
   * 打开子集复习（临时队列）
   */
  openSubsetReviewDialog(
    blockIds: string[],
    options?: {
      preferredCardId?: string;
    }
  ): Promise<void>;
}
