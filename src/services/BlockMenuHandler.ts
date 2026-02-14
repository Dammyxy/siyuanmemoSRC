﻿/**
 * BlockMenuHandler - 处理块菜单相关的事件和操作
 * 从 index.ts 拆分出来的服务
 */

import type { App } from 'siyuan';
import type { StorageManager } from '@/core/storage';
import { riff } from '@/core/siyuan';
import { markBlockAsCard, unmarkBlockAsCard, ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import * as api from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';
import { createDefaultCard } from '@/types';
import { DEFAULT_PRIORITY } from '@/core/queue';
import type { CardAttributeRow } from '@/core/queue/types';

import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { ReviewDialogManager } from './ReviewDialogManager';
import type { XiuyuanService } from '@/core/xiuyuan';

// 🆕 导入复习入口类
import { ReviewEntryBase } from './ReviewEntryBase';
import { RetrievalPracticeEntry } from './RetrievalPracticeEntry';
import { IncrementalLearningEntry } from './IncrementalLearningEntry';
import { TemporaryDrillEntry } from './TemporaryDrillEntry';
import { AddToFinalDrillEntry } from './AddToFinalDrillEntry';

export interface BlockMenuHandlerDeps {
  app: App;
  i18n: Record<string, string>;
  storage: StorageManager;
  reviewDialogManager: ReviewDialogManager;
  xiuyuanService: XiuyuanService;
  openCreateTemplateCardDialog: (blockIds: string[]) => Promise<void>;
  openNeuralReviewDialog: (options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) => Promise<void>;
  plugin?: any;  // 🆕 添加 plugin 引用，用于访问 hybridSyncService
}

export class BlockMenuHandler {
  // 🆕 复习入口列表
  private reviewEntries: ReviewEntryBase[];
  
  constructor(private deps: BlockMenuHandlerDeps) {
    // 🆕 初始化复习入口（提取练习、渐进学习、临时练习、添加到刻意练习）
    this.reviewEntries = [
      new RetrievalPracticeEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
      new IncrementalLearningEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
      new TemporaryDrillEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
      new AddToFinalDrillEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
    ];
  }

  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  handleBlockIconClick(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const blockElements: HTMLElement[] = detail?.blockElements || [];

    if (!menu || blockElements.length === 0) {
      return;
    }

    const blockIds = blockElements
      .map((el) => el.getAttribute('data-node-id'))
      .filter((id): id is string => Boolean(id));

    if (blockIds.length === 0) {
      return;
    }

    const hasUncarded = blockElements.some((el) => !el.hasAttribute(ATTR_CARD_ID));
    const hasCarded = blockElements.some((el) => el.hasAttribute(ATTR_CARD_ID));

    // 构建子菜单项数组
    const submenu: any[] = [];

    // 使用复习入口生成菜单项
    for (let i = 0; i < this.reviewEntries.length; i++) {
      const entry = this.reviewEntries[i];
      const items = entry.createMenuItems(blockElements);
      submenu.push(...items);
      
      // 添加分隔符（除了最后一个）
      if (i < this.reviewEntries.length - 1) {
        submenu.push({ type: 'separator' });
      }
    }
    
    submenu.push({ type: 'separator' });

    // 神经漫游菜单项
    submenu.push({
      icon: 'iconRefresh',
      label: this.deps.i18n?.startNeuralReviewFromHere || '从此处开始神经漫游',
      click: async () => {
        const seedBlockId = blockIds[0];
        const includeSeedAsFirst = Boolean(blockElements[0]?.hasAttribute?.(ATTR_CARD_ID));
        try {
          await this.deps.openNeuralReviewDialog({ seedBlockId, includeSeedAsFirst, resetHistory: true });
        } catch (err) {
          console.error('[SiyuanMemo] Failed to open neural review from block:', err);
          await pushErrMsg(this.deps.i18n?.neuralReviewFailed || '神经漫游启动失败');
        }
      },
    });

    submenu.push({
      type: 'separator',
    });

    // 编辑 SRS 数据菜单项
    submenu.push({
      icon: 'iconEdit',
      label: this.deps.i18n?.editSrsData || '编辑SRS数据',
      click: async () => {
        let target = blockElements.find((el) => el.hasAttribute(ATTR_CARD_ID));
        let blockID = target?.getAttribute('data-node-id');
        let cardID = target?.getAttribute(ATTR_CARD_ID);

        // ✅ 新架构：从本地存储查询卡片
        if (!cardID && blockIds.length > 0) {
          try {
            console.log('[SiyuanMemo] Querying local storage for blockIds:', blockIds);
            for (const bid of blockIds) {
              const card = this.deps.storage.getCardByBlockId(bid);
              if (card) {
                blockID = card.blockId;
                cardID = card.id;
                console.log('[SiyuanMemo] Found card in local storage:', blockID, cardID);
                break;
              }
            }
          } catch (err) {
            console.warn('[SiyuanMemo] Failed to query local storage:', err);
          }
        }

        if (!blockID || !cardID) {
          pushErrMsg(this.deps.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
          return;
        }

        createVueDialog({
          title: this.deps.i18n?.editSrsData || '编辑SRS数据',
          component: SrsEditorDialog,
          props: {
            card: {
              cardID,
              blockID,
              deckID: riff.BUILTIN_DECK_ID,
            },
            deckID: riff.BUILTIN_DECK_ID,
            i18n: this.deps.i18n || {},
            plugin: this.deps.plugin,  // ✅ 传递 plugin 实例
          },
          width: '760px',
          height: '70vh',
        });
      },
    });

    // 制卡菜单项
    if (hasUncarded) {
      submenu.push({
        icon: 'iconAdd',
        label: this.deps.i18n?.makeCardFromSelection || '选中制卡',
        click: async () => {
          let createdCount = 0;

          for (const element of blockElements) {
            if (element.hasAttribute(ATTR_CARD_ID)) {
              continue;
            }
            const blockId = element.getAttribute('data-node-id');
            if (!blockId) {
              continue;
            }
            try {
              const card = createDefaultCard(blockId);
              await markBlockAsCard(blockId, card.id, card.priority, 'item');
              this.deps.storage.setCard(card);
              createdCount++;
            } catch (err) {
              console.error('[SiyuanMemo] Failed to create card from block:', blockId, err);
            }
          }

          if (createdCount > 0) {
            await this.deps.storage.saveCards();
            await pushMsg((this.deps.i18n?.msg_created || '已创建 {n} 张闪卡').replace('{n}', String(createdCount)));
          } else {
            await pushMsg(this.deps.i18n?.msg_already_cards || '选中的块已经是闪卡');
          }
        },
      });

      // 创建模板卡片（Xiuyuan）
      submenu.push({
        icon: 'iconAdd',
        label: this.deps.i18n?.createTemplateCard || '创建模板卡片',
        click: async () => {
          await this.deps.openCreateTemplateCardDialog(blockIds);
        },
      });

      // 🆕 创建列表模版卡（自动检测，仅子级为有序列表）
      submenu.push({
        icon: 'iconList',
        label: '创建列表模版卡',
        click: async () => {
          // 检查子级是否为有序列表项
          const hasOrderedChildren = await this.hasOrderedListChildren(blockIds[0]);
          if (!hasOrderedChildren) {
            await pushErrMsg('只能对包含有序子列表项的块使用此功能');
            return;
          }
          await this.createListTemplateCards(blockIds);
        },
      });
    }

    // 取消闪卡菜单项
    if (hasCarded) {
      submenu.push({
        icon: 'iconTrashcan',
        label: '取消闪卡',
        click: async () => {
          let removedCount = 0;

          for (const element of blockElements) {
            if (!element.hasAttribute(ATTR_CARD_ID)) {
              continue;
            }
            const blockId = element.getAttribute('data-node-id');
            const cardId = element.getAttribute(ATTR_CARD_ID);
            if (!blockId || !cardId) {
              continue;
            }
            try {
              // 1. 从本地删除（必须成功）
              await unmarkBlockAsCard(blockId);
              this.deps.storage.removeCard(cardId);
              removedCount++;
              
              // 🆕 2. 尝试从 Riff 删除（如果启用）
              const plugin = (this.deps as any).plugin;
              if (plugin?.hybridSyncService) {
                const riffConfig = this.deps.storage.getSettings().riffIntegration;
                if (riffConfig?.mode === 'advanced' && riffConfig?.deleteSync?.enabled) {
                  // 后台执行删除同步，不阻塞 UI
                  void plugin.hybridSyncService.deleteSync(cardId).catch((err: Error) => {
                    console.error('[BlockMenuHandler] Delete sync failed for card:', cardId, err);
                  });
                }
              }
            } catch (err) {
              console.error('[SiyuanMemo] Failed to remove card from block:', blockId, err);
            }
          }

          if (removedCount > 0) {
            await this.deps.storage.saveCards();
            await pushMsg((this.deps.i18n?.msg_unmarked || '已取消 {n} 张闪卡').replace('{n}', String(removedCount)));
          } else {
            await pushMsg(this.deps.i18n?.msg_no_removable || '未找到可取消的闪卡');
          }
        },
      });
    }

    // 添加主菜单项，使用子菜单
    menu.addItem({
      icon: 'iconRiffCard',
      label: 'SiyuanMemo',
      submenu,
    });
  }

  /**
   * 为文档树生成复习菜单项（同步版本，用于事件处理）
   * 
   * @param docId 文档 ID
   * @returns 菜单项数组
   */
  private generateReviewMenuForDocSync(docId: string): any[] {
    const submenu: any[] = [];
    
    // 同步获取所有卡片
    const allCards = this.deps.storage.getAllCards();
    
    // 使用 meta.rootId 匹配（卡片的 meta.rootId 字段表示所属文档）
    const cardsInDoc = allCards.filter(card => {
      const rootId = (card as any).meta?.rootId;
      return rootId === docId || card.blockId === docId;
    });
    
    // 为每个复习入口生成菜单项
    for (let i = 0; i < this.reviewEntries.length; i++) {
      const entry = this.reviewEntries[i];
      
      // 使用入口的过滤逻辑
      const filteredCards = cardsInDoc.filter(card => (entry as any).filterCard(card));
      const dueCount = (entry as any).countDueCards(filteredCards);
      const totalCount = filteredCards.length;
      
      // 生成菜单项
      const config = (entry as any).config;
      
      if (!config.supportDueMode) {
        // 只支持"全部"模式（如刻意练习）
        submenu.push({
          icon: config.icon,
          label: `${config.displayName} <span class="ft__secondary">(${totalCount})</span>`,
          click: async () => {
            if (totalCount === 0) {
              await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
              return;
            }
            await (entry as any).openReviewDialog(filteredCards, 'all');
          },
        });
      } else {
        // 支持"到期"和"全部"两种模式
        submenu.push({
          icon: config.icon,
          label: `${config.displayName} - 到期 <span class="ft__secondary">(${dueCount}/${totalCount})</span>`,
          click: async () => {
            if (dueCount === 0) {
              await pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
              return;
            }
            await (entry as any).openReviewDialog(filteredCards, 'due');
          },
        });
        
        submenu.push({
          icon: config.icon,
          label: `${config.displayName} - 全部 <span class="ft__secondary">(${totalCount})</span>`,
          click: async () => {
            if (totalCount === 0) {
              await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
              return;
            }
            await (entry as any).openReviewDialog(filteredCards, 'all');
          },
        });
      }
      
      // 添加分隔符（除了最后一个）
      if (i < this.reviewEntries.length - 1) {
        submenu.push({ type: 'separator' });
      }
    }
    
    return submenu;
  }

  /**
   * 处理文档树菜单（文档块的块标菜单）
   */
  handleDocTreeMenu(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const elements = detail?.elements;

    if (!menu || !elements || elements.length === 0) {
      return;
    }

    const firstElement = elements[0];
    const docId = firstElement?.getAttribute('data-node-id');

    if (!docId) {
      return;
    }

    try {
      const submenu = this.generateReviewMenuForDocSync(docId);
      
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiyuanMemo] Failed to generate doctree menu:', err);
    }
  }

  /**
   * 处理编辑器标题图标点击
   */
  handleEditorTitleIconClick(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const docInfo = detail?.data;
    const docId = docInfo?.rootID || docInfo?.id;

    if (!menu || !docId) {
      return;
    }

    try {
      const submenu = this.generateReviewMenuForDocSync(docId);
      
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiyuanMemo] Failed to generate doc menu:', err);
    }
  }

  /**
   * 处理面包屑更多菜单
   */
  handleBreadcrumbMore(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const protyle = detail?.protyle;
    const docId = protyle?.block?.rootID || protyle?.block?.id;

    if (!menu || !docId) {
      return;
    }

    try {
      const submenu = this.generateReviewMenuForDocSync(docId);
      
      // 添加菜单项
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiyuanMemo] Failed to generate breadcrumb menu:', err);
    }
  }

  /**
   * 获取包含闪卡的块元素
   */
  getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
    const seen = new Set<string>();
    const result: HTMLElement[] = [];
    const roots = blockElements.map((el) => (el.closest('[data-node-id]') as HTMLElement) || el);

    for (const root of roots) {
      const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))];
      
      for (const node of nodes) {
        const blockId = node.getAttribute('data-node-id');
        if (!blockId || seen.has(blockId)) {
          continue;
        }
        seen.add(blockId);
        
        // 从本地存储查询卡片
        const card = this.deps.storage.getCardByBlockId(blockId);
        if (card) {
          result.push(node);
        }
      }
    }
    
    return result;
  }

  /**
   * 从 DOM 元素构建练习卡片数据
   */
  buildDrillCardsFromElements(elements: HTMLElement[]): any[] {
    const result: any[] = [];
    const seen = new Set<string>();

    for (const el of elements) {
      const blockID = el.getAttribute('data-node-id');
      if (!blockID || seen.has(blockID)) {
        continue;
      }
      
      // 从本地存储获取卡片信息
      const card = this.deps.storage.getCardByBlockId(blockID);
      if (!card) {
        continue;
      }
      
      const cardID = card.id;
      if (seen.has(cardID)) {
        continue;
      }
      seen.add(cardID);
      
      result.push({
        cardID,
        blockID,
        deckID: riff.BUILTIN_DECK_ID,
        priority: card.priority || DEFAULT_PRIORITY,
        nextDues: { 1: '', 2: '', 3: '', 4: '' },
        state: card.state || 0,
        lapses: card.lapses || 0,
        reps: card.reps || 0,
      });
    }
    return result;
  }

  /**
   * 从文档树获取练习卡片
   */
  async getDrillCardsFromDocTree(docId: string): Promise<any[]> {
    const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }

  /**
   * 从块 ID 列表构建练习卡片数据
   */
  async buildDrillCardsFromBlockIds(blockIds: string[]): Promise<any[]> {
    const uniqueIds = Array.from(new Set(blockIds));
    if (uniqueIds.length === 0) {
      return [];
    }

    const result: any[] = [];
    const seen = new Set<string>();

    interface CardAttributeWithTypeRow extends CardAttributeRow {
      card_type?: string;
    }

    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const idsStr = batch.map((id) => `'${id}'`).join(',');
      
      // 查询卡片属性，包括卡片类型
      const rows = await sql(`
        SELECT 
          a1.block_id, 
          a1.value as card_id,
          a2.value as card_type
        FROM attributes a1
        LEFT JOIN attributes a2 ON a1.block_id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
        WHERE a1.name = '${ATTR_CARD_ID}' 
          AND a1.block_id IN (${idsStr}) 
          AND a1.value != ''
      `) as CardAttributeWithTypeRow[];

      for (const row of rows) {
        const blockID = row.block_id || row.blockID;
        const cardID = row.value;
        const cardType = row.card_type;
        
        if (!blockID || !cardID || seen.has(cardID)) {
          continue;
        }
        
        // 过滤：只接受 Item 类型的卡片（或未标记类型的卡片）
        // Topic 卡片不应该加入提取练习队列
        if (cardType === 'topic') {
          continue;
        }
        
        seen.add(cardID);
        result.push({
          cardID,
          blockID,
          deckID: riff.BUILTIN_DECK_ID,
          priority: DEFAULT_PRIORITY,
          nextDues: { 1: '', 2: '', 3: '', 4: '' },
          state: 0,
          lapses: 0,
          reps: 0,
        });
      }
    }
    
    return result;
  }

  /**
   * 检查块的子列表项是否为有序列表
   */
  private async hasOrderedListChildren(parentBlockId: string): Promise<boolean> {
    try {
      // 1. 获取列表容器
      const listContainerResult = await sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${parentBlockId}'
        AND type = 'l'
        LIMIT 1
      `);
      
      if (!listContainerResult || listContainerResult.length === 0) {
        return false;
      }
      
      const listContainerId = listContainerResult[0].id;
      
      // 2. 检查子列表项是否为有序列表
      const childrenResult = await sql(`
        SELECT subtype FROM blocks
        WHERE parent_id = '${listContainerId}'
        AND type = 'i'
        LIMIT 1
      `);
      
      if (!childrenResult || childrenResult.length === 0) {
        return false;
      }
      
      return childrenResult[0].subtype === 'o';
    } catch (err) {
      console.error('[SiyuanMemo] Failed to check list type:', err);
      return false;
    }
  }

  /**
   * 创建列表模版卡
   * 
   * @description
   * 自动检测列表项块，如果子级为有序列表项，则为每个子级创建一张卡片。
   * 支持提示功能：子列表项使用 `::` 分隔提示和答案。
   * 
   * @param blockIds 选中的块 ID 列表
   */
  private async createListTemplateCards(blockIds: string[]): Promise<void> {
    try {
      if (!blockIds || blockIds.length === 0) {
        await pushErrMsg('未选中任何块');
        return;
      }

      // 只处理第一个块
      const parentBlockId = blockIds[0];
      console.log(`[SiyuanMemo] 🎯 Creating list template cards for: ${parentBlockId}`);

      // 1. 检查块类型
      const typeResult = await sql(`
        SELECT type, content FROM blocks
        WHERE id = '${parentBlockId}'
        LIMIT 1
      `);

      if (!typeResult || typeResult.length === 0) {
        await pushErrMsg('块不存在');
        return;
      }

      const blockType = typeResult[0].type;
      const blockContent = typeResult[0].content;

      if (blockType !== 'i') {
        await pushErrMsg(`只能对列表项块使用此功能（当前类型：${blockType}）`);
        return;
      }

      // 2. 获取子级列表项（必须是有序列表）
      // 思源的列表结构：列表项(i) → 段落(p) + 列表容器(l) → 子列表项(i)
      // 所以需要先找到列表容器(l)，再查询其子级
      const allChildrenResult = await sql(`
        SELECT id, type, content FROM blocks
        WHERE parent_id = '${parentBlockId}'
        ORDER BY id ASC
      `);
      
      console.log(`[SiyuanMemo] All children of ${parentBlockId}:`, allChildrenResult);
      
      // 找到列表容器
      const listContainer = allChildrenResult?.find((r: any) => r.type === 'l');
      
      if (!listContainer) {
        await pushErrMsg('未找到列表容器，请确保列表结构正确');
        return;
      }
      
      console.log(`[SiyuanMemo] Found list container:`, listContainer.id);
      
      // 查询列表容器的所有子级（不限制类型，看看实际结构）
      const allListChildren = await sql(`
        SELECT id, type, subtype, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        ORDER BY id ASC
      `);
      
      console.log(`[SiyuanMemo] All list container children:`, allListChildren);
      
      // 查询列表容器的子级列表项（必须是有序列表）
      const childrenResult = await sql(`
        SELECT id, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        AND type = 'i'
        AND subtype = 'o'
        ORDER BY id ASC
      `);

      console.log(`[SiyuanMemo] Ordered list item children (type='i', subtype='o'):`, childrenResult);

      // 如果没有找到直接子级，尝试查询所有后代列表项（必须是有序列表）
      let finalChildren = childrenResult;
      if (!finalChildren || finalChildren.length === 0) {
        console.log(`[SiyuanMemo] No direct ordered children found, trying descendants...`);
        
        // 使用递归查询找到所有后代列表项（有序列表）
        const descendantsResult = await sql(`
          WITH RECURSIVE descendants AS (
            SELECT id, type, subtype, content, parent_id FROM blocks WHERE parent_id = '${listContainer.id}'
            UNION ALL
            SELECT b.id, b.type, b.subtype, b.content, b.parent_id FROM blocks b
            INNER JOIN descendants d ON b.parent_id = d.id
          )
          SELECT id, content FROM descendants WHERE type = 'i' AND subtype = 'o' ORDER BY id ASC
        `);
        
        console.log(`[SiyuanMemo] Descendant ordered list items:`, descendantsResult);
        finalChildren = descendantsResult;
      }

      if (!finalChildren || finalChildren.length < 2) {
        await pushErrMsg(`需要至少2个有序子列表项（当前：${finalChildren?.length || 0}个）`);
        return;
      }

      const childBlockIds = finalChildren.map((row: any) => row.id);
      console.log(`[SiyuanMemo] Found ${childBlockIds.length} children:`, childBlockIds);

      // 3. 确认创建
      await pushMsg(`检测到 ${childBlockIds.length} 个子级列表项，开始创建卡片...`);

      // 4. 为所有子级创建列表模版卡（一次性创建）
      console.log(`[SiyuanMemo] Creating list template cards: ${blockContent} → ${childBlockIds.length} children`);

      // 🔧 使用专用的列表模版卡创建方法
      const { createListTemplateCards } = await import('@/core/xiuyuan/listTemplate');
      
      const result = await createListTemplateCards(
        parentBlockId,
        childBlockIds,
        'builtin-list-item',
        (this.deps.xiuyuanService as any).storage,
        this.deps.storage
      );

      if (result.ok) {
        await pushMsg(`✅ 成功创建 ${childBlockIds.length} 张列表模版卡！`);
        console.log(`[SiyuanMemo] 🎉 List template cards creation complete:`, result.value);
      } else {
        await pushErrMsg(`创建失败：${result.error.message}`);
        console.error(`[SiyuanMemo] ❌ List template cards creation failed:`, result.error);
      }
    } catch (err) {
      console.error('[SiyuanMemo] Failed to create list template cards:', err);
      await pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }
}
