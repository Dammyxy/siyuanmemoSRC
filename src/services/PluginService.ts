import type FSRSPlugin from '../index';
import { DialogService } from './DialogService';
import { MenuService } from './MenuService';
import { ReviewService } from './ReviewService';
import { CardService } from './CardService';
import { createVueDialog } from '@/utils/dialog';
import { openTab } from 'siyuan';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';

/**
 * 主插件服务类
 * 负责统一管理插件的所有服务和功能模块
 */
export class PluginService {
  // 各种服务实例
  public dialogService: DialogService;
  public menuService: MenuService;
  public reviewService: ReviewService;
  public cardService: CardService;

  constructor(private plugin: FSRSPlugin) {
    // 初始化所有服务
    this.dialogService = new DialogService(plugin);
    this.menuService = new MenuService(plugin);
    this.reviewService = new ReviewService(plugin);
    this.cardService = new CardService(plugin);
  }

  /**
   * 初始化所有服务
   */
  async initialize() {
    // 目前各服务在构造时已初始化，未来如有异步初始化需求可在此添加
  }

  /**
   * 销毁所有服务
   */
  destroy() {
    // 关闭可能打开的对话框
    this.plugin.reviewDialog?.destroy();
    this.plugin.srsBrowserDialog?.destroy();
  }

  // 以下是统一的便捷方法，便于外部调用

  /**
   * UI相关操作
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
   * 复习相关操作
   */
  async openReviewDialog() {
    await this.reviewService.openReviewDialog();
  }

  async openReviewV2Dialog() {
    await this.reviewService.openReviewV2Dialog();
  }

  async openReviewProviderV2Dialog() {
    await this.reviewService.openReviewProviderV2Dialog();
  }

  async openLeechReviewDialog() {
    await this.reviewService.openLeechReviewDialog();
  }

  async openFinalDrillV2Dialog() {
    await this.reviewService.openFinalDrillV2Dialog();
  }

  async openFinalDrillProviderV2Dialog() {
    await this.reviewService.openFinalDrillProviderV2Dialog();
  }

  async openFinalDrillDialog() {
    await this.reviewService.openFinalDrillDialog();
  }

  async openIncrementalLearningDialog() {
    await this.reviewService.openIncrementalLearningDialog();
  }

  async openFilterGroupPracticeDialog() {
    await this.reviewService.openFilterGroupPracticeDialog();
  }

  async openLeechPracticeDialog() {
    await this.reviewService.openLeechPracticeDialog();
  }

  async openNeuralRoamDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.reviewService.openNeuralRoamDialog(options);
  }

  async openNeuralRoamV2Dialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.reviewService.openNeuralRoamV2Dialog(options);
  }

  async openNeuralReviewDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.reviewService.openNeuralReviewDialog(options);
  }

  async openSubsetReviewDialog(blockIds: string[]) {
    await this.reviewService.openSubsetReviewDialog(blockIds);
  }

  openDrillDialogWithCards(cards: any[], practiceMode: 'queue' | 'block' = 'queue') {
    this.reviewService.openDrillDialogWithCards(cards, practiceMode);
  }

  /**
   * 卡片相关操作
   */
  handleBlockIconClick(e: any) {
    this.cardService.handleBlockIconClick(e);
  }

  getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
    return this.cardService.getDrillBlockElements(blockElements);
  }

  buildDrillCardsFromElements(elements: HTMLElement[]) {
    return this.cardService.buildDrillCardsFromElements(elements);
  }

  async getDrillCardsFromDocTree(docId: string) {
    return this.cardService.getDrillCardsFromDocTree(docId);
  }

  async buildDrillCardsFromBlockIds(blockIds: string[]) {
    return this.cardService.buildDrillCardsFromBlockIds(blockIds);
  }

  /**
   * 菜单相关操作
   */
  openTopBarMenu(ev: MouseEvent) {
    this.menuService.openTopBarMenu(ev);
  }

  /**
   * 对话框相关操作
   */
  createCustomDialog(config: any) {
    return this.dialogService.createDialog(config);
  }
}