﻿﻿﻿﻿﻿/**
 * XiuyuanSyncService - Xiuyuan 同步服务（优化版）
 * 
 * 管理 Riff 系统的 Xiuyuan 卡片同步：
 * - 增量同步：快速获取新卡片（日常使用）
 * - 全量同步：检测双向删除 + 清理黑名单（定期维护）
 * - 删除同步：双向删除同步（插件删除 → Riff 删除，Riff 删除 → 本地删除）
 * 
 * 优化特性：
 * - 事件驱动架构（使用 EventEmitter）
 * - 自动重试机制（最多 3 次，指数退避）
 * - 详细的进度回调（7 个阶段）
 * - 简化职责（定时器由外部管理）
 * 
 * @deprecated 旧名称 HybridSyncService 已废弃，请使用 XiuyuanSyncService
 */

import { getRiffCards, getRiffNewCards, removeRiffCards, type RiffBlock } from '@/core/siyuan/riff';
import { initializeAFactor } from '@/core/card-builder';
import { setBlockAttrs, getBlockAttrs } from '@/core/siyuan/api';
import { ATTR_CARD_TYPE } from '@/core/siyuan/block';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import type {
    HybridSyncConfig,
    HybridSyncEvents,
    SyncResult,
    SyncStatus,
    SyncType,
    ProgressCallback,
    SyncProgress,
    SyncPhase
} from './XiuyuanSyncService.types';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { RiffBlacklistService } from './RiffBlacklistService';
import { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { createLogger } from '@/utils/logger';

// ==================== Xiuyuan 同步服务 ====================
const logger = createLogger('XiuyuanSyncService');

/**
 * Xiuyuan 同步服务（优化版）
 * 
 * 负责管理 Riff 系统的 Xiuyuan 卡片同步：
 * - 增量同步：快速获取新卡片
 * - 全量同步：检测双向删除 + 清理黑名单
 * - 删除同步：双向删除同步
 * 
 * 优化特性：
 * - 事件驱动：通过 EventBus 发布领域事件
 * - 自动重试：网络错误自动重试（最多 3 次，指数退避）
 * - 进度回调：详细的同步进度信息
 * - 简化职责：定时器由插件主类管理
 */
export class XiuyuanSyncService {
    private config: HybridSyncConfig;
    private riffBlacklistService: RiffBlacklistService;
    private cardTypeDetectionService: CardTypeDetectionService;
    private eventBus: EventBus;
    private xiuyuanRepository: IXiuyuanRepository;
    private deletionTracker: IDeletionTracker;
    private lastSyncTime: number = 0;
    private lastFullSyncTime: number = 0;
    
    // 默认重试配置
    private readonly DEFAULT_RETRY_CONFIG = {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2
    };
    
    constructor(
        config: HybridSyncConfig,
        eventBus: EventBus,
        xiuyuanRepository: IXiuyuanRepository,
        riffBlacklistService: RiffBlacklistService,
        cardTypeDetectionService: CardTypeDetectionService,
        deletionTracker: IDeletionTracker
    ) {
        this.config = {
            ...config,
            retry: config.retry || this.DEFAULT_RETRY_CONFIG
        };
        this.riffBlacklistService = riffBlacklistService;
        this.cardTypeDetectionService = cardTypeDetectionService;
        this.eventBus = eventBus;
        this.xiuyuanRepository = xiuyuanRepository;
        this.deletionTracker = deletionTracker;
    }
    
    /**
     * 发布同步事件（通过 EventBus）
     * 
     * 将旧的事件系统桥接到新的 EventBus
     */
    private publishEvent<K extends keyof HybridSyncEvents>(
        eventName: K,
        eventData: HybridSyncEvents[K]
    ): void {
        // 使用 EventBus 发布事件
        // 事件名称格式: xiuyuan.sync.<eventName>
        const domainEventName = `xiuyuan.sync.${eventName}`;
        
        // 创建一个简单的领域事件对象
        const domainEvent = {
            getEventName: () => domainEventName,
            occurredOn: new Date(),
            toJSON: () => eventData
        };
        
        // 发布到 EventBus
        this.eventBus.publish(domainEvent as any).catch(error => {
            logger.error(`Failed to publish event ${domainEventName}:`, error);
        });
    }
    
    /**
     * 订阅同步事件（兼容旧的 EventEmitter API）
     * 
     * @param eventName 事件名称
     * @param handler 事件处理函数
     */
    on<K extends keyof HybridSyncEvents>(
        eventName: K,
        handler: (data: HybridSyncEvents[K]) => void
    ): void {
        const domainEventName = `xiuyuan.sync.${eventName}`;
        
        // 包装处理函数以适配 EventBus
        const wrappedHandler = (event: any) => {
            const eventData = typeof event.toJSON === 'function' ? event.toJSON() : event;
            handler(eventData);
        };
        
        // 订阅 EventBus 事件
        this.eventBus.subscribe(domainEventName, wrappedHandler);
    }
    
    /**
     * 取消订阅同步事件（兼容旧的 EventEmitter API）
     * 
     * @param eventName 事件名称
     * @param handler 事件处理函数
     */
    off<K extends keyof HybridSyncEvents>(
        eventName: K,
        handler: (data: HybridSyncEvents[K]) => void
    ): void {
        const domainEventName = `xiuyuan.sync.${eventName}`;
        
        // 注意：由于我们包装了处理函数，这里的取消订阅可能不会完全工作
        // 如果需要精确的取消订阅，需要保存包装后的处理函数引用
        // 目前这是一个简化实现
        this.eventBus.unsubscribe(domainEventName, handler as any);
    }
    
    /**
     * 启动同步服务
     * 
     * 执行初始增量同步
     */
    async start(): Promise<void> {
        logger.info('Starting sync service...');
        
        // 执行初始增量同步
        if (this.config.incrementalSync.enabled) {
            await this.incrementalSync();
        }
        
        logger.info('Sync service started');
    }
    
    /**
     * 停止同步服务
     */
    stop(): void {
        logger.info('Stopping sync service...');
        logger.info('Sync service stopped');
    }

    /**
     * 更新同步配置
     *
     * 符合 DDD 架构原则:
     * - 通过公开方法修改内部状态
     * - 保持封装性
     * - 提供清晰的配置更新接口
     *
     * @param config - 新的同步配置
     */
    updateConfig(config: Partial<HybridSyncConfig>): void {
        this.config = {
            ...this.config,
            ...config,
            retry: config.retry || this.config.retry
        };
        logger.info('Config updated:', this.config);
    }

    private beginSync(type: SyncType): number {
        const startTime = Date.now();
        logger.info(`Starting ${type} sync...`);
        this.publishEvent('syncStart', {
            type,
            timestamp: startTime
        });
        return startTime;
    }

    private completeSync(
        type: SyncType,
        startTime: number,
        result: SyncResult,
        summary: string
    ): SyncResult {
        this.publishEvent('syncSuccess', {
            type,
            result,
            timestamp: Date.now(),
            duration: Date.now() - startTime
        });
        logger.info(summary);
        return result;
    }

    private failSync(type: SyncType, error: unknown): never {
        logger.error(`${type} sync failed:`, error);
        throw error;
    }

    
    /**
     * 增量同步（公共方法）
     * 
     * 从 Riff 获取新卡片，使用黑名单过滤，只添加本地不存在的卡片
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async incrementalSync(onProgress?: ProgressCallback): Promise<SyncResult> {
        return this.withRetry('incremental', async () => {
            const startTime = this.beginSync('incremental');
            
            try {
                // 1. 获取新卡片（since lastSyncTime）
                this.reportProgress(onProgress, 'incremental', 'fetching', 0, 1, '正在获取新卡片...');
                
                // 🔧 禁用时间过滤
                // 原因：时间过滤会导致新卡片被过滤掉，具体原因待调查：
                // 1. 卡片的 created 时间可能有问题（如 "0001-01-01T00:00:00Z"）
                // 2. lastSyncTime 更新时机可能不对
                // 3. Riff API 延迟导致时间窗口不够
                // 
                // 当前方案：禁用时间过滤，通过 localCard 检查来避免重复添加
                // 性能影响：每次获取所有卡片，但通过 skipped 机制避免重复
                logger.info(`lastSyncTime: ${this.lastSyncTime}, current: ${Date.now()}, diff: ${Math.floor((Date.now() - this.lastSyncTime) / 1000)}s`);
                
                const newCards = await getRiffNewCards(
                    this.config.deckId,
                    undefined  // 禁用时间过滤，获取所有卡片
                );
                
                logger.info(`Fetched ${newCards.length} cards from Riff (time filter disabled)`);
                
                // 2. 过滤黑名单
                this.reportProgress(onProgress, 'incremental', 'filtering', 1, 7, '正在过滤黑名单...');
                let filtered = newCards;
                if (this.config.incrementalSync.useBlacklist) {
                    filtered = await this.riffBlacklistService.filterBlacklist(newCards);
                    logger.info(`Filtered ${newCards.length - filtered.length} blacklisted cards`);
                }
                
                logger.info(`Processing ${filtered.length} cards for incremental sync`);
                
                // 3. 只添加本地不存在的卡片，或更新已存在卡片的优先级
                this.reportProgress(onProgress, 'incremental', 'adding', 2, 7, '正在同步卡片...');
                let addedCount = 0;
                let updatedCount = 0;
                let skippedCount = 0;
                const addedCards: RiffBlock[] = [];
                
                for (const riffCard of filtered) {
                    // 🔧 防护 0：检查是否最近被删除（防止孤儿卡片）
                    if (this.deletionTracker.isRecentlyDeleted(riffCard.id)) {
                        logger.info(`Block ${riffCard.id} was recently deleted, skipping to prevent orphan cards`);
                        skippedCount++;
                        continue;
                    }
                    
                    // 🔧 防护 1：检查块属性，避免重复创建
                    const { getBlockAttrs } = await import('@/core/siyuan/api');
                    try {
                        const attrs = await getBlockAttrs(riffCard.id);
                        if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
                            const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
                            logger.info(`Block ${riffCard.id} already has Xiuyuan: ${existingXiuyuanId}, skipping`);
                            skippedCount++;
                            continue;
                        }
                    } catch (error) {
                        logger.warn(`Failed to check block attrs for ${riffCard.id}:`, error);
                        // 继续执行，不阻断流程
                    }
                    
                    // 🔧 防护 2：使用 Repository 查询（统一 ID 格式，去掉 riff_ 前缀）
                    const xiuyuanIdStr = `xy_${riffCard.id}`;
                    const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
                    
                    if (!xiuyuanIdResult.ok) {
                        logger.error(`Invalid Xiuyuan ID: ${xiuyuanIdStr}`);
                        skippedCount++;
                        continue;
                    }
                    
                    const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
                    
                    if (!existingXiuyuanResult.ok) {
                        const errorMsg = 'error' in existingXiuyuanResult ? existingXiuyuanResult.error : 'Unknown error';
                        logger.error('Failed to query Xiuyuan:', errorMsg);
                        skippedCount++;
                        continue;
                    }
                    
                    const existingXiuyuan = existingXiuyuanResult.value;
                    
                    logger.info(`Checking card ${riffCard.id}: existingXiuyuan=${!!existingXiuyuan}`);
                    
                    if (!existingXiuyuan) {
                        // ✅ 本地没有，通过 Repository 保存（完全符合 DDD）
                        logger.info('✅ Creating new Xiuyuan from Riff:', {
                            xiuyuanId: xiuyuanIdStr,
                            blockId: riffCard.id,
                            source: 'riff-sync'
                        });
                        const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
                        
                        logger.info(`Created Xiuyuan ${xiuyuanEntity.getId().getValue()} with ${xiuyuanEntity.getCards().length} cards`);
                        
                        // ✅ 通过 Repository 保存 Xiuyuan（会自动保存关联的 Card）
                        const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
                        if (!saveResult.ok) {
                            const errorMsg = saveResult.ok === false ? saveResult.error.message : 'Unknown error';
                            logger.error(`Failed to save Xiuyuan ${xiuyuanEntity.getId().getValue()}: ${errorMsg}`);
                            continue;
                        }
                        
                        logger.info(`Successfully saved Xiuyuan ${xiuyuanEntity.getId().getValue()}`);
                        
                        addedCards.push(riffCard);
                        addedCount++;
                    } else {
                        // ✅ 本地已存在 Xiuyuan，只同步块 IAL 中的卡片类型元数据
                        // 🔧 不同步任何调度字段（priority、aFactor 等），本地复习数据永远优先
                        logger.info(`Updating existing Xiuyuan ${xiuyuanIdStr}`);

                        let needsUpdate = false;

                        // 从块 IAL 属性读取卡片类型元数据（非调度数据，合法同步）
                        const cardTypeMarkerAttr = riffCard.ial?.['custom-fsrs-card-type'];
                        const newCardTypeMarker = (cardTypeMarkerAttr === 'concept' || cardTypeMarkerAttr === 'descriptor')
                            ? cardTypeMarkerAttr as 'concept' | 'descriptor'
                            : undefined;

                        let newCardType: 'topic' | 'item' | 'concept' | 'descriptor' | undefined;
                        if (newCardTypeMarker) {
                            newCardType = newCardTypeMarker;
                        } else {
                            const cardTypeAttr = riffCard.ial?.['custom-card-type'];
                            if (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || cardTypeAttr === 'concept' || cardTypeAttr === 'descriptor') {
                                newCardType = cardTypeAttr;
                            }
                        }

                        // 更新卡片类型标记（concept/descriptor）
                        if (newCardTypeMarker) {
                            const currentCardTypeMarker = existingXiuyuan.getMeta().cardTypeMarker;
                            if (currentCardTypeMarker !== newCardTypeMarker) {
                                const updateResult = existingXiuyuan.updateCardTypeMarker(newCardTypeMarker);
                                if (updateResult.ok) {
                                    logger.info(`Updated cardTypeMarker: ${currentCardTypeMarker} -> ${newCardTypeMarker}`);
                                    needsUpdate = true;
                                }
                            }
                        }

                        // 更新卡片类型（topic/item）
                        if (newCardType) {
                            const currentCardType = existingXiuyuan.getMeta().cardType;
                            if (currentCardType !== newCardType) {
                                const updateResult = existingXiuyuan.updateCardType(newCardType);
                                if (updateResult.ok) {
                                    logger.info(`Updated cardType: ${currentCardType} -> ${newCardType}`);
                                    needsUpdate = true;
                                }
                            }
                        }

                        // 3. 保存更新
                        if (needsUpdate) {
                            const saveResult = await this.xiuyuanRepository.save(existingXiuyuan);
                            if (saveResult.ok) {
                                logger.info(`Successfully updated Xiuyuan ${xiuyuanIdStr}`);
                                updatedCount++;
                            } else {
                                const errorMsg = saveResult.ok === false ? saveResult.error.message : 'Unknown error';
                                logger.error(`Failed to save updated Xiuyuan: ${errorMsg}`);
                                skippedCount++;
                            }
                        } else {
                            logger.info(`No changes detected for Xiuyuan ${xiuyuanIdStr}`);
                            skippedCount++;
                        }
                    }
                }
                
                // 4. 检测并删除本地有但 Riff 没有的 Xiuyuan
                this.reportProgress(onProgress, 'incremental', 'deleting', 4, 7, '正在检测删除的卡片...');
                let deletedCount = 0;
                
                // ✅ 使用 Repository 查询所有 Xiuyuan（符合 DDD 架构）
                const allXiuyuansResult = await this.xiuyuanRepository.findAll();
                if (!allXiuyuansResult.ok) {
                    const errorMsg = 'error' in allXiuyuansResult ? allXiuyuansResult.error : 'Unknown error';
                    logger.error('Failed to get all Xiuyuans:', errorMsg);
                } else {
                    const allXiuyuans = allXiuyuansResult.value;
                    
                    // 创建 Riff 块 ID 集合
                    const riffBlockIds = new Set(filtered.map(c => c.id));
                    
                    // 找出本地有但 Riff 没有的 Xiuyuan（只删除 Riff 同步创建的）
                    const xiuyuansToDelete = allXiuyuans.filter(xiuyuan => {
                        const xiuyuanId = xiuyuan.getId().getValue();
                        
                        // 🔧 检查是否为 Riff 同步创建的 Xiuyuan
                        // 新格式：xy_{blockId}，需要检查对应的块是否还在 Riff 中
                        // 旧格式：xy_riff_{blockId}，兼容处理
                        if (!xiuyuanId.startsWith('xy_riff_') && !xiuyuanId.startsWith('xy_')) {
                            return false;
                        }
                        
                        // 跳过迁移数据
                        if (xiuyuanId.startsWith('xy_migrated_')) {
                            return false;
                        }
                        
                        // 检查对应的块是否还在 Riff 中
                        const blockIds = xiuyuan.getBlockIDs();
                        if (blockIds.length === 0) {
                            return false;
                        }
                        
                        const blockId = blockIds[0].getValue();
                        return !riffBlockIds.has(blockId);
                    });
                    
                    if (xiuyuansToDelete.length > 0) {
                        logger.info(`Deleting ${xiuyuansToDelete.length} Xiuyuans that no longer exist in Riff`);
                        
                        // ✅ 使用 Repository 删除（符合 DDD 架构）
                        for (const xiuyuan of xiuyuansToDelete) {
                            const deleteResult = await this.xiuyuanRepository.delete(xiuyuan);
                            if (deleteResult.ok) {
                                deletedCount++;
                            } else {
                                const errorMsg = 'error' in deleteResult ? deleteResult.error : 'Unknown error';
                                logger.error(`Failed to delete Xiuyuan ${xiuyuan.getId().getValue()}:`, errorMsg);
                            }
                        }
                        
                        logger.info(`Deleted ${deletedCount} Xiuyuans via Repository`);
                    }
                }
                
                // 5. 保存（Repository.delete() 已经自动保存，不需要额外调用）
                this.reportProgress(onProgress, 'incremental', 'saving', 5, 7, '正在保存数据...');
                // ✅ Repository 操作已经自动保存，移除 saveCards() 调用
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCards.length > 0) {
                    this.reportProgress(onProgress, 'incremental', 'detecting', 6, 7, '正在检测卡片类型...');
                    detectedCount = await this.detectCardTypesForNewCards(addedCards);
                }
                
                // 7. 更新时间戳
                this.lastSyncTime = Date.now();
                
                const result: SyncResult = {
                    success: true,
                    addedCount,
                    deletedCount,  // 🆕 返回删除数量
                    skippedCount,
                    detectedCount
                };

                return this.completeSync(
                    'incremental',
                    startTime,
                    result,
                    `Incremental sync completed: added ${addedCount}, updated ${updatedCount}, deleted ${deletedCount}, skipped ${skippedCount}, detected ${detectedCount || 0}`
                );
            } catch (error) {
                return this.failSync('incremental', error);
            }
        });
    }
    
    /**
     * 全量同步
     * 
     * 对比 Riff 和本地的所有卡片，执行新增/删除，清理黑名单
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async fullSync(onProgress?: ProgressCallback): Promise<SyncResult> {
        return this.withRetry('full', async () => {
            const startTime = this.beginSync('full');
            
            try {
                // 1. 获取所有卡片（使用 blockId 而不是 cardId）
                this.reportProgress(onProgress, 'full', 'fetching', 0, 7, '正在获取所有卡片...');
                const riffCards = await getRiffCards(this.config.deckId, {
                    dueOnly: false,
                    includeNew: true
                });
                // 🔧 修改：使用 Repository 查询所有 Xiuyuan
                const riffBlockIds = new Set(riffCards.map(c => c.id));
                
                // ✅ 使用 Repository 查询所有 Xiuyuan（符合 DDD 架构）
                const allXiuyuansResult = await this.xiuyuanRepository.findAll();
                if (!allXiuyuansResult.ok) {
                    const errorMsg = 'error' in allXiuyuansResult ? allXiuyuansResult.error : 'Unknown error';
                    logger.error('Failed to get all Xiuyuans:', errorMsg);
                    throw new Error(`Failed to get all Xiuyuans: ${errorMsg}`);
                }
                
                const allXiuyuans = allXiuyuansResult.value;
                logger.info(`Riff: ${riffBlockIds.size} blocks, Local: ${allXiuyuans.length} Xiuyuans`);
                
                // 2. 🔧 只添加新卡片（本地没有的），不更新已有卡片的复习数据
                this.reportProgress(onProgress, 'full', 'adding', 2, 7, '正在添加新卡片...');
                let addedCount = 0;
                let skippedCount = 0;
                
                for (const riffCard of riffCards) {
                    // ✅ 使用 Repository 查询（符合 DDD 架构，统一 ID 格式）
                    const xiuyuanIdStr = `xy_${riffCard.id}`;
                    const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
                    
                    if (!xiuyuanIdResult.ok) {
                        logger.error(`Invalid Xiuyuan ID: ${xiuyuanIdStr}`);
                        continue;
                    }
                    
                    const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
                    
                    if (!existingXiuyuanResult.ok) {
                        const errorMsg = 'error' in existingXiuyuanResult ? existingXiuyuanResult.error : 'Unknown error';
                        logger.error('Failed to query Xiuyuan:', errorMsg);
                        continue;
                    }
                    
                    const existingXiuyuan = existingXiuyuanResult.value;
                    
                    if (existingXiuyuan) {
                        // ✅ 已存在，跳过（不覆盖本地复习数据）
                        logger.info(`Xiuyuan exists locally, skipping: ${riffCard.id}`);
                        skippedCount++;
                    } else {
                        // ✅ 不存在，通过 Repository 保存（完全符合 DDD）
                        const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
                        
                        // ✅ 通过 Repository 保存 Xiuyuan（会自动保存关联的 Card）
                        const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
                        if (saveResult.ok) {
                            addedCount++;
                        } else {
                            const errorMsg = saveResult.ok === false ? saveResult.error.message : 'Unknown error';
                            logger.error(`Failed to save Xiuyuan ${xiuyuanEntity.getId().getValue()}: ${errorMsg}`);
                        }
                    }
                }
                
                logger.info(`Added ${addedCount} new Xiuyuans, skipped ${skippedCount} existing Xiuyuans`);
                
                // 3. 删除：本地有但 Riff 没有（通过 blockId 判断）
                this.reportProgress(onProgress, 'full', 'deleting', 3, 7, '正在删除过期卡片...');
                
                // ✅ 使用 Repository 查询和删除（符合 DDD 架构）
                const xiuyuansToDelete = allXiuyuans.filter(xiuyuan => {
                    const xiuyuanId = xiuyuan.getId().getValue();
                    
                    // 🔧 检查是否为 Riff 同步创建的 Xiuyuan
                    // 新格式：xy_{blockId}，需要检查对应的块是否还在 Riff 中
                    // 旧格式：xy_riff_{blockId}，兼容处理
                    if (!xiuyuanId.startsWith('xy_riff_') && !xiuyuanId.startsWith('xy_')) {
                        return false;
                    }
                    
                    // 跳过迁移数据
                    if (xiuyuanId.startsWith('xy_migrated_')) {
                        return false;
                    }
                    
                    // 检查对应的块是否还在 Riff 中
                    const blockIds = xiuyuan.getBlockIDs();
                    if (blockIds.length === 0) {
                        return false;
                    }
                    
                    const blockId = blockIds[0].getValue();
                    return !riffBlockIds.has(blockId);
                });
                
                let deletedCount = 0;
                if (xiuyuansToDelete.length > 0) {
                    logger.info(`Deleting ${xiuyuansToDelete.length} Xiuyuans that no longer exist in Riff`);
                    
                    for (const xiuyuan of xiuyuansToDelete) {
                        const deleteResult = await this.xiuyuanRepository.delete(xiuyuan);
                        if (deleteResult.ok) {
                            deletedCount++;
                        } else {
                            const errorMsg = 'error' in deleteResult ? deleteResult.error : 'Unknown error';
                            logger.error(`Failed to delete Xiuyuan ${xiuyuan.getId().getValue()}:`, errorMsg);
                        }
                    }
                }
                
                logger.info(`Deleted ${deletedCount} Xiuyuans not in Riff`);
                
                // 4. 清理黑名单：黑名单中 Riff 已不存在的 blockId
                let blacklistCleanedCount = 0;
                if (this.config.fullSync.cleanupBlacklist) {
                    this.reportProgress(onProgress, 'full', 'cleanup', 4, 7, '正在清理黑名单...');
                    blacklistCleanedCount = await this.riffBlacklistService.cleanupBlacklist(riffBlockIds);
                    logger.info(`Cleaned ${blacklistCleanedCount} IDs from blacklist`);
                }
                
                // 5. 保存
                this.reportProgress(onProgress, 'full', 'saving', 5, 7, '正在保存数据...');
                // ✅ Repository.save() 和 Repository.delete() 已经自动保存
                // 不需要额外调用 saveCards()
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCount > 0) {
                    this.reportProgress(onProgress, 'full', 'detecting', 6, 7, '正在检测卡片类型...');
                    // 只检测新添加的卡片
                    const newCards: RiffBlock[] = [];
                    for (const riffCard of riffCards) {
                        const xiuyuanIdStr = `xy_${riffCard.id}`;
                        const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
                        if (!xiuyuanIdResult.ok) continue;
                        
                        const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
                        if (!existingXiuyuanResult.ok || !existingXiuyuanResult.value) {
                            newCards.push(riffCard);
                        }
                    }
                    
                    if (newCards.length > 0) {
                        detectedCount = await this.detectCardTypesForNewCards(newCards);
                    }
                }
                
                // 7. 更新时间戳
                this.lastFullSyncTime = Date.now();
                
                const result: SyncResult = {
                    success: true,
                    addedCount,
                    deletedCount,
                    skippedCount, // 🔧 记录跳过的已有卡片数量
                    blacklistCleanedCount,
                    detectedCount
                };

                return this.completeSync(
                    'full',
                    startTime,
                    result,
                    `Full sync completed: added ${addedCount}, deleted ${deletedCount}, skipped ${skippedCount}, blacklistCleaned ${blacklistCleanedCount}, detected ${detectedCount || 0}`
                );
            } catch (error) {
                return this.failSync('full', error);
            }
        });
    }
    
    /**
     * 同步单个 Riff 卡片到本地
     * 
     * 检查是否为 Xiuyuan 卡片，如果是则更新所有关联的 FSRSCard
     * 
     * @param riffCard Riff 卡片数据
     */
    /**
     * 🔧 从 Riff 同步卡片到本地（已废弃）
     * 
     * @deprecated 此方法已不再使用，所有同步逻辑已迁移到 incrementalSync 和 fullSync
     * 
     * @param riffCard Riff 卡片数据
     */
    private async syncRiffCardToLocal(riffCard: RiffBlock): Promise<void> {
        logger.warn('syncRiffCardToLocal is deprecated and should not be called');
        // 此方法已废弃，所有同步逻辑已迁移到 incrementalSync 和 fullSync
    }
    
    // ==================== 跨设备重建逻辑（TODO）====================
    
    /**
     * 从块重建 Xiuyuan（跨设备同步）
     * 
     * TODO: 实现跨设备重建逻辑
     * 
     * @param blockId 代表块 ID
     * @param xiuyuanID Xiuyuan ID
     * @param templateID 模版 ID
     * @param riffCard Riff 卡片数据
     */
    private async rebuildXiuyuanFromBlock(
        blockId: string,
        xiuyuanID: string,
        templateID: string,
        riffCard: RiffBlock
    ): Promise<void> {
        logger.warn('rebuildXiuyuanFromBlock not yet implemented');
        // TODO: 实现以下步骤
        // 1. 获取块的子块（重建 blockIDs）
        // const blockIDs = await this.getXiuyuanBlockIDs(blockId, templateID);
        // 
        // 2. 重建 fieldMapping
        // const fieldMapping = await this.rebuildFieldMapping(blockIDs, templateID);
        // 
        // 3. 调用 XiuyuanService.createFromBlocks
        // const result = await this.xiuyuanService.createFromBlocks(
        //     blockIDs,
        //     templateID,
        //     fieldMapping,
        //     BUILTIN_DECK_ID
        // );
        // 
        // 4. 更新复习数据
        // if (result.ok) {
        //     await this.updateXiuyuanReviewData(xiuyuanID, riffCard);
        // }
    }
    
    /**
     * 获取 Xiuyuan 的所有块 ID
     * 
     * TODO: 实现获取子块逻辑
     * 
     * @param blockId 代表块 ID
     * @param templateID 模版 ID
     * @returns 块 ID 数组
     */
    private async getXiuyuanBlockIDs(blockId: string, templateID: string): Promise<string[]> {
        logger.warn('getXiuyuanBlockIDs not yet implemented');
        // TODO: 根据模版类型获取相关块
        // 例如：列表模版需要获取父块和子块
        return [blockId];
    }
    
    /**
     * 重建字段映射
     * 
     * TODO: 实现字段映射重建逻辑
     * 
     * @param blockIDs 块 ID 数组
     * @param templateID 模版 ID
     * @returns 字段映射
     */
    private async rebuildFieldMapping(
        blockIDs: string[],
        templateID: string
    ): Promise<Record<string, string>> {
        logger.warn('rebuildFieldMapping not yet implemented');
        // TODO: 根据模版类型和块 ID 重建字段映射
        return {};
    }
    
    /**
     * 更新 Xiuyuan 的复习数据
     * 
     * TODO: 实现复习数据更新逻辑
     * 
     * @param xiuyuanID Xiuyuan ID
     * @param riffCard Riff 卡片数据
     */
    private async updateXiuyuanReviewData(xiuyuanID: string, riffCard: RiffBlock): Promise<void> {
        logger.warn('updateXiuyuanReviewData not yet implemented');
        // TODO: 更新所有关联卡片的复习数据
        // const xiuyuanCards = this.storage.getAllCards().filter(
        //     card => card.meta?.xiuyuanID === xiuyuanID
        // );
        // 
        // const riffData = riffCard.riffCard || {};
        // for (const card of xiuyuanCards) {
        //     // 更新复习数据
        // }
    }
    
    /**
     * 删除同步
     * 
     * 尝试从 Riff 删除卡片，失败时加入黑名单
     * 支持自动重试机制
     */
    /**
         * 删除同步（单个卡片）
         * 
         * 尝试从 Riff 删除卡片，失败时加入黑名单。
         * 支持自动重试机制。
         * 
         * @deprecated 建议使用 deleteSyncBatch() 进行批量删除
         */
        async deleteSync(cardID: string): Promise<boolean> {
            if (!this.config.deleteSync.enabled) {
                logger.info('Delete sync disabled');
                return true;
            }

            logger.info(`Syncing delete for card: ${cardID}`);

            return this.deleteSyncSingle(cardID);
        }

    /**
     * 批量删除同步
     *
     * 批量从 Riff 删除多张卡片，使用并发处理提升性能。
     * 失败的卡片会加入黑名单（如果启用）。
     *
     * @param cardIDs - 卡片 ID 列表
     * @returns 成功删除的数量
     */
    async deleteSyncBatch(cardIDs: string[]): Promise<number> {
        if (!this.config.deleteSync.enabled) {
            logger.info('Delete sync disabled');
            return 0;
        }

        if (cardIDs.length === 0) {
            return 0;
        }

        logger.info(`Batch syncing delete for ${cardIDs.length} cards`);

        // 使用 Promise.allSettled 并发处理，避免单个失败影响整体
        const results = await Promise.allSettled(
            cardIDs.map(cardID => this.deleteSyncSingle(cardID))
        );

        // 统计结果
        let successCount = 0;
        let failedCount = 0;
        const failedCardIds: string[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                successCount++;
            } else {
                failedCount++;
                failedCardIds.push(cardIDs[index]);
            }
        });

        logger.info(`Batch delete sync completed: ${successCount} success, ${failedCount} failed`);

        if (failedCardIds.length > 0) {
            logger.warn('Failed card IDs:', failedCardIds);
        }

        return successCount;
    }

    /**
     * 单个卡片删除同步（内部方法）
     *
     * 从 deleteSync 提取的核心逻辑，用于批量处理。
     *
     * @private
     * @param cardID - 卡片 ID
     * @returns 是否成功
     */
    private async deleteSyncSingle(cardID: string): Promise<boolean> {
        try {
            // 使用重试机制尝试从 Riff 删除
            await this.withRetry('delete', async () => {
                await removeRiffCards(this.config.deckId, [cardID]);
            });

            logger.info(`Successfully removed card from Riff: ${cardID}`);
            return true;
        } catch (error) {
            logger.error(`Failed to remove card from Riff after retries: ${cardID}`, error);

            // 失败时加入黑名单（如果启用）
            if (this.config.deleteSync.useBlacklistFallback) {
                await this.riffBlacklistService.addToBlacklist(cardID);
                logger.info(`Added card to blacklist as fallback: ${cardID}`);
            }

            return false;
        }
    }
    
    /**
     * 获取同步状态（向后兼容）
     * 
     * @deprecated 建议使用事件监听代替轮询状态
     */
    getSyncStatus(): {
        status: SyncStatus;
        lastSyncTime: number;
        lastFullSyncTime: number;
    } {
        return {
            status: 'idle', // 不再维护内部状态
            lastSyncTime: this.lastSyncTime,
            lastFullSyncTime: this.lastFullSyncTime
        };
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 自动检测新卡片的类型（Topic/Item）
     * 
     * 适配自 browserService.batchDetectCardTypes()
     * 
     * @param cards 新添加的卡片列表
     * @returns 成功检测的卡片数量
     */
    private async detectCardTypesForNewCards(cards: RiffBlock[]): Promise<number> {
        if (cards.length === 0) {
            return 0;
        }
        
        logger.info(`Auto-detecting card types for ${cards.length} new cards...`);
        
        try {
            // 0. 过滤掉已经有 cardTypeMarker 的卡片（用户手动标记的）
            const cardsToDetect: RiffBlock[] = [];
            let skippedWithMarker = 0;
            
            for (const card of cards) {
                try {
                    const attrs = await getBlockAttrs(card.id);
                    const cardTypeMarker = attrs?.['custom-fsrs-card-type'];
                    
                    if (cardTypeMarker === 'concept' || cardTypeMarker === 'descriptor') {
                        // 跳过已有用户标记的卡片
                        skippedWithMarker++;
                        logger.info(`Skipping card with cardTypeMarker: ${card.id} (${cardTypeMarker})`);
                        continue;
                    }
                    
                    cardsToDetect.push(card);
                } catch (err) {
                    // 如果获取属性失败，仍然尝试检测
                    cardsToDetect.push(card);
                }
            }
            
            if (skippedWithMarker > 0) {
                logger.info(`Skipped ${skippedWithMarker} cards with user-defined cardTypeMarker`);
            }
            
            if (cardsToDetect.length === 0) {
                logger.info('No cards to detect (all have cardTypeMarker)');
                return 0;
            }
            
            // 1. 批量检测类型
            const blockIds = cardsToDetect.map(c => c.id);
            const typeMap = await this.cardTypeDetectionService.batchDetectCardTypes(blockIds);
            
            // 2. 批量更新块属性（每批 50 张，避免阻塞）
            let updated = 0;
            let failed = 0;
            const BATCH_SIZE = 50;
            
            for (let i = 0; i < cardsToDetect.length; i += BATCH_SIZE) {
                const batch = cardsToDetect.slice(i, i + BATCH_SIZE);
                
                await Promise.all(batch.map(async (card) => {
                    try {
                        const cardType = typeMap.get(card.id);
                        if (!cardType) {
                            failed++;
                            return;
                        }
                        
                        const attrs: Record<string, string> = {
                            [ATTR_CARD_TYPE]: cardType,
                        };
                        
                        // 🔧 修复：不再写入 A-Factor 块属性，只保留在卡片数据中
                        // Topic 卡片的 A-Factor 存储在 FSRSCard.aFactor 中
                        
                        await setBlockAttrs(card.id, attrs);
                        updated++;
                    } catch (err) {
                        logger.error(`Failed to update card type for ${card.id}:`, err);
                        failed++;
                    }
                }));
            }
            
            logger.info(`Auto-detection completed: ${updated} updated, ${failed} failed, ${skippedWithMarker} skipped (total: ${cards.length})`);
            return updated;
        } catch (error) {
            logger.error('Auto-detection failed:', error);
            return 0;
        }
    }
    
    /**
     * 智能检测卡片类型（用于快速制卡）
     * 
     * @deprecated 使用 CardTypeDetectionService.detectCardType() 代替
     * 
     * @param riffBlock Riff 卡片数据
     * @returns 'topic' | 'item'
     */
    private async smartDetectCardType(riffBlock: RiffBlock): Promise<'topic' | 'item'> {
        return await this.cardTypeDetectionService.detectCardType(riffBlock.id);
    }
    
    /**
     * 转换 RiffBlock 为 Xiuyuan 领域实体
     * 
     * 从 Riff 数据和块属性中提取卡片信息，并创建对应的 Xiuyuan 聚合根。
     * 
     * **DDD 架构要求**：所有卡片必须属于 Xiuyuan 聚合根
     * - 为每个 Riff 卡片创建一个独立的 Xiuyuan
     * - 使用特殊模板 `builtin-riff-sync` 标记从 Riff 同步的卡片
     * - ✅ 创建完整的 Card 领域实体（包含 FSRS 数据）
     * 
     * **Xiuyuan ID 命名规则**：
     * - 格式：`xy_{blockId}`（统一格式）
     * - 目的：
     *   1. 幂等性：同一个块多次同步生成相同 ID，避免重复创建
     *   2. 可追溯性：通过块 ID 可以直接定位到思源块
     *   3. 统一性：与模板创建的 ID 格式一致，避免重复创建
     *   2. 可追溯性：通过前缀 "riff" 可以识别来源（区别于用户手动创建的 `xy_{timestamp}_{random}`）
     *   3. 防止冲突：与手动创建的 ID 格式不同，不会产生冲突
     * 
     * 卡片类型优先从 cardTypeMarker 推导，其次从 custom-card-type 读取。
     * 卡片类型标记（concept/descriptor）从块属性 `custom-fsrs-card-type` 中读取。
     * 
     * 🆕 智能识别 Topic/Item（快速制卡）：
     * - 如果没有块属性标记，自动检测：
     *   1. 文档块 → topic
     *   2. 有挖空符号（==、::）→ item
     *   3. 标题块 → item
     *   4. 列表项有子级 → item
     *   5. 超级块有子级 → item
     *   6. 其他 → topic
     * 
     * @returns { xiuyuanEntity } - Xiuyuan 领域实体（包含 Card）
     */
    private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
        xiuyuanEntity: Xiuyuan;  // ✅ 返回完整的领域实体（包含 Card）
    }> {
        const riffCard = riffBlock.riffCard;
        const now = Date.now();
        
        // 1. 创建 Xiuyuan ID（统一格式）
        const xiuyuanIdStr = `xy_${riffBlock.id}`;
        
        // 目的：
        // - 幂等性：同一个块多次同步生成相同 ID，避免重复创建
        // - 可追溯性：通过块 ID 可以直接定位到思源块
        // - 统一性：与模板创建的 ID 格式一致，避免重复创建
        
        // 2. 从块属性中读取卡片类型标记（concept/descriptor）
        const cardTypeMarkerAttr = riffBlock.ial?.['custom-fsrs-card-type'];
        const cardTypeMarker = (cardTypeMarkerAttr === 'concept' || cardTypeMarkerAttr === 'descriptor')
            ? cardTypeMarkerAttr as 'concept' | 'descriptor'
            : undefined;
        
        // 3. 根据 cardTypeMarker 推导 CardType，或从块属性读取，或智能识别
        let cardType: string;
        if (cardTypeMarker) {
            // 如果有 cardTypeMarker，使用对应的 CardType 枚举值
            // concept -> CardType.Concept, descriptor -> CardType.Descriptor
            cardType = cardTypeMarker === 'concept' ? 'concept' : 'descriptor';
        } else {
            // 否则从块属性中读取技术类型
            const cardTypeAttr = riffBlock.ial?.['custom-card-type'];
            if (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || cardTypeAttr === 'concept' || cardTypeAttr === 'descriptor') {
                cardType = cardTypeAttr;
            } else {
                // 🆕 智能识别：快速制卡没有块属性，需要自动检测
                cardType = await this.smartDetectCardType(riffBlock);
            }
        }
        
        // 🔧 修复：验证 lastReview 日期的有效性
        // Riff API 可能返回无效日期（如 "0001-01-01T00:00:00Z"），需要过滤
        const parseValidDate = (dateStr: string | undefined): number => {
            if (!dateStr) return 0;
            const timestamp = new Date(dateStr).getTime();
            // 检查是否为有效时间戳（大于 2000-01-01 且不是 NaN）
            // 2000-01-01 ≈ 946684800000 ms
            // 这样可以过滤掉 "0001-01-01" 这种无效日期（会被解析为负数或很小的正数）
            const MIN_VALID_TIMESTAMP = 946684800000; // 2000-01-01
            const isValid = timestamp >= MIN_VALID_TIMESTAMP && !isNaN(timestamp);
            
            // 🔍 调试：记录无效日期（仅在开发模式）
            if (!isValid && dateStr && dateStr !== "0001-01-01T00:00:00Z") {
                // 只警告非零值的无效日期，"0001-01-01" 是新卡片的正常零值
                logger.warn(`Invalid date detected: "${dateStr}" (timestamp: ${timestamp}) for card ${riffBlock.id}`);
            }
            
            return isValid ? timestamp : 0;
        };
        
        // 4. 获取优先级
        // ✅ 通过 Repository 查询现有 Xiuyuan（如果存在）
        const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
        if (!xiuyuanIdResult.ok) {
            const errorMsg = xiuyuanIdResult.ok === false ? xiuyuanIdResult.error.message : 'Invalid XiuyuanId';
            throw new Error(`Failed to create XiuyuanId: ${errorMsg}`);
        }
        
        const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
        const priorityValue = (() => {
            // 如果本地已有 Xiuyuan，保持原有优先级
            if (existingXiuyuanResult.ok && existingXiuyuanResult.value) {
                return existingXiuyuanResult.value.getPriority().getValue();
            }
            
            // 默认值
            return 50;
        })();
        
        // ✅ 创建其他值对象
        const blockIdResult = BlockId.create(riffBlock.id);
        if (!blockIdResult.ok) {
            const errorMsg = blockIdResult.ok === false ? blockIdResult.error.message : 'Invalid BlockId';
            throw new Error(`Failed to create BlockId: ${errorMsg}`);
        }
        
        const templateIdResult = TemplateId.create('builtin-riff-sync');
        if (!templateIdResult.ok) {
            const errorMsg = templateIdResult.ok === false ? templateIdResult.error.message : 'Invalid TemplateId';
            throw new Error(`Failed to create TemplateId: ${errorMsg}`);
        }
        
        const priorityResult = Priority.create(priorityValue);
        const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();
        
        const cardFaceResult = CardFace.create({
            question: riffBlock.content || `Block ${riffBlock.id}`,  // ✅ 使用块内容作为 question
            answer: '',  // Riff 卡片没有独立的 answer
            questionBlockId: riffBlock.id,
            answerBlockId: riffBlock.id
        });
        if (!cardFaceResult.ok) {
            const errorMsg = cardFaceResult.ok === false ? cardFaceResult.error.message : 'Invalid CardFace';
            throw new Error(`Failed to create CardFace: ${errorMsg}`);
        }
        
        // ✅ 创建 Xiuyuan 领域实体
        const xiuyuanResult = Xiuyuan.create({
            id: xiuyuanIdResult.value,
            blockIDs: [blockIdResult.value],
            templateID: templateIdResult.value,
            faces: [cardFaceResult.value],
            priority,
            meta: {
                schedulerType: 'fsrs-v6',
                cardType,  // 保存卡片类型
                cardTypeMarker,  // 保存卡片类型标记
                // 🔧 修复：为 Topic 卡片初始化 A-Factor
                ...(cardType === 'topic' ? { aFactor: initializeAFactor(priorityValue) } : {})
            }
        });
        
        if (!xiuyuanResult.ok) {
            const errorMsg = xiuyuanResult.ok === false ? xiuyuanResult.error.message : 'Invalid Xiuyuan';
            throw new Error(`Failed to create Xiuyuan: ${errorMsg}`);
        }
        
        const xiuyuanEntity = xiuyuanResult.value;
        
        // ✅ 创建 Card 实体（通过 Card.create，包含完整的 FSRS 数据）
        const { CardId } = await import('@/core/xiuyuan/domain/CardId');
        const { ScheduleInfo } = await import('@/core/xiuyuan/domain/ScheduleInfo');
        const { Card } = await import('@/core/xiuyuan/domain/Card');
        
        const cardIdResult = CardId.create(riffBlock.id);
        if (!cardIdResult.ok) {
            const errorMsg = cardIdResult.ok === false ? cardIdResult.error.message : 'Invalid CardId';
            throw new Error(`Failed to create CardId: ${errorMsg}`);
        }
        
        const scheduleInfoResult = ScheduleInfo.create({
            due: new Date(parseValidDate(riffCard?.due) || now),
            stability: riffCard?.stability || 0,
            difficulty: riffCard?.difficulty || 0,
            reps: riffCard?.reps || 0,
            lapses: riffCard?.lapses || 0,
            state: (riffCard?.state || 0) as any,
            lastReview: new Date(parseValidDate(riffCard?.lastReview) || now),
            elapsedDays: riffCard?.elapsedDays || 0,
            scheduledDays: riffCard?.scheduledDays || 0,
            learning_step: 0
        });
        
        if (!scheduleInfoResult.ok) {
            const errorMsg = scheduleInfoResult.ok === false ? scheduleInfoResult.error.message : 'Invalid ScheduleInfo';
            throw new Error(`Failed to create ScheduleInfo: ${errorMsg}`);
        }
        
        const cardResult = Card.create({
            id: cardIdResult.value,
            xiuyuanId: xiuyuanIdResult.value,
            faceIndex: 0,
            scheduleInfo: scheduleInfoResult.value,
            createdAt: new Date(now),
            updatedAt: new Date(now)
        });
        
        if (!cardResult.ok) {
            const errorMsg = cardResult.ok === false ? cardResult.error.message : 'Invalid Card';
            throw new Error(`Failed to create Card: ${errorMsg}`);
        }
        
        // ✅ 将 Card 添加到 Xiuyuan（使用新的 addCard 方法）
        const addResult = xiuyuanEntity.addCard(cardResult.value);
        if (!addResult.ok) {
            const errorMsg = addResult.ok === false ? addResult.error.message : 'Failed to add card';
            throw new Error(`Failed to add Card to Xiuyuan: ${errorMsg}`);
        }
        
        // ✅ 返回完整的 Xiuyuan 实体（包含 Card）
        return { xiuyuanEntity };
    }
    
    /**
     * 报告同步进度
     */
    private reportProgress(
        onProgress: ProgressCallback | undefined,
        type: SyncType,
        phase: SyncPhase,
        current: number,
        total: number,
        message?: string
    ): void {
        const progress: SyncProgress = {
            current,
            total,
            phase,
            message,
            percentage: Math.round((current / total) * 100)
        };
        
        // 调用回调函数
        if (onProgress) {
            onProgress(progress);
        }
        
        // 发布进度事件
        this.publishEvent('syncProgress', {
            type,
            progress,
            timestamp: Date.now()
        });
    }
    
    /**
     * 重试包装器
     * 
     * 自动重试失败的同步操作（最多 3 次，指数退避）
     */
    private async withRetry<T>(
        type: SyncType,
        operation: () => Promise<T>
    ): Promise<T> {
        const { maxRetries, retryDelay, backoffMultiplier } = this.config.retry!;
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                const willRetry = attempt < maxRetries && this.shouldRetry(error as Error);
                
                // 发布错误事件
                this.publishEvent('syncError', {
                    type,
                    error: lastError,
                    timestamp: Date.now(),
                    willRetry,
                    retryCount: attempt + 1
                });
                
                if (!willRetry) {
                    break;
                }
                
                // 指数退避
                const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
                logger.info(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        
        // 所有重试都失败
        throw lastError;
    }
    
    /**
     * 判断是否应该重试
     */
    private shouldRetry(error: Error): boolean {
        // 网络错误、超时错误应该重试
        const message = error.message.toLowerCase();
        return (
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('fetch') ||
            message.includes('econnrefused')
        );
    }
    
    /**
     * 延迟辅助方法
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==================== 向后兼容 ====================

/**
 * @deprecated 使用 XiuyuanSyncService 代替
 * 
 * 为了向后兼容，保留旧名称作为类型别名。
 * 此别名将在下一个主版本中移除。
 */
export type HybridSyncService = XiuyuanSyncService;

/**
 * @deprecated 使用 XiuyuanSyncService 代替
 * 
 * 为了向后兼容，导出类的别名。
 * 此导出将在下一个主版本中移除。
 */
export const HybridSyncService = XiuyuanSyncService;
