/**
 * IDialogManager - 对话框管理器接口
 * 
 * 定义对话框管理的标准契约。
 * 这是 DDD 架构中的依赖倒置原则（DIP）的体现。
 * 
 * 职责：
 * - 定义对话框打开的标准方法
 * - 为不同的管理器提供统一接口
 * - 隐藏对话框创建的复杂性
 * 
 * 实现类：
 * - DialogManager - 对话框管理器实现
 * 
 * @see .kiro/specs/ddd-refactoring/COMPREHENSIVE-DDD-REFACTORING-PLAN.md - 阶段 1
 */

import type { QueueType } from '@/types/unified-data-source';
import type { BrowserOpenState } from '@/types/browser';

/**
 * 对话框管理器接口
 * 
 * 所有对话框管理器实现都必须实现此接口。
 * 其他组件只依赖此接口，不依赖具体实现。
 */
export interface IDialogManager {
  /**
   * 打开 Arena 管理器
   */
  openArenaManagerDialog(): Promise<void>;

  /**
   * 打开渐进 Split 标记选择对话框
   */
  openProgressiveSplitDialog(docId: string, mode: 'linear' | 'nonlinear'): Promise<void>;

  /**
   * 打开提取练习对话框
   */
  openReviewDialog(options?: { entrySurface?: string | null }): Promise<void>;

  /**
   * 打开带过滤条件的提取练习对话框
   */
  openRetrievalPracticeWithFilter(options: {
    blockIds: string[];
    cardIds?: string[];
    preferredCardId?: string;
    scopeDocIds?: string[];
    dueOnly: boolean;
  }): Promise<void>;
  
  /**
   * 打开渐进学习对话框
   */
  openIncrementalLearningDialog(): Promise<void>;

  /**
   * 打开带过滤条件的渐进学习对话框
   */
  openIncrementalLearningWithFilter(options: {
    blockIds: string[];
    cardIds?: string[];
    preferredCardId?: string;
    scopeDocIds?: string[];
    dueOnly: boolean;
  }): Promise<void>;
  
  /**
   * 打开刻意练习对话框
   */
  openFinalDrillDialog(): Promise<void>;
  
  /**
   * 打开神经漫游对话框
   * 
   * @param options - 可选配置
   * @param options.focusBlockId - 焦点块 ID
   * @param options.includeFocusAsFirst - 是否将焦点块作为第一张卡片
   * @param options.resetHistory - 是否重置历史记录
   * @param options.startNewSession - 是否新建独立漫游路径并保留旧历史
   */
  openNeuralRoamDialog(options?: {
    focusBlockId?: string;
    includeFocusAsFirst?: boolean;
    resetHistory?: boolean;
    startNewSession?: boolean;
  }): Promise<void>;
  
  /**
   * 打开筛选复习对话框
   */
  openFilterGroupPracticeDialog(): Promise<void>;

  /**
   * 在当前对话框表面内切换主复习队列
   */
  switchStandardReviewDialogQueue(queueType: QueueType): Promise<void>;

  /**
   * 读取当前打开的 Review 对话框队列类型
   */
  getActiveReviewQueueType?(): QueueType | null;
  
  /**
   * 打开难点攻坚对话框
   */
  openLeechReviewDialog(): Promise<void>;
  
  /**
   * 打开浏览器对话框
   */
  openBrowserDialog(options?: {
    initialOpenState?: BrowserOpenState | null;
    initialQueueId?: string;
    initialNeuralSubview?: 'concept-cards' | 'engine-history' | 'roam-history' | 'worldline-anchors';
  }): Promise<void>;

  /**
   * 打开 SRS 卡片语义诊断与修复对话框
   */
  openSrsCardSemanticsRepairDialog(): Promise<void>;

  /**
   * 打开移动端队列启动面板
   */
  openMobileQueueLauncherDialog(): Promise<void>;

  /**
   * 关闭移动端队列启动面板
   */
  closeMobileQueueLauncherDialog(): void;
  
  /**
   * 关闭浏览器对话框
   */
  closeBrowserDialog(): void;
  
  /**
   * 打开设置对话框
   * 
   * @param defaultTab - 默认标签页（可选）
   */
  openSettingsDialog(defaultTab?: string): Promise<void>;
  
  /**
   * 关闭设置对话框
   */
  closeSettingsDialog(): void;
  
  /**
   * 打开子集复习对话框
   * 
   * @param blockIds - 块 ID 列表
   */
  openSubsetReviewDialog(
    blockIds: string[],
    options?: {
      cardIds?: string[];
      preferredCardId?: string;
    }
  ): Promise<void>;
  
  /**
   * 打开临时演练对话框
   * 
   * @param blockIds - 块 ID 列表
   */
  openTemporaryDrill(
    blockIds: string[],
    options?: {
      cardIds?: string[];
      preferredCardId?: string;
    },
  ): Promise<void>;
  
  /**
   * 打开创建模板卡片对话框
   * 
   * @param blockIds - 块 ID 列表
   */
  openCreateTemplateCardDialog(blockIds: string[]): Promise<void>;
  
  /**
   * 销毁资源
   */
  dispose(): void;
}
