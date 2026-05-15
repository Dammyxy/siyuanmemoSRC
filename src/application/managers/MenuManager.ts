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
import { Menu, showMessage } from 'siyuan';
import type { AutoCardHandler } from '@/application/handlers/AutoCardHandler';
import { createLogger } from '@/utils/logger';
import type { FSRSCard } from '@/types/card';
import { isErr } from '@/types/result';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { buildClearedBlockAttrs } from '@/application/usecases/card/shared/CardBlockAttrCleaner';
import {
  TOPBAR_QUICK_ENTRY_DEFINITIONS,
  type TopBarQuickEntryActionId,
} from '@/application/entries/TopBarQuickEntryRegistry';
import { CoreReviewEntryService, type CoreReviewEntryActionId } from '@/application/entries/CoreReviewEntryService';

const logger = createLogger('MenuManager');
type BlockIdSqlRow = { id?: unknown; root_id?: unknown };
const TOPBAR_MENU_HIDDEN_ACTIONS = new Set<TopBarQuickEntryActionId>([
  'one-click-symbol-current-doc',
  'one-click-cancel-current-doc',
]);

/**
 * MenuManager 类
 * 
 * 管理所有菜单的注册和打开。
 * 
 * 使用示例：
 * ```typescript
 * const dialogManager = new DialogManager(context, plugin, dialogPorts);
 * const menuManager = new MenuManager(context, plugin, i18n, dialogManager, siyuanApi);
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
   * @param siyuanApi - 思源 API 端口（组合根注入）
   */
  constructor(
    private context: ApplicationContext,
    _plugin: Plugin,
    private i18n: Record<string, string>,
    private dialogManager: DialogManager,
    private readonly siyuanApi: ManagerSiyuanPort
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

    for (const definition of TOPBAR_QUICK_ENTRY_DEFINITIONS) {
      if (TOPBAR_MENU_HIDDEN_ACTIONS.has(definition.id)) {
        continue;
      }
      menu.addItem({
        icon: definition.icon,
        label: this.i18n?.[definition.commandLangKey] || definition.fallbackLabel,
        click: () => {
          void this.runTopBarQuickEntryAction(definition.id);
        },
      });
    }

    menu.addItem({
      icon: 'iconLayoutRight',
      label: this.i18n?.openSrsBrowserTab || 'Open Browser Tab',
      click: () => {
        this.openSRSBrowserTab();
      },
    });

    if (this.isArenaEnabled()) {
      menu.addItem({
        icon: 'iconSparkles',
        label: this.i18n?.arenaManagerTitle || 'Arena Manager',
        click: () => {
          this.openArenaManager();
        },
      });
    }

    menu.addSeparator();
    
    // 设置
    menu.addItem({
      icon: 'iconSettings',
      label: this.i18n?.settings || 'Settings',
      click: () => {
        this.openSettings();
      },
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

  public async runTopBarQuickEntryAction(
    actionId: TopBarQuickEntryActionId,
    input?: { docId?: string | null },
  ): Promise<void> {
    const normalizedDocId = typeof input?.docId === 'string' ? input.docId.trim() : '';

    switch (actionId) {
      case 'start-review':
        this.openReviewDialog();
        return;
      case 'start-incremental-learning':
        this.openIncrementalLearningDialog();
        return;
      case 'start-deliberate-practice':
        this.openFinalDrillDialog();
        return;
      case 'start-neural-roam':
        this.openNeuralRoamDialog();
        return;
      case 'start-filter-group-practice':
        this.openFilterGroupPracticeDialog();
        return;
      case 'open-srs-browser':
        this.openSRSBrowser();
        return;
      case 'one-click-symbol-current-doc':
        if (normalizedDocId) {
          await this.runOneClickSymbolCardCreationByDocId(normalizedDocId);
          return;
        }
        await this.runOneClickSymbolCardCreationForCurrentDoc();
        return;
      case 'one-click-cancel-current-doc':
        if (normalizedDocId) {
          await this.runOneClickCancelCardsByDocId(normalizedDocId);
          return;
        }
        await this.runOneClickCancelCardsForCurrentDoc();
        return;
      default: {
        const unreachable: never = actionId;
        throw new Error(`Unsupported top bar quick action: ${unreachable}`);
      }
    }
  }

  public async runOneClickSymbolCardCreationForCurrentDoc(): Promise<void> {
    const docId = this.getCurrentDocId();
    if (!docId) {
      showMessage(this.i18n?.oneClickSymbolCardsNoDoc || '未检测到当前文档，无法执行一键符号制卡');
      return;
    }

    await this.runOneClickSymbolCardCreation(docId);
  }

  public async runOneClickSymbolCardCreationByDocId(docId: string | null | undefined): Promise<void> {
    const normalizedDocId = typeof docId === 'string' ? docId.trim() : '';
    if (!normalizedDocId) {
      showMessage(this.i18n?.oneClickSymbolCardsNoDoc || '未检测到当前文档，无法执行一键符号制卡');
      return;
    }

    await this.runOneClickSymbolCardCreation(normalizedDocId);
  }

  public async runOneClickCancelCardsForCurrentDoc(): Promise<void> {
    const currentNodeId = this.getCurrentDocId();
    if (!currentNodeId) {
      showMessage(this.i18n?.oneClickCancelCardsNoDoc || '未检测到当前文档，无法执行一键取消闪卡');
      return;
    }

    const docId = await this.resolveDocumentRootId(currentNodeId);
    await this.runOneClickCancelCards(docId);
  }

  public async runOneClickCancelCardsByDocId(docId: string | null | undefined): Promise<void> {
    const normalizedDocId = typeof docId === 'string' ? docId.trim() : '';
    if (!normalizedDocId) {
      showMessage(this.i18n?.oneClickCancelCardsNoDoc || '未检测到当前文档，无法执行一键取消闪卡');
      return;
    }

    const rootDocId = await this.resolveDocumentRootId(normalizedDocId);
    await this.runOneClickCancelCards(rootDocId);
  }

  public async runCurrentDocTreeDueReviewForCurrentDoc(): Promise<void> {
    const docId = this.getCurrentDocId();
    if (!docId) {
      showMessage(this.i18n?.docTreeReviewNoCurrentDoc || '无法定位当前文档');
      return;
    }

    await this.runCurrentDocTreeDueReviewByDocId(docId);
  }

  public async runCurrentDocTreeDueReviewByDocId(docId: string | null | undefined): Promise<void> {
    await this.runCurrentDocTreeReviewActionByDocId('retrieval-due', docId);
  }

  public async runCurrentDocTreeTemporaryDrillForCurrentDoc(): Promise<void> {
    const docId = this.getCurrentDocId();
    if (!docId) {
      showMessage(this.i18n?.docTreeReviewNoCurrentDoc || '无法定位当前文档');
      return;
    }

    await this.runCurrentDocTreeTemporaryDrillByDocId(docId);
  }

  public async runCurrentDocTreeTemporaryDrillByDocId(docId: string | null | undefined): Promise<void> {
    await this.runCurrentDocTreeReviewActionByDocId('temporary-drill', docId);
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

  private openSRSBrowserTab(): void {
    const opened = this.context.getTabManager().openBrowserTab();
    if (!opened) {
      showMessage(this.i18n?.openBrowserTabFailed || 'Failed to open browser tab');
    }
  }

  private openArenaManager(): void {
    if (!this.isArenaEnabled()) {
      return;
    }
    this.dialogManager.openArenaManagerDialog();
  }

  private isArenaEnabled(): boolean {
    return this.context.getArenaKernelService().isEnabled();
  }
  
  /**
   * 打开设置对话框
   * 
   * 委托给 DialogManager 处理
   */
  private openSettings(): void {
    this.dialogManager.openSettingsDialog();
  }

  public getCurrentDocId(): string | null {
    const mobileDocId = document
      .querySelector('#editor .protyle-content .protyle-background[data-node-id]')
      ?.getAttribute('data-node-id');
    if (mobileDocId) {
      return mobileDocId;
    }

    let currentScreen = document.querySelector('.b3-dialog--open') as HTMLElement | null;
    if (currentScreen?.querySelector('#commands')) {
      currentScreen = null;
    }
    if (!currentScreen) {
      currentScreen = document.querySelector('.layout__wnd--active') as HTMLElement | null;
    }
    if (!currentScreen) {
      return null;
    }

    const contentDocId = currentScreen
      .querySelector('.protyle-content .protyle-background[data-node-id]')
      ?.getAttribute('data-node-id');
    if (contentDocId) {
      return contentDocId;
    }

    const breadcrumbDocId = currentScreen
      .querySelector('span.protyle-breadcrumb__item--active[data-node-id]')
      ?.getAttribute('data-node-id');
    return breadcrumbDocId || null;
  }

  private createCoreReviewEntryService(): CoreReviewEntryService {
    return new CoreReviewEntryService({
      i18n: this.i18n,
      dialogManager: this.dialogManager,
      notify: async (message) => {
        showMessage(message);
      },
      getDayStartHour: () => this.context.getUnifiedDataSourceManager().getDayStartHour(),
    });
  }

  private async runCurrentDocTreeReviewActionByDocId(
    actionId: CoreReviewEntryActionId,
    docId: string | null | undefined,
  ): Promise<void> {
    const normalizedDocId = typeof docId === 'string' ? docId.trim() : '';
    if (!normalizedDocId) {
      showMessage(this.i18n?.docTreeReviewNoCurrentDoc || '无法定位当前文档');
      return;
    }

    const docTreeReviewScopeService = this.context.getDocTreeReviewScopeService();
    let scope = docTreeReviewScopeService.collectDocReviewScope(normalizedDocId);
    if (!scope) {
      await docTreeReviewScopeService.hydrate();
      scope = docTreeReviewScopeService.collectDocReviewScope(normalizedDocId);
    }
    if (!scope) {
      showMessage(this.i18n?.docTreeReviewOpenFailed || '打开当前文档复习失败');
      return;
    }

    await this.createCoreReviewEntryService().execute(actionId, scope.cards, {
      scopeDocIds: scope.docIds,
      emptyMessages: {
        noDueCards: this.i18n?.docTreeReviewNoDueCards || '当前文档及子文档内没有到期卡片',
        noPracticeableCards: this.i18n?.docTreeReviewNoPracticeableCards || '当前文档及子文档内没有可练习卡片',
      },
    });
  }

  private async runOneClickSymbolCardCreation(docId: string): Promise<void> {
    let tempHandler: AutoCardHandler | undefined;
    try {
      showMessage(this.i18n?.oneClickSymbolCardsRunning || '正在扫描当前文档并按符号制卡...');

      let handler = this.context.getAutoCardHandler();
      if (!handler) {
        tempHandler = await this.context.createAutoCardHandler();
        handler = tempHandler;
      }

      const summary = await handler.scanDocumentByRootId(docId);
      const baseMessage = (this.i18n?.oneClickSymbolCardsDone
        || '符号制卡完成：扫描 {scanned} 个块，新增 {created}，跳过 {skipped}，失败 {failed}。')
        .replace('{scanned}', String(summary.scanned))
        .replace('{created}', String(summary.created))
        .replace('{skipped}', String(summary.skipped))
        .replace('{failed}', String(summary.failed));
      const detailParts: string[] = [];
      if (typeof summary.conflicted === 'number') {
        detailParts.push(`冲突 ${summary.conflicted}`);
      }
      if (typeof summary.consumed === 'number') {
        detailParts.push(`消费 ${summary.consumed}`);
      }
      const doneMessage = detailParts.length > 0
        ? `${baseMessage}（${detailParts.join('，')}）`
        : baseMessage;
      showMessage(doneMessage);
    } catch (error) {
      logger.error('[MenuManager] One-click symbol card creation failed:', error);
      const errorMessage = this.i18n?.oneClickSymbolCardsFailed || '一键符号制卡失败';
      showMessage(errorMessage);
    } finally {
      tempHandler?.dispose();
    }
  }

  private extractMetaRootId(card: FSRSCard): string | undefined {
    const meta = card.meta as unknown;
    if (typeof meta !== 'object' || meta === null || !('rootId' in meta)) {
      return undefined;
    }
    const rootId = (meta as { rootId?: unknown }).rootId;
    return typeof rootId === 'string' ? rootId : undefined;
  }

  private isImageOcclusionCard(card: FSRSCard): boolean {
    const meta = card.meta as unknown;
    if (!meta || typeof meta !== 'object') {
      return false;
    }

    const source = (meta as Record<string, unknown>).source;
    const imageOcclusion = (meta as Record<string, unknown>).imageOcclusion;
    return source === 'image-occlusion' || imageOcclusion === true;
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }

  private async resolveDocumentRootId(nodeId: string): Promise<string> {
    const normalizedNodeId = nodeId.trim();
    if (!normalizedNodeId) {
      return '';
    }

    try {
      const rows = await this.siyuanApi.sql<BlockIdSqlRow>(`
        SELECT root_id
        FROM blocks
        WHERE id = '${this.escapeSql(normalizedNodeId)}'
        LIMIT 1
      `);
      const rootId = typeof rows?.[0]?.root_id === 'string' ? rows[0].root_id.trim() : '';
      return rootId || normalizedNodeId;
    } catch (error) {
      logger.warn('[MenuManager] Failed to resolve document root id, fallback to input id:', {
        nodeId: normalizedNodeId,
        error,
      });
      return normalizedNodeId;
    }
  }

  private async resolveDocBlockIds(docId: string): Promise<string[]> {
    const safeDocId = this.escapeSql(docId);
    const rows = await this.siyuanApi.sql<BlockIdSqlRow>(`
      SELECT id
      FROM blocks
      WHERE root_id = '${safeDocId}'
        AND type != 'd'
    `);
    return rows
      .map((row) => (typeof row.id === 'string' ? row.id : ''))
      .filter((id) => id.length > 0);
  }

  private async collectCardsByDocId(docId: string, docBlockIds: string[]): Promise<FSRSCard[]> {
    const storage = this.context.getStorage();
    const cardsById = new Map<string, FSRSCard>();
    const allCards = storage.getAllCards();
    const cardsByBlockId = new Map<string, FSRSCard[]>();

    for (const card of allCards) {
      if (!card?.id || !card.blockId) {
        continue;
      }
      const existing = cardsByBlockId.get(card.blockId) || [];
      existing.push(card);
      cardsByBlockId.set(card.blockId, existing);
    }

    for (const blockId of docBlockIds) {
      const cards = cardsByBlockId.get(blockId) || [];
      for (const card of cards) {
        if (!card?.id || cardsById.has(card.id)) {
          continue;
        }
        cardsById.set(card.id, card);
      }
    }

    // Keep compatibility for legacy data where blockId mapping is incomplete.
    for (const card of allCards) {
      if (!card || typeof card.id !== 'string' || card.id.trim().length === 0) {
        continue;
      }
      const rootId = this.extractMetaRootId(card);
      if (rootId === docId || card.blockId === docId) {
        cardsById.set(card.id, card);
      }
    }

    return Array.from(cardsById.values());
  }

  private async forceCleanupFailedCards(cardIds: string[]): Promise<{ cleanedCardCount: number }> {
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return { cleanedCardCount: 0 };
    }

    const storage = this.context.getStorage() as {
      getCard?: (cardId: string) => FSRSCard | undefined;
      removeCard?: (cardId: string) => boolean;
      saveCards?: () => Promise<void>;
    };

    const deletedCardIdsByBlock = new Map<string, string[]>();
    let removedCount = 0;

    for (const cardId of cardIds) {
      const card = storage.getCard?.(cardId);
      if (!card) {
        continue;
      }

      if (typeof card.blockId === 'string' && card.blockId.length > 0) {
        if (!deletedCardIdsByBlock.has(card.blockId)) {
          deletedCardIdsByBlock.set(card.blockId, []);
        }
        deletedCardIdsByBlock.get(card.blockId)!.push(cardId);
      }

      const removed = storage.removeCard?.(cardId);
      if (removed) {
        removedCount += 1;
      }
    }

    if (removedCount > 0) {
      await storage.saveCards?.();
    }

    for (const [blockId, deletedCardIds] of deletedCardIdsByBlock.entries()) {
      try {
        const attrs = await this.siyuanApi.getBlockAttrs(blockId);
        const nextAttrs = buildClearedBlockAttrs(attrs, { deletedCardIds });
        if (Object.keys(nextAttrs).length > 0) {
          await this.siyuanApi.setBlockAttrs(blockId, nextAttrs);
        }
      } catch (error) {
        logger.warn('[MenuManager] Failed to cleanup stale card attrs for block:', {
          blockId,
          deletedCardIds,
          error,
        });
      }
    }

    return { cleanedCardCount: removedCount };
  }

  private async runOneClickCancelCards(docId: string): Promise<void> {
    try {
      showMessage(this.i18n?.oneClickCancelCardsRunning || '正在取消当前文档闪卡...');

      const docBlockIds = await this.resolveDocBlockIds(docId);
      logger.info('[MenuManager] Resolved document blocks for one-click cancel:', {
        docId,
        blockCount: docBlockIds.length,
      });

      const cardsInDoc = await this.collectCardsByDocId(docId, docBlockIds);
      const excludedImageOcclusionCards = cardsInDoc.filter((card) => this.isImageOcclusionCard(card));
      const cancelableCards = cardsInDoc.filter((card) => !this.isImageOcclusionCard(card));
      logger.info('[MenuManager] Resolved cards for one-click cancel:', {
        docId,
        cardCount: cardsInDoc.length,
        cancelableCardCount: cancelableCards.length,
        excludedImageOcclusionCount: excludedImageOcclusionCards.length,
      });
      const cardIds = Array.from(
        new Set(
          cancelableCards
            .map((card) => (typeof card.id === 'string' ? card.id.trim() : ''))
            .filter((id) => id.length > 0),
        ),
      );

      if (cardIds.length === 0) {
        if (excludedImageOcclusionCards.length > 0) {
          showMessage(
            this.i18n?.oneClickCancelCardsNoCancelableCards
            || '当前文档仅包含图片遮挡卡，未执行取消',
          );
          return;
        }
        showMessage(this.i18n?.oneClickCancelCardsNoCards || '当前文档未找到可取消的闪卡');
        return;
      }

      const cardService = this.context.getCardService();
      const batchResult = await cardService.deleteCards({ cardIds });
      if (batchResult.ok) {
        let deletedCount = batchResult.value.deletedCount;
        let failedCount = batchResult.value.failedCardIds.length;

        if (failedCount > 0) {
          const cleanup = await this.forceCleanupFailedCards(batchResult.value.failedCardIds);
          if (cleanup.cleanedCardCount > 0) {
            deletedCount += cleanup.cleanedCardCount;
            failedCount = Math.max(0, failedCount - cleanup.cleanedCardCount);
            logger.warn('[MenuManager] Applied stale-card fallback cleanup for one-click cancel:', {
              docId,
              cleanedCardCount: cleanup.cleanedCardCount,
              remainingFailedCount: failedCount,
            });
          }
        }

        if (deletedCount > 0) {
          const keepImageOcclusionHint = excludedImageOcclusionCards.length > 0
            ? `（${(this.i18n?.oneClickCancelCardsKeepImageOcclusionHint || '已保留 {count} 张图片遮挡卡')
              .replace('{count}', String(excludedImageOcclusionCards.length))}）`
            : '';
          const successMessage = failedCount > 0
            ? (this.i18n?.oneClickCancelCardsPartialDone || '已取消 {deleted} 张闪卡，{failed} 张失败')
              .replace('{deleted}', String(deletedCount))
              .replace('{failed}', String(failedCount))
            : (this.i18n?.oneClickCancelCardsDone || '已取消 {deleted} 张闪卡')
              .replace('{deleted}', String(deletedCount));
          showMessage(`${successMessage}${keepImageOcclusionHint}`);
          return;
        }

        if (failedCount > 0) {
          showMessage(
            (this.i18n?.oneClickCancelCardsFailedWithCount || '取消闪卡失败：{failed} 张')
              .replace('{failed}', String(failedCount)),
          );
          return;
        }

        showMessage(this.i18n?.oneClickCancelCardsNoCards || '当前文档未找到可取消的闪卡');
        return;
      }

      if (isErr(batchResult)) {
        logger.error('[MenuManager] One-click cancel cards failed:', batchResult.error);
      }
      showMessage(this.i18n?.oneClickCancelCardsFailed || '一键取消闪卡失败');
    } catch (error) {
      logger.error('[MenuManager] One-click cancel cards threw error:', error);
      showMessage(this.i18n?.oneClickCancelCardsFailed || '一键取消闪卡失败');
    }
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

