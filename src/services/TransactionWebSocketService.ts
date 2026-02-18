/**
 * 统一的 Transaction WebSocket 服务
 * 
 * 职责：
 * - 监听思源主 WebSocket 的 transactions 事件
 * - 分发事件给注册的处理器
 * 
 * 架构：
 * - 复用思源主 WebSocket 连接（不创建新连接）
 * - 支持多个处理器（RiffSyncHandler, AutoCardHandler）
 * - 每个处理器独立处理事件
 * 
 * @see .kiro/specs/quick-card-symbols/design.md
 */

import type FSRSPlugin from '@/index';

/**
 * WebSocket 消息结构
 */
interface WSMessage {
    cmd: string;
    data?: any;
}

/**
 * Transaction 操作
 */
export interface DoOperation {
    action: string;
    data: any;
    id: string;
    parentID?: string;
    previousID?: string;
    nextID?: string;
}

/**
 * Transaction 详情
 */
export interface Transaction {
    doOperations: DoOperation[];
    undoOperations: DoOperation[] | null;
}

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
    private plugin: FSRSPlugin;
    private enabled: boolean = false;
    
    // 注册的处理器列表
    private handlers: ITransactionHandler[] = [];
    
    // 保存原始的 onmessage 处理器
    private originalOnMessage: ((event: MessageEvent) => void) | null = null;
    
    // 🆕 WebSocket 健康检查
    private lastMessageTime: number = 0;
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private readonly HEALTH_CHECK_INTERVAL = 60000; // 60秒检查一次
    private readonly MESSAGE_TIMEOUT = 300000; // 5分钟没有消息认为连接异常
    
    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 获取思源主 WebSocket
     */
    private getMainWebSocket(): WebSocket | null {
        try {
            const siyuan = (window as any).siyuan;
            return siyuan?.ws?.ws || null;
        } catch (error) {
            console.error('[SiYuanMemo][TransactionWS] ❌ Failed to get main WebSocket:', error);
            return null;
        }
    }
    
    /**
     * 注册处理器
     * @param handler 处理器实例
     */
    public registerHandler(handler: ITransactionHandler): void {
        if (!this.handlers.includes(handler)) {
            this.handlers.push(handler);
            console.log('[SiYuanMemo][TransactionWS] Handler registered:', handler.constructor.name);
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
            console.log('[SiYuanMemo][TransactionWS] Handler unregistered:', handler.constructor.name);
        }
    }
    
    /**
     * 启动服务
     */
    public start(): void {
        if (this.enabled) {
            console.log('[SiYuanMemo][TransactionWS] Service already started');
            return;
        }
        
        console.log('[SiYuanMemo][TransactionWS] Starting service...');
        this.enabled = true;
        this.attachToMainWebSocket();
        this.startHealthCheck();
    }
    
    /**
     * 停止服务
     */
    public stop(): void {
        console.log('[SiYuanMemo][TransactionWS] Stopping service...');
        this.enabled = false;
        
        // 停止健康检查
        this.stopHealthCheck();
        
        // 恢复原始的 onmessage 处理器
        this.detachFromMainWebSocket();
        
        console.log('[SiYuanMemo][TransactionWS] Service stopped');
    }
    
    /**
     * 附加到思源主 WebSocket
     */
    private attachToMainWebSocket(): void {
        const ws = this.getMainWebSocket();
        
        if (!ws) {
            console.error('[SiYuanMemo][TransactionWS] ❌ Main WebSocket not found');
            return;
        }
        
        console.log('[SiYuanMemo][TransactionWS] ✅ Attaching to main WebSocket');
        console.log('[SiYuanMemo][TransactionWS]    URL:', ws.url);
        console.log('[SiYuanMemo][TransactionWS]    State:', ws.readyState, '(1=OPEN)');
        
        // 保存原始的 onmessage 处理器
        this.originalOnMessage = ws.onmessage;
        
        // 包装原始处理器
        ws.onmessage = (event: MessageEvent) => {
            // 先调用我们的处理器
            this.handleMessage(event);
            
            // 再调用原始处理器
            if (this.originalOnMessage) {
                this.originalOnMessage.call(ws, event);
            }
        };
        
        console.log('[SiYuanMemo][TransactionWS] ✅ Attached to main WebSocket');
    }
    
    /**
     * 从思源主 WebSocket 分离
     */
    private detachFromMainWebSocket(): void {
        const ws = this.getMainWebSocket();
        
        if (!ws) {
            return;
        }
        
        // 恢复原始的 onmessage 处理器
        if (this.originalOnMessage) {
            ws.onmessage = this.originalOnMessage;
            this.originalOnMessage = null;
        }
        
        console.log('[SiYuanMemo][TransactionWS] Detached from main WebSocket');
    }
    
    /**
     * 处理 WebSocket 消息
     */
    private handleMessage(event: MessageEvent): void {
        try {
            // 🆕 更新最后消息时间
            this.lastMessageTime = Date.now();
            
            const message: WSMessage = JSON.parse(event.data);
            
            // 只处理 transactions 命令
            if (message.cmd !== 'transactions') {
                return;
            }
            
            this.handleTransactions(message.data);
        } catch (error) {
            console.error('[SiYuanMemo][TransactionWS] ❌ Failed to parse message:', error);
        }
    }
    
    /**
     * 处理 transactions 事件并分发给所有处理器
     */
    private handleTransactions(data: Transaction[]): void {
        if (!data || !Array.isArray(data)) {
            return;
        }
        
        console.log('[SiYuanMemo][TransactionWS] Transaction received, count:', data.length);
        
        // 分发给所有注册的处理器
        for (const handler of this.handlers) {
            try {
                handler.handle(data);
            } catch (error) {
                console.error('[SiYuanMemo][TransactionWS] ❌ Handler error:', handler.constructor.name, error);
                // 继续处理其他处理器，不中断
            }
        }
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
                const workspaceDir = (window as any).siyuan?.config?.system?.workspaceDir || 'unknown';
                const ws = this.getMainWebSocket();
                
                console.warn(
                    `[SiYuanMemo][TransactionWS] ⚠️ 健康检查警告：\n` +
                    `  工作空间: ${workspaceDir}\n` +
                    `  ${Math.floor(timeSinceLastMessage / 1000)}秒内没有收到任何消息\n` +
                    `  WebSocket 状态: ${ws?.readyState || 'null'}\n` +
                    `  这可能是"静默连接"问题，建议：\n` +
                    `  1. 切换到其他工作空间测试\n` +
                    `  2. 使用手动同步功能\n` +
                    `  3. 重启思源笔记`
                );
                
                // 重置计时器，避免重复警告
                this.lastMessageTime = now;
            }
        }, this.HEALTH_CHECK_INTERVAL);
        
        console.log('[SiYuanMemo][TransactionWS] 健康检查已启动');
    }
    
    /**
     * 停止健康检查
     */
    private stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
            console.log('[SiYuanMemo][TransactionWS] 健康检查已停止');
        }
    }
}
