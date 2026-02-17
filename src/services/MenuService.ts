/**
 * MenuService - 菜单管理服务
 * 
 * 负责构建和管理插件的各类菜单
 * 从 index.ts 中抽取以提高代码可维护性
 */

import { Menu } from 'siyuan';
import type { StorageManager } from '@/core/storage/manager';

type I18n = Record<string, string>;

/**
 * 菜单服务的依赖接口
 */
export interface MenuServiceDependencies {
  i18n: I18n;
  storage: StorageManager;
  
  // 回调函数
  openReviewDialog: () => void;
  openFinalDrillDialog: () => void;
  openFilterGroupPracticeDialog: () => void;
  openIncrementalLearningDialog: () => void;
  openNeuralRoamDialog: () => void;
  openLeechReviewDialog: () => void;
  openSRSBrowser: () => void;
  openSetting: () => void;
  getDueCount: () => number;
}

/**
 * 菜单服务
 * 
 * 管理所有菜单的构建和显示
 */
export class MenuService {
  private readonly deps: MenuServiceDependencies;

  constructor(deps: MenuServiceDependencies) {
    this.deps = deps;
  }

  /**
   * 构建并打开顶栏菜单
   */
  openTopBarMenu(ev: MouseEvent): void {
    const menu = new Menu('fsrs-topbar-menu');

    // 提取练习
    menu.addItem({
      icon: 'iconCards',
      label: this.deps.i18n?.startReview || 'Start Retrieval Practice',
      accelerator: 'Alt+R',
      click: () => {
        this.deps.openReviewDialog();
      },
    });

    // 渐进学习
    menu.addItem({
      icon: 'iconBook',
      label: this.deps.i18n?.startIncrementalLearning || 'Start Incremental Learning',
      accelerator: 'Alt+I',
      click: () => {
        this.deps.openIncrementalLearningDialog();
      },
    });

    // 刻意练习
    menu.addItem({
      icon: 'iconCards',
      label: this.deps.i18n?.startDeliberatePractice || 'Start Deliberate Practice',
      accelerator: 'Alt+D',
      click: () => {
        this.deps.openFinalDrillDialog();
      },
    });

    // 神经漫游
    menu.addItem({
      icon: 'iconRefresh',
      label: this.deps.i18n?.startNeuralReview || 'Start Neural Roam',
      accelerator: 'Alt+N',
      click: () => {
        this.deps.openNeuralRoamDialog();
      },
    });

    // 筛选复习
    menu.addItem({
      icon: 'iconCards',
      label: (this.deps.i18n as any)?.startFilterGroupPractice || 'Start Filtered Review',
      accelerator: 'Alt+G',
      click: () => {
        this.deps.openFilterGroupPracticeDialog();
      },
    });

    // 难点攻坚（暂时隐藏）
    // menu.addItem({
    //   icon: 'iconBug',
    //   label: (this.deps.i18n as any)?.startLeechPractice || 'Start Leech Practice',
    //   accelerator: 'Alt+L',
    //   click: () => {
    //     this.deps.openLeechReviewDialog();
    //   },
    // });

    // SRS 浏览器
    menu.addItem({
      icon: 'iconLayoutRight',
      label: this.deps.i18n?.srsBrowser || 'SRS Browser',
      accelerator: 'Alt+B',
      click: () => {
        this.deps.openSRSBrowser();
      },
    });

    menu.addSeparator();

    // 设置
    menu.addItem({
      icon: 'iconSettings',
      label: this.deps.i18n?.settings || 'Settings',
      click: () => {
        this.deps.openSetting();
      },
    });

    menu.addSeparator();

    // 统计信息
    menu.addItem({
      icon: 'iconInfo',
      label: `${this.deps.i18n?.dueCountLabel || 'Due'}: ${this.deps.getDueCount()} / ${this.deps.i18n?.totalCountLabel || 'Total'}: ${this.deps.storage.getAllCards().length}`,
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

  /**
   * 构建块右键菜单项
   * 
   * @param blockId 块 ID
   * @returns 菜单项配置数组
   */
  buildBlockContextMenuItems(blockId: string): Array<{
    icon: string;
    label: string;
    click: () => void;
  }> {
    return [
      {
        icon: 'iconCards',
        label: this.deps.i18n?.addToReview || '添加到复习队列',
        click: () => {
          // 这里需要调用具体的添加逻辑
          console.log('[MenuService] Add to review queue:', blockId);
        },
      },
      {
        icon: 'iconRefresh',
        label: this.deps.i18n?.startNeuralFromHere || '从此开始神经漫游',
        click: () => {
          // 这里需要调用具体的神经漫游启动逻辑
          console.log('[MenuService] Start neural roam from:', blockId);
        },
      },
    ];
  }

  /**
   * 构建文档树右键菜单项
   * 
   * @param docId 文档 ID
   * @returns 菜单项配置数组
   */
  buildDocTreeContextMenuItems(docId: string): Array<{
    icon: string;
    label: string;
    click: () => void;
  }> {
    return [
      {
        icon: 'iconCards',
        label: this.deps.i18n?.addDocToReview || '添加文档到复习',
        click: () => {
          console.log('[MenuService] Add doc to review:', docId);
        },
      },
    ];
  }
}
