import type FSRSPlugin from '@/index';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import { ATTR_CARD_ID, markBlockAsCard, unmarkBlockAsCard, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { riff } from '@/core/siyuan';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { createVueDialog } from '@/utils/dialog';
import type { QueueItem } from '@/core/queue';
import { CardBuilderContext } from '@/core/card-builder';

export class BlockMenuManager {
    constructor(private plugin: FSRSPlugin) { }

    public init() {
        this.plugin.eventBus.on('click-blockicon', this.handleBlockIconClick.bind(this));
        this.plugin.eventBus.on('click-editortitleicon', this.handleEditorTitleIconClick.bind(this));
        this.plugin.eventBus.on('open-menu-breadcrumbmore', this.handleBreadcrumbMore.bind(this));
    }

    /**
     * 处理块图标点击（添加闪卡菜单）
     */
    private handleBlockIconClick(e: any) {
        const detail = e?.detail ?? e;
        const menu = detail?.menu;
        const blockElements: HTMLElement[] = detail?.blockElements || [];

        if (!menu || blockElements.length === 0) {
            return;
        }

        const blockIds = blockElements
            .map(el => el.getAttribute('data-node-id'))
            .filter((id): id is string => Boolean(id));

        if (blockIds.length === 0) {
            return;
        }

        const hasUncarded = blockElements.some(el => !el.hasAttribute(ATTR_CARD_ID));
        const hasCarded = blockElements.some(el => el.hasAttribute(ATTR_CARD_ID));
        const drillBlocks = this.getDrillBlockElements(blockElements);
        const drillCount = drillBlocks.length;
        const drillLabel = `<span title="${this.plugin.i18n?.drillHint || '将当前块及子块中的闪卡加入机械练习队列'}">${this.plugin.i18n?.blockModeLabel || '块练习'}</span> <span class="ft__secondary">(${drillCount})</span>`;

        menu.addItem({
            icon: 'iconRiffCard',
            label: drillLabel,
            click: async () => {
                if (drillCount === 0) {
                    await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                    return;
                }
                try {
                    const cards = this.buildDrillCardsFromElements(drillBlocks);
                    if (cards.length === 0) {
                        await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                        return;
                    }
                    // @ts-ignore - openDrillDialogWithCards is private/protected or we need to expose it
                    // Ideally we should move openDrillDialogWithCards to a shared place or make it public
                    // For now, assuming it will be public or we use a workaround, or we move that logic here?
                    // actually openDrillDialogWithCards depends on reviewDialog which is in plugin. 
                    // Let's assume we make it public or expose a method effectively.
                    // Checking index.ts, openDrillDialogWithCards is private. We should probably expose a method on plugin 
                    // or move the drill dialog logic to a DrillManager. 
                    // For this refactor, let's call it via public method or make it public in index.ts
                    // I will change index.ts to make it public or similar.
                    (this.plugin as any).openDrillDialogWithCards(cards, 'block');
                } catch (err) {
                    console.error('[FSRS] Failed to open drill from blocks:', err);
                    await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
                }
            },
        });

        menu.addItem({
            icon: 'iconList',
            label: this.plugin.i18n?.addToQueuePractice || '加入队列练习',
            click: async () => {
                if (drillCount === 0) {
                    await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                    return;
                }
                const items = this.buildQueueItemsFromElements(drillBlocks);
                // @ts-ignore - access private
                const added = await (this.plugin as any).extractionQueue.addItems(items);
                if (added > 0) {
                    await pushMsg((this.plugin.i18n?.queueAdded || '已加入 {n} 张闪卡到队列练习').replace('{n}', String(added)));
                } else {
                    await pushMsg(this.plugin.i18n?.queueNoAdded || '没有新增闪卡（可能已在队列中）');
                }
            },
        });

        menu.addItem({
            icon: 'iconCards',
            label: this.plugin.i18n?.addToDeliberateQueue || '加入刻意队列',
            click: async () => {
                if (drillCount === 0) {
                    await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                    return;
                }
                const items = this.buildQueueItemsFromElements(drillBlocks);
                // @ts-ignore
                const before = (this.plugin as any).deliberateQueue?.size?.() ?? 0;
                for (const item of items) {
                    // @ts-ignore
                    await (this.plugin as any).deliberateQueue.addItem(item);
                }
                // @ts-ignore
                const after = (this.plugin as any).deliberateQueue?.size?.() ?? before;
                const added = Math.max(0, after - before);
                if (added > 0) {
                    await pushMsg((this.plugin.i18n?.deliberateAdded || '已加入 {n} 张闪卡到刻意队列').replace('{n}', String(added)));
                } else {
                    await pushMsg(this.plugin.i18n?.queueNoAdded || '没有新增闪卡（可能已在队列中）');
                }
            },
        });

        const filterGroupSettings = this.plugin.storage.getSettings()?.queues?.filterGroup?.groups || [];
        const filterGroups = (filterGroupSettings as any[])
            .map((g: any) => ({ id: String(g.id || '').trim(), weight: Number(g.weight) || 1 }))
            .filter((g: any) => g.id);
        const groupIds = filterGroups.length ? filterGroups.map(g => g.id) : ['default'];
        for (const gid of groupIds) {
            menu.addItem({
                icon: 'iconList',
                label: `${this.plugin.i18n?.addToFilterGroupQueue || '加入分组队列'}: ${gid}`,
                click: async () => {
                    if (drillCount === 0) {
                        await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                        return;
                    }
                    const items = this.buildQueueItemsFromElements(drillBlocks, gid);
                    // @ts-ignore
                    const before = (this.plugin as any).filterGroupQueue?.size?.() ?? 0;
                    for (const item of items) {
                        // @ts-ignore
                        await (this.plugin as any).filterGroupQueue.addItem(item);
                    }
                    // @ts-ignore
                    const after = (this.plugin as any).filterGroupQueue?.size?.() ?? before;
                    const added = Math.max(0, after - before);
                    if (added > 0) {
                        await pushMsg((this.plugin.i18n?.filterGroupAdded || '已加入 {n} 张闪卡到分组队列').replace('{n}', String(added)));
                    } else {
                        await pushMsg(this.plugin.i18n?.queueNoAdded || '没有新增闪卡（可能已在队列中）');
                    }
                },
            });
        }

        menu.addItem({
            icon: 'iconRefresh',
            label: this.plugin.i18n?.startNeuralReviewFromHere || '从此处开始神经复习',
            click: async () => {
                const seedBlockId = blockIds[0];
                const includeSeedAsFirst = Boolean(blockElements[0]?.hasAttribute?.(ATTR_CARD_ID));
                try {
                    await (this.plugin as any).openNeuralRoamDialog({ seedBlockId, includeSeedAsFirst, resetHistory: true });
                } catch (err) {
                    console.error('[FSRS] Failed to open neural review from block:', err);
                    await pushErrMsg(this.plugin.i18n?.neuralReviewFailed || '神经复习启动失败');
                }
            },
        });

        // 编辑 SRS 数据 - 支持新卡（有 ATTR_CARD_ID）和老 riff 卡（只在 riff 数据库中）
        menu.addItem({
            icon: 'iconEdit',
            label: this.plugin.i18n?.editSrsData || '编辑SRS数据',
            click: async () => {
                // 优先查找有 ATTR_CARD_ID 的新卡
                let target = blockElements.find(el => el.hasAttribute(ATTR_CARD_ID));
                let blockID = target?.getAttribute('data-node-id');
                let cardID = target?.getAttribute(ATTR_CARD_ID);

                // 如果没找到，尝试从 riff API 查询老卡
                if (!cardID && blockIds.length > 0) {
                    try {
                        console.log('[FSRS] Querying riff cards for blockIds:', blockIds);
                        const riffBlocks = await getRiffCardsByBlockIDs(blockIds);
                        console.log('[FSRS] Riff API response:', riffBlocks);

                        if (riffBlocks.length > 0) {
                            const riffBlock = riffBlocks[0];
                            blockID = riffBlock.id || blockIds[0];

                            // 尝试从多个位置获取卡片 ID
                            // 1. 从 riffCard 子对象（新版本格式）
                            // 2. 从 ial 属性中的 custom-riff-decks（老版本格式）
                            // 3. 如果都没有，使用块 ID 作为标识（SrsEditorDialog 会自己查询）
                            cardID = riffBlock.riffCard?.id
                                || riffBlock.ial?.['custom-riff-decks']?.split(',')[0]
                                || blockID; // 使用 blockID 作为后备

                            console.log('[FSRS] Resolved blockID:', blockID, 'cardID:', cardID);
                        }
                    } catch (err) {
                        console.warn('[FSRS] Failed to query riff cards:', err);
                    }
                }

                if (!blockID || !cardID) {
                    pushErrMsg(this.plugin.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
                    return;
                }
                createVueDialog({
                    title: this.plugin.i18n?.editSrsData || '编辑SRS数据',
                    component: SrsEditorDialog,
                    props: {
                        card: {
                            cardID,
                            blockID,
                            deckID: riff.BUILTIN_DECK_ID,
                        },
                        deckID: riff.BUILTIN_DECK_ID,
                        i18n: this.plugin.i18n || {},
                    },
                    width: '760px',
                    height: '70vh',
                });
            },
        });

        if (hasUncarded) {
            menu.addItem({
                icon: 'iconAdd',
                label: this.plugin.i18n?.makeCardFromSelection || '选中制卡',
                click: async () => {
                    let createdCount = 0;
                    const builder = new CardBuilderContext();

                    for (const element of blockElements) {
                        if (element.hasAttribute(ATTR_CARD_ID)) {
                            continue;
                        }
                        const blockId = element.getAttribute('data-node-id');
                        if (!blockId) {
                            continue;
                        }
                        try {
                            // 获取块文本内容用于策略匹配
                            // 简单的从 element.textContent 获取，或者使用更高级的 getBlockText
                            // element 是 .protyle-wysiwyg__embed 或类似容器，
                            // 我们需要获取其实际内容。
                            // 但 element 本身就是块元素 (e.g. div[data-node-id])
                            const content = element.textContent || '';

                            const card = await builder.build(blockId, content);
                            await markBlockAsCard(blockId, card.id, card.priority);
                            this.plugin.storage.setCard(card);
                            createdCount++;
                        } catch (err) {
                            console.error('[FSRS] Failed to create card from block:', blockId, err);
                        }
                    }

                    if (createdCount > 0) {
                        await this.plugin.storage.saveCards();
                        await pushMsg((this.plugin.i18n?.msg_created || '已创建 {n} 张闪卡').replace('{n}', String(createdCount)));
                    } else {
                        await pushMsg(this.plugin.i18n?.msg_already_cards || '选中的块已经是闪卡');
                    }
                },
            });
        }

        if (hasCarded) {
            menu.addItem({
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
                            await unmarkBlockAsCard(blockId);
                            this.plugin.storage.removeCard(cardId);
                            removedCount++;
                        } catch (err) {
                            console.error('[FSRS] Failed to remove card from block:', blockId, err);
                        }
                    }

                    if (removedCount > 0) {
                        await this.plugin.storage.saveCards();
                        await pushMsg((this.plugin.i18n?.msg_unmarked || '已取消 {n} 张闪卡').replace('{n}', String(removedCount)));
                    } else {
                        await pushMsg(this.plugin.i18n?.msg_no_removable || '未找到可取消的闪卡');
                    }
                },
            });
        }

        if (!hasUncarded && !hasCarded) {
            pushErrMsg(this.plugin.i18n?.msg_no_operable_blocks || '未找到可操作的块');
        }
    }

    private async handleEditorTitleIconClick(e: any) {
        const detail = e?.detail ?? e;
        const menu = detail?.menu;
        const docInfo = detail?.data;
        const docId = docInfo?.rootID || docInfo?.id;
        if (!menu || !docId) {
            return;
        }
        const drillLabel = this.plugin.i18n?.blockModeLabel || '块练习';
        menu.addItem({
            icon: 'iconRiffCard',
            label: drillLabel,
            click: async () => {
                try {
                    const cards = await this.getDrillCardsFromDocTree(docId);
                    if (cards.length === 0) {
                        await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                        return;
                    }
                    // @ts-ignore
                    (this.plugin as any).openDrillDialogWithCards(cards, 'block');
                } catch (err) {
                    console.error('[FSRS] Failed to open drill from doc menu:', err);
                    await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
                }
            }
        });
    }

    private async handleBreadcrumbMore(e: any) {
        const detail = e?.detail ?? e;
        const menu = detail?.menu;
        const protyle = detail?.protyle;
        const docId = protyle?.block?.rootID || protyle?.block?.id;
        if (!menu || !docId) {
            return;
        }
        const drillLabel = this.plugin.i18n?.blockModeLabel || '块练习';
        menu.addItem({
            icon: 'iconRiffCard',
            label: drillLabel,
            click: async () => {
                try {
                    const cards = await this.getDrillCardsFromDocTree(docId);
                    if (cards.length === 0) {
                        await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
                        return;
                    }
                    // @ts-ignore
                    (this.plugin as any).openDrillDialogWithCards(cards, 'block');
                } catch (err) {
                    console.error('[FSRS] Failed to open drill from breadcrumb menu:', err);
                    await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
                }
            }
        });
    }

    private getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
        const seen = new Set<string>();
        const result: HTMLElement[] = [];
        const roots = blockElements.map(el => (el.closest('[data-node-id]') as HTMLElement) || el);
        for (const root of roots) {
            const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))];
            for (const node of nodes) {
                const id = node.getAttribute('data-node-id');
                if (!id || seen.has(id)) {
                    continue;
                }
                seen.add(id);
                if (node.hasAttribute(ATTR_CARD_ID)) {
                    result.push(node);
                }
            }
        }
        return result;
    }

    private buildDrillCardsFromElements(elements: HTMLElement[]) {
        const result: any[] = [];
        const seen = new Set<string>();
        for (const el of elements) {
            const blockID = el.getAttribute('data-node-id');
            const cardID = el.getAttribute(ATTR_CARD_ID);
            if (!blockID || !cardID || seen.has(cardID)) {
                continue;
            }
            seen.add(cardID);
            result.push({
                cardID,
                blockID,
                deckID: riff.BUILTIN_DECK_ID,
                nextDues: { 1: '', 2: '', 3: '', 4: '' },
                state: 0,
                lapses: 0,
                reps: 0,
            });
        }
        return result;
    }

    private buildQueueItemsFromElements(elements: HTMLElement[], groupId?: string): QueueItem[] {
        const result: QueueItem[] = [];
        const seen = new Set<string>();
        for (const el of elements) {
            const blockID = el.getAttribute('data-node-id');
            const cardID = el.getAttribute(ATTR_CARD_ID);
            if (!blockID || !cardID || seen.has(cardID)) {
                continue;
            }
            seen.add(cardID);
            result.push({
                cardID,
                blockID,
                deckID: riff.BUILTIN_DECK_ID,
                meta: groupId ? { groupId } : undefined,
            });
        }
        return result;
    }

    private async getDrillCardsFromDocTree(docId: string) {
        const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
        return this.buildDrillCardsFromBlockIds(blockIds);
    }

    public async buildDrillCardsFromBlockIds(blockIds: string[]) {
        const uniqueIds = Array.from(new Set(blockIds));
        if (uniqueIds.length === 0) {
            return [];
        }
        const result: any[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < uniqueIds.length; i += 200) {
            const batch = uniqueIds.slice(i, i + 200);
            const idsStr = batch.map(id => `'${id}'`).join(',');
            const rows = await sql(`SELECT block_id, value FROM attributes WHERE name = '${ATTR_CARD_ID}' AND block_id IN (${idsStr}) AND value != ''`);
            for (const row of rows) {
                const blockID = row.block_id || row.blockID;
                const cardID = row.value || row.card_id || row.cardID;
                if (!blockID || !cardID || seen.has(cardID)) {
                    continue;
                }
                seen.add(cardID);
                result.push({
                    cardID,
                    blockID,
                    deckID: riff.BUILTIN_DECK_ID,
                    nextDues: { 1: '', 2: '', 3: '', 4: '' },
                    state: 0,
                    lapses: 0,
                    reps: 0,
                });
            }
        }
        return result;
    }
}
