/**
 * Unified Data Source Types Tests
 * 
 * 测试统一数据源架构的类型定义
 */

import { describe, it, expect } from 'vitest';
import {
    QueueType,
    DataChangeEvent,
    IDataSourceObserver,
    CardFilter,
    ReviewTabTransferState,
    IDataRouter,
    ContextMenuOption,
    IReviewQueue,
    FinalDrillEntry,
    ReviewButtonConfig,
    PersistedQueueData,
    SyncMetadata,
    CardChange,
    DataSourceError,
    ModeError,
    QueueError,
    QueueProjectionNotReadyError,
    SyncError,
    isDynamicQueueType,
    isStaticQueueType,
    isFormalReviewQueue,
    getAdvancedModeQueueTypes,
    getAdvancedModeContextMenuOptions,
} from '../unified-data-source';
import {
    QueueType as QueueTypeFromQueueCore,
    getAdvancedModeQueueTypes as getAdvancedModeQueueTypesFromQueueCore,
    isDynamicQueueType as isDynamicQueueTypeFromQueueCore,
} from '../unified-data-source/queue-core';
import {
    getAdvancedModeContextMenuOptions as getAdvancedModeContextMenuOptionsFromDataRouter,
} from '../unified-data-source/data-router';
import {
    QueueProjectionNotReadyError as QueueProjectionNotReadyErrorFromErrors,
} from '../unified-data-source/errors';
import type { CardFilter as CardFilterFromBrowserContracts, ReviewTabTransferState as ReviewTabTransferStateFromBrowserContracts } from '../unified-data-source/browser-contracts';

describe('Unified Data Source Types', () => {
    describe('Enums', () => {
        it('should define QueueType enum', () => {
            expect(QueueType.RetrievalPractice).toBe('retrieval-practice');
            expect(QueueType.FinalDrill).toBe('final-drill');
            expect(QueueType.IncrementalLearning).toBe('incremental-learning');
            expect(QueueType.FilterGroup).toBe('filter-group');
            expect(QueueType.NeuralRoam).toBe('neural-roam');
        });
    });

    describe('Type Guards', () => {
        it('should correctly identify dynamic queue types', () => {
            expect(isDynamicQueueType(QueueType.RetrievalPractice)).toBe(true);
            expect(isDynamicQueueType(QueueType.IncrementalLearning)).toBe(true);
            expect(isDynamicQueueType(QueueType.FilterGroup)).toBe(true);
            expect(isDynamicQueueType(QueueType.FinalDrill)).toBe(false);
            expect(isDynamicQueueType(QueueType.NeuralRoam)).toBe(false);
        });

        it('should correctly identify static queue types', () => {
            expect(isStaticQueueType(QueueType.FinalDrill)).toBe(true);
            expect(isStaticQueueType(QueueType.NeuralRoam)).toBe(true);
            expect(isStaticQueueType(QueueType.RetrievalPractice)).toBe(false);
            expect(isStaticQueueType(QueueType.IncrementalLearning)).toBe(false);
            expect(isStaticQueueType(QueueType.FilterGroup)).toBe(false);
        });

        it('should correctly identify formal review queues', () => {
            expect(isFormalReviewQueue(QueueType.RetrievalPractice)).toBe(true);
            expect(isFormalReviewQueue(QueueType.IncrementalLearning)).toBe(true);
            expect(isFormalReviewQueue(QueueType.FilterGroup)).toBe(true);
            expect(isFormalReviewQueue(QueueType.NeuralRoam)).toBe(true);
            expect(isFormalReviewQueue(QueueType.FinalDrill)).toBe(false);
        });
    });

    describe('Mode-specific Functions', () => {
        it('should return correct queue types for advanced mode', () => {
            const queueTypes = getAdvancedModeQueueTypes();
            expect(queueTypes).toHaveLength(5);
            expect(queueTypes).toContain(QueueType.RetrievalPractice);
            expect(queueTypes).toContain(QueueType.FinalDrill);
            expect(queueTypes).toContain(QueueType.IncrementalLearning);
            expect(queueTypes).toContain(QueueType.FilterGroup);
            expect(queueTypes).toContain(QueueType.NeuralRoam);
        });

        it('should return correct context menu options for advanced mode', () => {
            const options = getAdvancedModeContextMenuOptions();
            expect(options).toHaveLength(6);
            expect(options.map(o => o.id)).toEqual([
                'open',
                'delete',
                'add-to-final-drill',
                'switch-scheduler',
                'modify-card-type',
                'set-priority',
            ]);
        });
    });

    describe('Error Classes', () => {
        it('should create DataSourceError with code', () => {
            const error = new DataSourceError('Test error', 'TEST_CODE');
            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.name).toBe('DataSourceError');
        });

        it('should create ModeError', () => {
            const error = new ModeError('Mode switch failed');
            expect(error.message).toBe('Mode switch failed');
            expect(error.code).toBe('MODE_ERROR');
            expect(error.name).toBe('DataSourceError');
        });

        it('should create QueueError', () => {
            const error = new QueueError('Queue operation failed');
            expect(error.message).toBe('Queue operation failed');
            expect(error.code).toBe('QUEUE_ERROR');
            expect(error.name).toBe('DataSourceError');
        });

        it('should create QueueProjectionNotReadyError', () => {
            const error = new QueueProjectionNotReadyError('Projection is refreshing');
            expect(error.message).toBe('Projection is refreshing');
            expect(error.code).toBe('QUEUE_PROJECTION_NOT_READY');
            expect(error.name).toBe('DataSourceError');
        });

        it('should create SyncError', () => {
            const error = new SyncError('Sync failed');
            expect(error.message).toBe('Sync failed');
            expect(error.code).toBe('SYNC_ERROR');
            expect(error.name).toBe('DataSourceError');
        });
    });

    describe('Interface Compatibility', () => {
        it('keeps the compatibility barrel aligned with split contract modules', () => {
            expect(QueueType).toBe(QueueTypeFromQueueCore);
            expect(isDynamicQueueType).toBe(isDynamicQueueTypeFromQueueCore);
            expect(getAdvancedModeQueueTypes).toBe(getAdvancedModeQueueTypesFromQueueCore);
            expect(getAdvancedModeContextMenuOptions).toBe(getAdvancedModeContextMenuOptionsFromDataRouter);
            expect(QueueProjectionNotReadyError).toBe(QueueProjectionNotReadyErrorFromErrors);

            const filterFromNarrowModule: CardFilterFromBrowserContracts = {
                cardType: 'item',
                scopeDocIds: ['doc-1'],
            };
            const filterFromBarrel: CardFilter = filterFromNarrowModule;
            expect(filterFromBarrel.scopeDocIds).toEqual(['doc-1']);

            const transferFromNarrowModule: ReviewTabTransferStateFromBrowserContracts = {
                kind: 'static-subset-session',
                queueType: QueueTypeFromQueueCore.FinalDrill,
                blockIds: ['block-1'],
            };
            const transferFromBarrel: ReviewTabTransferState = transferFromNarrowModule;
            expect(transferFromBarrel.kind).toBe('static-subset-session');
        });

        it('should allow creating DataChangeEvent', () => {
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['card-1', 'card-2'],
                timestamp: Date.now(),
            };
            expect(event.type).toBe('card-updated');
            expect(event.cardIds).toHaveLength(2);
        });

        it('should allow creating FinalDrillEntry', () => {
            const entry: FinalDrillEntry = {
                cardId: 'card-1',
                source: 'manual',
                timestamp: Date.now(),
            };
            expect(entry.source).toBe('manual');
        });

        it('should allow creating ReviewButtonConfig for rating', () => {
            const button: ReviewButtonConfig = {
                type: 'rating',
                label: '3',
                value: 3,
            };
            expect(button.type).toBe('rating');
            expect(button.value).toBe(3);
        });

        it('should allow creating ReviewButtonConfig for action', () => {
            const button: ReviewButtonConfig = {
                type: 'action',
                label: '插入',
                action: 'insert',
            };
            expect(button.type).toBe('action');
            expect(button.action).toBe('insert');
        });

        it('should allow creating CardFilter', () => {
            const filter: CardFilter = {
                cardType: 'item',
                scopeDocIds: ['doc-1'],
                dueDate: {
                    lte: new Date(),
                },
                tags: ['tag1', 'tag2'],
                priority: {
                    min: 0,
                    max: 50,
                },
            };
            expect(filter.cardType).toBe('item');
            expect(filter.scopeDocIds).toEqual(['doc-1']);
            expect(filter.tags).toHaveLength(2);
        });

        it('should allow creating ContextMenuOption', () => {
            const option: ContextMenuOption = {
                id: 'open',
                label: '打开',
                icon: 'icon-open',
                enabled: true,
            };
            expect(option.id).toBe('open');
            expect(option.enabled).toBe(true);
        });
    });

    describe('Observer Pattern', () => {
        it('should allow implementing IDataSourceObserver', () => {
            class TestObserver implements IDataSourceObserver {
                lastEvent: DataChangeEvent | null = null;

                onDataChanged(event: DataChangeEvent): void {
                    this.lastEvent = event;
                }
            }

            const observer = new TestObserver();
            const event: DataChangeEvent = {
                type: 'card-created',
                cardIds: ['card-1'],
                timestamp: Date.now(),
            };

            observer.onDataChanged(event);
            expect(observer.lastEvent).toBe(event);
        });
    });
});
