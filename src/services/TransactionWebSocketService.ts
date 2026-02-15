/**
 * 统一的 Transaction WebSocket 服务
 * 
 * 职责：
 * - 管理单一的 WebSocket 连接
 * - 监听 transactions 事件
 * - 分发事件给注册的处理器
 * - 自动重连机制
 * 
 * 架构：
 * - 单一 WebSocket 连接
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
 */
export class TransactionWebSocketService {
    private plugin: FSRSPlugin; // 保留供未来扩展使用
    private ws: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private enabled: boolean = false;
    
    // 注册的处理器列表
    private handlers: ITransactionHandler[] = [];
    
    // 配置
    private readonly RECONNECT_DELAY = 3000; // 3秒
    
    /**
     * 获取 WebSocket URL
     * 动态从思源配置中获取,避免硬编码
     */
    private getWebSocketURL(): string {
        // 尝试从 window.siyuan 获取
        if (typeof window !== 'undefined' && (window as any).siyuan) {
            const siyuan = (window as any).siyuan;
            // 思源的 WebSocket 地址通常是 ws://127.0.0.1:6806/ws
            const host = siyuan.config?.system?.host || '127.0.0.1';
            const port = siyuan.config?.system?.httpPort || 6806;
            return `ws://${host}:${port}/ws`;
        }
        
        // 降级方案：使用 127.0.0.1 而不是 localhost
        return 'ws://127.0.0.1:6806/ws';
    }
    
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
            console.log('[TransactionWS] Handler registered:', handler.constructor.name);
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
            console.log('[TransactionWS] Handler unregistered:', handler.constructor.name);
        }
    }
    
    /**
     * 启动服务
     */
    public start(): void {
        if (this.ws) {
            console.log('[TransactionWS] Service already started');
            return;
        }
        
        console.log('[TransactionWS] Starting service...');
        this.enabled = true;
        this.connect();
    }
    
    /**
     * 停止服务
     */
    public stop(): void {
        console.log('[TransactionWS] Stopping service...');
        this.enabled = false;
        
        // 清理定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // 关闭 WebSocket
        if (this.ws) {
            this.ws.close(1000, 'Service stopped');
            this.ws = null;
        }
        
        console.log('[TransactionWS] Service stopped');
    }
    
    /**
     * 建立 WebSocket 连接
     */
    private connect(): void {
        try {
            const wsUrl = this.getWebSocketURL();
            console.log('[TransactionWS] Connecting to WebSocket:', wsUrl);
            
            // 创建 WebSocket 连接
            // 参数：app=siyuanmemo&type=main
            const url = `${wsUrl}?app=siyuanmemo&type=main`;
            this.ws = new WebSocket(url);
            
            // 连接成功
            this.ws.onopen = () => {
                console.log('[TransactionWS] ✅ WebSocket connected');
            };
            
            // 接收消息
            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };
            
            // 连接错误
            this.ws.onerror = (error) => {
                console.error('[TransactionWS] ❌ WebSocket error:', error);
            };
            
            // 连接关闭
            this.ws.onclose = (event) => {
                console.log('[TransactionWS] WebSocket closed:', event.code, event.reason);
                this.ws = null;
                
                // 非正常关闭，自动重连
                if (event.code !== 1000 && this.enabled) {
                    console.log('[TransactionWS] Connection closed abnormally, reconnecting...');
                    this.reconnect();
                }
            };
        } catch (error) {
            console.error('[TransactionWS] ❌ Failed to connect:', error);
            
            // 连接失败，自动重连
            if (this.enabled) {
                this.reconnect();
            }
        }
    }
    
    /**
     * 重新连接
     */
    private reconnect(): void {
        if (this.reconnectTimer) {
            return; // 已经在重连中
        }
        
        console.log(`[TransactionWS] Reconnecting in ${this.RECONNECT_DELAY}ms...`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            
            if (this.enabled) {
                this.connect();
            }
        }, this.RECONNECT_DELAY);
    }
    
    /**
     * 处理 WebSocket 消息
     */
    private handleMessage(event: MessageEvent): void {
        try {
            const message: WSMessage = JSON.parse(event.data);
            
            // 只处理 transactions 命令
            if (message.cmd !== 'transactions') {
                return;
            }
            
            this.handleTransactions(message.data);
        } catch (error) {
            console.error('[TransactionWS] ❌ Failed to parse message:', error);
        }
    }
    
    /**
     * 处理 transactions 事件并分发给所有处理器
     */
    private handleTransactions(data: Transaction[]): void {
        if (!data || !Array.isArray(data)) {
            return;
        }
        
        console.log('[TransactionWS] Transaction received, count:', data.length);
        
        // 分发给所有注册的处理器
        for (const handler of this.handlers) {
            try {
                handler.handle(data);
            } catch (error) {
                console.error('[TransactionWS] ❌ Handler error:', handler.constructor.name, error);
                // 继续处理其他处理器，不中断
            }
        }
    }
}
