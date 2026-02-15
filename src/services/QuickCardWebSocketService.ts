/**
 * 快速制卡 WebSocket 服务
 * 
 * 职责：
 * - 直接连接思源 WebSocket（不通过 eventBus）
 * - 监听 transactions 事件
 * - 检测块内容变化
 * - 触发符号检测和卡片创建
 * - 自动重连机制
 * - 防抖处理
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
interface DoOperation {
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
interface TransactionDetail {
    cmd: string;
    data: {
        doOperations: DoOperation[];
        undoOperations: DoOperation[] | null;
    }[];
}

/**
 * 快速制卡配置
 */
export interface QuickCardSettings {
    /** 启用快速制卡 */
    enabled: boolean;
    
    /** 启用的符号类型 */
    enabledSymbols: {
        basic: boolean;        // >> << <>
        concept: boolean;      // ::
        descriptor: boolean;   // ;;
        cloze: boolean;        // {{}}
        multiLine: boolean;    // >>>
    };
    
    /** 防抖时间（毫秒） */
    debounceDelay: number;
    
    /** Descriptor 是否使用 Xiuyuan */
    descriptorUseXiuyuan: boolean;
}

/**
 * 快速制卡 WebSocket 服务
 */
export class QuickCardWebSocketService {
    private plugin: FSRSPlugin; // 将在 Phase 2 中使用（符号检测和卡片创建）
    private ws: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingBlocks: Set<string> = new Set();
    private processing: Set<string> = new Set();
    private enabled: boolean = false;
    
    // 配置
    private readonly WEBSOCKET_URL = 'ws://localhost:6806/ws';
    private readonly DEBOUNCE_DELAY = 300; // 300ms（可配置）
    private readonly RECONNECT_DELAY = 3000; // 3秒
    
    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 启动服务
     */
    public start(): void {
        if (this.ws) {
            console.log('[QuickCard] Service already started');
            return;
        }
        
        console.log('[QuickCard] Starting service...');
        this.enabled = true;
        this.connect();
    }
    
    /**
     * 停止服务
     */
    public stop(): void {
        console.log('[QuickCard] Stopping service...');
        this.enabled = false;
        
        // 清理定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        // 关闭 WebSocket
        if (this.ws) {
            this.ws.close(1000, 'Service stopped');
            this.ws = null;
        }
        
        // 清理队列
        this.pendingBlocks.clear();
        this.processing.clear();
        
        console.log('[QuickCard] Service stopped');
    }
    
    /**
     * 设置启用状态
     */
    public setEnabled(enabled: boolean): void {
        console.log('[QuickCard] Setting enabled:', enabled);
        
        if (enabled && !this.enabled) {
            this.start();
        } else if (!enabled && this.enabled) {
            this.stop();
        }
    }
    
    /**
     * 建立 WebSocket 连接
     */
    private connect(): void {
        try {
            console.log('[QuickCard] Connecting to WebSocket:', this.WEBSOCKET_URL);
            
            // 创建 WebSocket 连接
            // 参数：app=siyuanmemo&type=main
            const url = `${this.WEBSOCKET_URL}?app=siyuanmemo&type=main`;
            this.ws = new WebSocket(url);
            
            // 连接成功
            this.ws.onopen = () => {
                console.log('[QuickCard] ✅ WebSocket connected');
            };
            
            // 接收消息
            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };
            
            // 连接错误
            this.ws.onerror = (error) => {
                console.error('[QuickCard] ❌ WebSocket error:', error);
            };
            
            // 连接关闭
            this.ws.onclose = (event) => {
                console.log('[QuickCard] WebSocket closed:', event.code, event.reason);
                this.ws = null;
                
                // 非正常关闭，自动重连
                if (event.code !== 1000 && this.enabled) {
                    console.log('[QuickCard] Connection closed abnormally, reconnecting...');
                    this.reconnect();
                }
            };
        } catch (error) {
            console.error('[QuickCard] ❌ Failed to connect:', error);
            
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
        
        console.log(`[QuickCard] Reconnecting in ${this.RECONNECT_DELAY}ms...`);
        
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
            console.error('[QuickCard] ❌ Failed to parse message:', error);
        }
    }
    
    /**
     * 处理 transactions 事件
     */
    private handleTransactions(data: TransactionDetail['data']): void {
        if (!data || !Array.isArray(data)) {
            return;
        }
        
        console.log('[QuickCard] Transaction received:', data.length);
        
        // 提取所有 insert 和 update 操作的块 ID
        data.forEach(transaction => {
            if (!transaction.doOperations) {
                return;
            }
            
            transaction.doOperations.forEach(op => {
                // 只监听 insert 和 update 操作
                if (op.action === 'insert' || op.action === 'update') {
                    console.log('[QuickCard] Operation:', op.action, op.id);
                    this.queueBlockCheck(op.id);
                }
            });
        });
    }
    
    /**
     * 将块加入检测队列
     */
    private queueBlockCheck(blockId: string): void {
        this.pendingBlocks.add(blockId);
        
        // 防抖处理
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.processQueue();
        }, this.DEBOUNCE_DELAY);
    }
    
    /**
     * 处理队列
     */
    private async processQueue(): Promise<void> {
        const blocks = Array.from(this.pendingBlocks);
        console.log('[QuickCard] Processing queue, blocks:', blocks.length);
        
        this.pendingBlocks.clear();
        
        // 批量处理
        for (const blockId of blocks) {
            // 去重：避免重复处理
            if (this.processing.has(blockId)) {
                console.log(`[QuickCard] Block ${blockId} is already being processed, skipping`);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.processBlock(blockId);
            } catch (error) {
                console.error(`[QuickCard] ❌ Failed to process block ${blockId}:`, error);
            } finally {
                this.processing.delete(blockId);
            }
        }
    }
    
    /**
     * 处理单个块
     * 
     * TODO: 实现符号检测和卡片创建逻辑
     * - 获取块内容
     * - 检测符号类型
     * - 路由到对应的创建逻辑
     */
    private async processBlock(blockId: string): Promise<void> {
        console.log(`[QuickCard] Processing block: ${blockId}`);
        
        // TODO: Phase 2 - 实现符号检测和卡片创建
        // 1. 获取块内容（kramdown）
        // 2. 检测符号类型
        // 3. 检查是否已制卡
        // 4. 路由到对应的创建逻辑
        
        console.log(`[QuickCard] Block ${blockId} processed (placeholder)`);
    }
}
