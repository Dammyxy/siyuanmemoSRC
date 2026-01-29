/**
 * 队列状态管理器
 *
 * 实现跨队列状态同步：
 * - 场景 A：同一 blockID 可存在于多个队列中
 * - 策略：事件驱动的状态同步
 * - 机制：通过事件总线广播状态变化
 */

/**
 * 队列状态事件
 */
export interface QueueStateChangeEvent {
    blockId: string;
    action: 'reviewed' | 'removed' | 'updated';
    data: {
        rating?: 1 | 2 | 3 | 4;
        cardType?: 'topic' | 'item';
        [key: string]: any;
    };
}

/**
 * 队列注册信息
 */
interface QueueRegistration {
    queueId: string;
    blockIds: Set<string>;
    onUpdate?: (event: QueueStateChangeEvent) => void | Promise<void>;
}

/**
 * 队列状态管理器
 *
 * 功能：
 * 1. 注册队列包含的 blockID
 * 2. 广播状态变化到所有包含该 blockID 的队列
 * 3. 通过事件总线通知其他组件
 *
 * @example
 * const stateManager = QueueStateManager.getInstance();
 * stateManager.registerQueue('retrieval-queue', blockIds);
 * stateManager.broadcastChange({
 *     blockId: 'abc-123',
 *     action: 'reviewed',
 *     data: { rating: 3 },
 * });
 */
export class QueueStateManager {
    private static instance: QueueStateManager;
    private readonly registry: Map<string, QueueRegistration> = new Map();

    private constructor() {
        // 私有构造函数，强制使用单例模式
    }

    /**
     * 获取单例实例
     */
    static getInstance(): QueueStateManager {
        if (!QueueStateManager.instance) {
            QueueStateManager.instance = new QueueStateManager();
        }
        return QueueStateManager.instance;
    }

    /**
     * 注册队列
     *
     * @param queueId 队列唯一标识
     * @param blockIds 队列包含的块 ID 列表
     * @param onUpdate 可选的状态更新回调
     */
    registerQueue(
        queueId: string,
        blockIds: string[],
        onUpdate?: (event: QueueStateChangeEvent) => void | Promise<void>
    ): void {
        const registration: QueueRegistration = {
            queueId,
            blockIds: new Set(blockIds),
            onUpdate,
        };

        this.registry.set(queueId, registration);

        console.log('[QueueStateManager] Registered queue:', {
            queueId,
            blockCount: blockIds.length,
        });
    }

    /**
     * 注销队列
     *
     * @param queueId 队列唯一标识
     */
    unregisterQueue(queueId: string): void {
        const deleted = this.registry.delete(queueId);

        if (deleted) {
            console.log('[QueueStateManager] Unregistered queue:', { queueId });
        }
    }

    /**
     * 更新队列的块列表
     *
     * @param queueId 队列唯一标识
     * @param blockIds 新的块 ID 列表
     */
    updateQueueBlocks(queueId: string, blockIds: string[]): void {
        const registration = this.registry.get(queueId);
        if (!registration) {
            console.warn('[QueueStateManager] Queue not found:', { queueId });
            return;
        }

        registration.blockIds = new Set(blockIds);

        console.log('[QueueStateManager] Updated queue blocks:', {
            queueId,
            blockCount: blockIds.length,
        });
    }

    /**
     * 广播状态变化
     *
     * 将状态变化通知到所有包含该 blockID 的队列
     *
     * @param event 状态变化事件
     */
    broadcastChange(event: QueueStateChangeEvent): void {
        const { blockId } = event;
        const affectedQueues: string[] = [];

        // 查找所有包含该 blockID 的队列
        for (const [queueId, registration] of this.registry) {
            if (registration.blockIds.has(blockId)) {
                affectedQueues.push(queueId);

                // 调用队列的更新回调
                if (registration.onUpdate) {
                    try {
                        registration.onUpdate(event);
                    } catch (err) {
                        console.error('[QueueStateManager] onUpdate callback failed:', {
                            queueId,
                            error: err,
                        });
                    }
                }
            }
        }

        console.log('[QueueStateManager] State change broadcasted:', {
            blockId,
            action: event.action,
            affectedQueues,
        });

        // TODO: 通过事件总线广播到其他组件
        // if (typeof window !== 'undefined' && window.siyuan) {
        //     window.siyuan.bus.emit('fsrs-queue-state-change', {
        //         ...event,
        //         affectedQueues,
        //     });
        // }
    }

    /**
     * 获取队列包含的所有块
     *
     * @param queueId 队列唯一标识
     * @returns 块 ID 列表
     */
    getQueueBlocks(queueId: string): string[] {
        const registration = this.registry.get(queueId);
        return registration ? Array.from(registration.blockIds) : [];
    }

    /**
     * 查找包含指定块的所有队列
     *
     * @param blockId 块 ID
     * @returns 队列 ID 列表
     */
    findQueuesWithBlock(blockId: string): string[] {
        const queues: string[] = [];

        for (const [queueId, registration] of this.registry) {
            if (registration.blockIds.has(blockId)) {
                queues.push(queueId);
            }
        }

        return queues;
    }

    /**
     * 获取所有已注册的队列
     *
     * @returns 队列 ID 列表
     */
    getAllQueues(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * 清空所有注册（用于测试）
     */
    clear(): void {
        this.registry.clear();
        console.log('[QueueStateManager] Registry cleared');
    }
}
