/**
 * 统一的 Transaction WebSocket 服务
 * 
 * 职责：
 * - 监听思源主 WebSocket 的 transactions 事件
 * - 分发事件给注册的处理器
 * 
 * 架构：
 * - 复用思源主 WebSocket 连接（不创建新连接）
 * - 支持多个 transaction 处理器（当前用于 AutoCard、文档树复习范围、native Riff 同步与 review source refresh）
 * - 每个处理器独立处理事件
 * 
 * @see .kiro/specs/quick-card-symbols/design.md
 */

import type FSRSPlugin from '@/index';
import { createLogger } from '@/utils/logger';
import {
    incrementRuntimePerformanceCounter,
    measureRuntimePerformance,
} from '@/utils/runtimePerformanceDiagnostics';
import { resolveWorkspaceDir } from './runtime';
import { parseTransactionsPayload, parseWSMessage, type Transaction } from './transaction-types';

const logger = createLogger('TransactionWebSocketService');

export type { DoOperation, Transaction } from './transaction-types';

/**
 * Transaction 处理器接口
 * 
 * 所有处理器必须实现此接口
 */
export interface ITransactionHandler {
    /**
     * 处理 transactions
     * @param transactions 事务列表
     */
    handle(transactions: Transaction[]): void;
}

/**
 * 统一的 Transaction WebSocket 服务
 * 
 * 🔧 重要变更：不再创建新的 WebSocket 连接，而是监听思源主 WebSocket
 * 原因：思源只向主 WebSocket 广播 transaction 事件
 */
export class TransactionWebSocketService {
    private readonly plugin: FSRSPlugin;
    private enabled: boolean = false;
    
    // 注册的处理器列表
    private handlers: ITransactionHandler[] = [];

    private subscribedToEventBus: boolean = false;
    
    // 🆕 WebSocket 健康检查
    private lastMessageTime: number = 0;
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private readonly HEALTH_CHECK_INTERVAL = 60000; // 60秒检查一次
    private readonly MESSAGE_TIMEOUT = 300000; // 5分钟没有消息认为连接异常
    
    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 注册处理器
     * @param handler 处理器实例
     */
    public registerHandler(handler: ITransactionHandler): void {
        if (!this.handlers.includes(handler)) {
            this.handlers.push(handler);
            logger.info('Handler registered:', handler.constructor.name);
        }
    }
    
    /**
     * 取消注册处理器
     * @param handler 处理器实例
     */
    public unregisterHandler(handler: ITransactionHandler): void {
        const index = this.handlers.indexOf(handler);
        if (index !== -1) {
            this.handlers.splice(index, 1);
            logger.info('Handler unregistered:', handler.constructor.name);
        }
    }
    
    /**
     * 启动服务
     */
    public start(): void {
        if (this.enabled) {
            logger.info('Service already started');
            return;
        }
        
        logger.info('Starting service...');
        if (!this.attachToWorkspaceEventBus()) {
            this.enabled = false;
            return;
        }

        this.enabled = true;
        this.startHealthCheck();
    }
    
    /**
     * 停止服务
     */
    public stop(): void {
        logger.info('Stopping service...');
        this.enabled = false;
        
        // 停止健康检查
        this.stopHealthCheck();
        
        this.detachFromWorkspaceEventBus();
        
        logger.info('Service stopped');
    }
    
    /**
     * 附加到宿主 ws-main 事件流
     */
    private attachToWorkspaceEventBus(): boolean {
        const eventBus = this.plugin?.eventBus as {
            on?: (event: string, listener: (payload: unknown) => void) => void;
        } | undefined;

        if (!eventBus?.on) {
            logger.error(
                '[TransactionWebSocketService] Unable to subscribe to ws-main: plugin.eventBus.on is unavailable. ' +
                'Transaction handlers will remain disabled.'
            );
            return false;
        }

        eventBus.on('ws-main', this.handleWorkspaceMessage);
        this.subscribedToEventBus = true;
        logger.info('Subscribed to ws-main event bus stream');
        return true;
    }
    
    /**
     * 从宿主 ws-main 事件流分离
     */
    private detachFromWorkspaceEventBus(): void {
        if (!this.subscribedToEventBus) {
            return;
        }

        const eventBus = this.plugin?.eventBus as {
            off?: (event: string, listener: (payload: unknown) => void) => void;
        } | undefined;

        if (eventBus?.off) {
            eventBus.off('ws-main', this.handleWorkspaceMessage);
        }
        this.subscribedToEventBus = false;
        logger.info('Detached from ws-main event bus stream');
    }
    
    /**
     * 处理宿主事件总线中的 ws-main 消息
     */
    private readonly handleWorkspaceMessage = (event: unknown): void => {
        measureRuntimePerformance('daily-editing', 'ws-main.message', () => {
            try {
            // 🆕 更新最后消息时间
            this.lastMessageTime = Date.now();
            incrementRuntimePerformanceCounter('daily-editing', 'ws-main-events');

            const detail = this.extractWorkspaceEventDetail(event);
            if (!detail) {
                return;
            }

            const message = this.parseWorkspaceMessage(detail);
            if (!message) {
                return;
            }
            
            // 只处理 transactions 命令
            if (message.cmd !== 'transactions') {
                return;
            }
            
            incrementRuntimePerformanceCounter('daily-editing', 'transaction-messages');
            this.handleTransactions(parseTransactionsPayload(message.data));
            } catch (error) {
                logger.error('Failed to parse message:', error);
            }
        }, { handlerCount: this.handlers.length });
    };

    private extractWorkspaceEventDetail(event: unknown): { cmd?: unknown; data?: unknown } | null {
        if (!event || typeof event !== 'object') {
            return null;
        }

        const candidate = event as {
            detail?: unknown;
            cmd?: unknown;
            data?: unknown;
        };

        if (candidate.detail && typeof candidate.detail === 'object') {
            return candidate.detail as { cmd?: unknown; data?: unknown };
        }

        return candidate;
    }

    private parseWorkspaceMessage(detail: { cmd?: unknown; data?: unknown }): { cmd: string; data?: unknown } | null {
        if (typeof detail.cmd === 'string') {
            return {
                cmd: detail.cmd,
                data: detail.data,
            };
        }

        if (typeof detail.data === 'string') {
            return parseWSMessage(detail.data);
        }

        return null;
    }
    
    /**
     * 处理 transactions 事件并分发给所有处理器
     */
    private handleTransactions(data: Transaction[]): void {
        if (data.length === 0) {
            return;
        }
        
        logger.info('Transaction received, count:', data.length);
        incrementRuntimePerformanceCounter('daily-editing', 'transactions', data.length);
        
        // 分发给所有注册的处理器
        measureRuntimePerformance('daily-editing', 'transactions.dispatch', () => {
            for (const handler of this.handlers) {
                try {
                    measureRuntimePerformance(
                        'daily-editing',
                        'transactions.handler',
                        () => handler.handle(data),
                        {
                            handlerName: handler.constructor.name,
                            transactionCount: data.length,
                        },
                    );
                } catch (error) {
                    logger.error('Handler error:', handler.constructor.name, error);
                    // 继续处理其他处理器，不中断
                }
            }
        }, {
            handlerCount: this.handlers.length,
            transactionCount: data.length,
        });
    }
    
    /**
     * 启动健康检查
     * 
     * 定期检查 WebSocket 是否接收到消息
     * 如果长时间没有消息，可能是"静默连接"问题
     */
    private startHealthCheck(): void {
        // 清除旧的定时器
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        
        // 初始化最后消息时间
        this.lastMessageTime = Date.now();
        
        // 启动定期检查
        this.healthCheckTimer = setInterval(() => {
            const now = Date.now();
            const timeSinceLastMessage = now - this.lastMessageTime;
            
            if (timeSinceLastMessage > this.MESSAGE_TIMEOUT) {
                const workspaceDir = resolveWorkspaceDir();
                
                logger.warn(
                    `[SiYuanMemo][TransactionWS] ⚠️ 健康检查警告：\n` +
                    `  工作空间: ${workspaceDir}\n` +
                    `  ${Math.floor(timeSinceLastMessage / 1000)}秒内没有收到任何消息\n` +
                    `  事件源: ws-main eventBus\n` +
                    `  这可能是"静默连接"问题，建议：\n` +
                    `  1. 切换到其他工作空间测试\n` +
                    `  2. 使用手动同步功能\n` +
                    `  3. 重启思源笔记`
                );
                
                // 重置计时器，避免重复警告
                this.lastMessageTime = now;
            }
        }, this.HEALTH_CHECK_INTERVAL);
        
        logger.info('健康检查已启动');
    }
    
    /**
     * 停止健康检查
     */
    private stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
            logger.info('健康检查已停止');
        }
    }
}
