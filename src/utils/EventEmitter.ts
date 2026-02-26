/**
 * 简单的事件发射器实现
 * 用于 HybridSyncService 的事件通知
 */

export type EventListener<T = unknown> = (data: T) => void;

export class EventEmitter<TEvents extends Record<string, unknown> = Record<string, unknown>> {
    private listeners: Map<keyof TEvents, Set<EventListener<unknown>>> = new Map();

    /**
     * 监听事件
     */
    on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener as EventListener<unknown>);
    }

    /**
     * 监听事件（一次性）
     */
    once<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
        const onceWrapper: EventListener<TEvents[K]> = (data) => {
            listener(data);
            this.off(event, onceWrapper);
        };
        this.on(event, onceWrapper);
    }

    /**
     * 取消监听
     */
    off<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.delete(listener as EventListener<unknown>);
            if (eventListeners.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    /**
     * 发射事件
     */
    emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(listener => {
                try {
                    (listener as EventListener<TEvents[K]>)(data);
                } catch (error) {
                    console.error(`[SiYuanMemo][EventEmitter] Error in listener for event "${String(event)}":`, error);
                }
            });
        }
    }

    /**
     * 移除所有监听器
     */
    removeAllListeners<K extends keyof TEvents>(event?: K): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * 获取事件的监听器数量
     */
    listenerCount<K extends keyof TEvents>(event: K): number {
        return this.listeners.get(event)?.size || 0;
    }
}
