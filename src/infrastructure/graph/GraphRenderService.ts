/**
 * GraphRenderService - vis-network 渲染管理服务
 * 
 * 负责 vis-network 的初始化、数据更新、节点聚焦等渲染操作。
 * 复用思源笔记的 vis-network 配置，保持视觉一致性。
 * 
 * Requirements: 7.6, 12.1, 1.1, 2.1, 3.1, 3.5
 */

import type { GraphNode, GraphEdge } from '@/application/graph/types';
import type { FocusOptions, VisNetworkOptions } from './types';

/**
 * vis-network 类型定义（简化版）
 * 实际类型由 window.vis 提供
 */
interface Network {
    setData(data: { nodes: any; edges: any }): void;
    focus(nodeId: string, options?: any): void;
    fit(options?: any): void;
    destroy(): void;
    on(event: string, callback: Function): void;
    off(event: string, callback?: Function): void;
}

/**
 * 图谱渲染服务类
 */
export class GraphRenderService {
    /** vis-network 实例 */
    private network: Network | null = null;
    
    /** 容器元素（保留用于未来扩展） */
    private container: HTMLElement | null = null;
    
    /** 当前配置 */
    private options: VisNetworkOptions | null = null;
    
    /**
     * 初始化 vis-network
     * 
     * @param container 容器 DOM 元素
     * @param options vis-network 配置选项（可选）
     * @param historyPathLength 历史路径长度（用于动态参数计算）
     * Requirements: 7.6, 12.1, 12.2, 12.3
     */
    initialize(container: HTMLElement, options?: VisNetworkOptions, historyPathLength?: number): void {
        try {
            // 检查 vis-network 是否已加载
            const vis = (window as any).vis;
            if (typeof vis === 'undefined') {
                console.error('[GraphRenderService] vis object not found on window');
                throw new Error('vis-network library not loaded');
            }
            
            if (typeof vis.Network === 'undefined') {
                console.error('[GraphRenderService] vis.Network not found');
                throw new Error('vis.Network not available');
            }
            
            if (typeof vis.DataSet === 'undefined') {
                console.error('[GraphRenderService] vis.DataSet not found');
                throw new Error('vis.DataSet not available');
            }
            
            this.container = container;
            
            // 合并配置：完全采用思源原生配置 + 用户配置
            this.options = this.mergeOptions(options, historyPathLength);
            
            // 创建 vis-network 实例
            const data = {
                nodes: new vis.DataSet([]),
                edges: new vis.DataSet([]),
            };
            
            this.network = new vis.Network(container, data, this.options);
            
            // 🆕 绑定思源原生的物理引擎控制事件
            this.bindPhysicsEvents();
            
            console.log('[GraphRenderService] vis-network initialized successfully with Siyuan native config');
        } catch (error) {
            console.error('[GraphRenderService] Failed to initialize vis-network:', error);
            console.error('[GraphRenderService] Available on window:', Object.keys(window).filter(k => k.includes('vis') || k.includes('graph')));
            throw error;
        }
    }
    
    /**
     * 绑定物理引擎控制事件（模仿思源原生行为）
     * 
     * @private
     */
    private bindPhysicsEvents(): void {
        if (!this.network) return;
        
        // 稳定化完成后停止物理模拟（节省性能）
        this.network.on('stabilizationIterationsDone', () => {
            console.log('[GraphRenderService] Stabilization done, stopping physics');
            this.network?.physics.stopSimulation();
        });
        
        // 拖拽结束后延迟停止物理模拟（让节点有时间重新稳定）
        this.network.on('dragEnd', () => {
            console.log('[GraphRenderService] Drag ended, will stop physics in 3s');
            setTimeout(() => {
                this.network?.physics.stopSimulation();
            }, 3000);
        });
        
        // 拖拽开始时启动物理模拟（让节点可以碰撞）
        this.network.on('dragStart', () => {
            console.log('[GraphRenderService] Drag started, starting physics');
            this.network?.physics.startSimulation();
        });
    }
    
    /**
     * 更新图谱数据
     * 
     * @param nodes 节点数组
     * @param edges 边数组
     * Requirements: 1.1, 2.1
     */
    updateData(nodes: GraphNode[], edges: GraphEdge[]): void {
        if (!this.network) {
            console.warn('[GraphRenderService] Network not initialized');
            return;
        }
        
        try {
            // 转换为 vis-network 格式
            const visNodes = nodes.map(node => this.convertToVisNode(node));
            const visEdges = edges.map(edge => this.convertToVisEdge(edge));
            
            // 更新数据
            const vis = (window as any).vis;
            const data = {
                nodes: new vis.DataSet(visNodes),
                edges: new vis.DataSet(visEdges),
            };
            
            this.network.setData(data);
            
            console.log(`[GraphRenderService] Updated graph with ${nodes.length} nodes and ${edges.length} edges`);
        } catch (error) {
            console.error('[GraphRenderService] Failed to update data:', error);
            throw error;
        }
    }
    
    /**
     * 聚焦到指定节点
     * 
     * @param nodeId 节点 ID
     * @param options 聚焦选项（可选）
     * Requirements: 3.1
     */
    focusNode(nodeId: string, options?: FocusOptions): void {
        if (!this.network) {
            console.warn('[GraphRenderService] Network not initialized');
            return;
        }
        
        try {
            const focusOptions = {
                scale: options?.scale || 1.5,
                animation: options?.animation || {
                    duration: 500,
                    easingFunction: 'easeInOutQuad',
                },
            };
            
            this.network.focus(nodeId, focusOptions);
            
            console.log(`[GraphRenderService] Focused on node: ${nodeId}`);
        } catch (error) {
            console.error('[GraphRenderService] Failed to focus node:', error);
        }
    }
    
    /**
     * 自适应缩放图谱
     * 
     * @param options 缩放选项（可选）
     * Requirements: 3.5
     */
    fit(options?: { animation?: boolean; nodes?: string[] }): void {
        if (!this.network) {
            console.warn('[GraphRenderService] Network not initialized');
            return;
        }
        
        try {
            // vis-network 的 fit() 方法接受一个配置对象
            // 如果指定了 nodes，需要传递 { nodes: [...] }
            // 否则传递 { animation: true/false } 或不传参数
            if (options?.nodes && options.nodes.length > 0) {
                this.network.fit({
                    nodes: options.nodes,
                    animation: options.animation !== false,
                });
            } else {
                this.network.fit({
                    animation: options?.animation !== false,
                });
            }
            
            console.log('[GraphRenderService] Graph fitted to view');
        } catch (error) {
            console.error('[GraphRenderService] Failed to fit graph:', error);
        }
    }
    
    /**
     * 绑定事件监听器
     * 
     * @param event 事件名称
     * @param callback 回调函数
     */
    on(event: string, callback: Function): void {
        if (!this.network) {
            console.warn('[GraphRenderService] Network not initialized');
            return;
        }
        
        this.network.on(event, callback);
    }
    
    /**
     * 解绑事件监听器
     * 
     * @param event 事件名称
     * @param callback 回调函数（可选）
     */
    off(event: string, callback?: Function): void {
        if (!this.network) {
            return;
        }
        
        this.network.off(event, callback);
    }
    
    /**
     * 销毁 vis-network 实例
     */
    destroy(): void {
        if (this.network) {
            try {
                this.network.destroy();
                this.network = null;
                this.container = null;
                this.options = null;
                
                console.log('[GraphRenderService] vis-network destroyed');
            } catch (error) {
                console.error('[GraphRenderService] Failed to destroy network:', error);
            }
        }
    }
    
    /**
     * 获取 vis-network 实例
     * 
     * @returns vis-network 实例
     */
    getNetwork(): Network | null {
        return this.network;
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 合并配置选项
     * 
     * 完全采用思源原生关系图的配置参数
     * 
     * @param userOptions 用户配置
     * @param historyPathLength 历史路径长度（用于动态参数计算）
     * @returns 合并后的配置
     * @private
     * Requirements: 12.2, 12.3
     */
    private mergeOptions(userOptions?: VisNetworkOptions, historyPathLength?: number): VisNetworkOptions {
        // 获取思源的 CSS 变量
        const rootStyle = getComputedStyle(document.body);
        
        // 动态计算物理引擎参数（参考思源源码）
        const nodeCount = historyPathLength || 10;
        const timestep = 32 < nodeCount ? 0.1 : 0.5;
        let maxVelocity = nodeCount;
        if (nodeCount > 1024) {
            maxVelocity = 1024;
        }
        if (nodeCount < 256) {
            maxVelocity = 256;
        }
        let minVelocity = nodeCount;
        if (nodeCount > 64) {
            minVelocity = 64;
        }
        if (nodeCount < 16) {
            minVelocity = 8;
        }
        
        // 获取思源配置（如果可用）
        const siyuanConfig = this.getSiyuanGraphConfig();
        
        // 完全采用思源原生配置
        const defaultOptions: VisNetworkOptions = {
            autoResize: true,
            interaction: {
                hover: true,
            },
            nodes: {
                borderWidth: 0,
                borderWidthSelected: 5,
                shape: 'dot', // 圆形节点
                font: {
                    face: rootStyle.getPropertyValue('--b3-font-family-graph').trim() || 'var(--b3-font-family)',
                    size: 32,
                    color: rootStyle.getPropertyValue('--b3-theme-on-background').trim() || '#000000',
                },
                color: {
                    hover: {
                        border: rootStyle.getPropertyValue('--b3-graph-hl-point').trim() || '#4A90E2',
                        background: rootStyle.getPropertyValue('--b3-graph-hl-point').trim() || '#4A90E2'
                    },
                    highlight: {
                        border: rootStyle.getPropertyValue('--b3-graph-hl-point').trim() || '#4A90E2',
                        background: rootStyle.getPropertyValue('--b3-graph-hl-point').trim() || '#4A90E2'
                    },
                }
            },
            edges: {
                width: siyuanConfig?.d3?.linkWidth || 1,
                arrowStrikethrough: false,
                smooth: false, // 直线连接
                color: {
                    opacity: siyuanConfig?.d3?.lineOpacity || 0.8,
                    hover: rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2',
                    highlight: rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2',
                }
            },
            layout: {
                randomSeed: 0,
                improvedLayout: false, // 思源使用 false
            },
            physics: {
                enabled: true,
                forceAtlas2Based: {
                    theta: 0.5,
                    gravitationalConstant: -(siyuanConfig?.d3?.collideRadius || 1000),
                    centralGravity: siyuanConfig?.d3?.centerStrength || 0.01,
                    springConstant: siyuanConfig?.d3?.collideStrength || 0.08,
                    springLength: siyuanConfig?.d3?.linkDistance || 150,
                    damping: 0.4,
                    avoidOverlap: 0.5
                },
                maxVelocity: maxVelocity,
                minVelocity: minVelocity,
                solver: 'forceAtlas2Based',
                stabilization: {
                    enabled: true,
                    iterations: 64,
                    updateInterval: 64,
                    onlyDynamicEdges: false,
                    fit: true
                },
                timestep: timestep,
                adaptiveTimestep: true,
                wind: {x: 0, y: 0}
            },
        };
        
        // 合并用户配置
        return this.deepMerge(defaultOptions, userOptions || {});
    }

    
    /**
     * 从思源获取图谱配置
     * 
     * @returns 思源图谱配置
     * @private
     */
    private getSiyuanGraphConfig(): any {
        try {
            const siyuan = (window as any).siyuan;
            if (siyuan && siyuan.config && siyuan.config.graph) {
                console.log('[GraphRenderService] Using Siyuan graph config');
                // 返回 local 配置（适用于局部关系图）
                return siyuan.config.graph.local || {};
            }
        } catch (error) {
            console.warn('[GraphRenderService] Failed to get Siyuan graph config:', error);
        }
        
        return {};
    }
    
    /**
     * 深度合并对象
     * 
     * @param target 目标对象
     * @param sources 源对象数组
     * @returns 合并后的对象
     * @private
     */
    private deepMerge(target: any, ...sources: any[]): any {
        if (!sources.length) return target;
        
        const source = sources.shift();
        
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        
        return this.deepMerge(target, ...sources);
    }
    
    /**
     * 检查是否为对象
     * 
     * @param item 要检查的项
     * @returns 是否为对象
     * @private
     */
    private isObject(item: any): boolean {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    /**
     * 转换为 vis-network 节点格式
     * 
     * @param node 图谱节点
     * @returns vis-network 节点
     * @private
     */
    private convertToVisNode(node: GraphNode): any {
        // 基础节点配置
        const visNode: any = {
            id: node.id,
            label: node.label,
            title: node.title, // 悬停提示
            size: node.size || 15,
            color: node.color,
            font: {
                size: 14,
                color: '#000000',
            },
        };
        
        // 当前节点使用更大的尺寸
        if (node.isCurrent) {
            visNode.size = 30;
            visNode.borderWidth = 3;
        }
        
        return visNode;
    }
    
    /**
     * 转换为 vis-network 边格式
     * 
     * @param edge 图谱边
     * @returns vis-network 边
     * @private
     */
    private convertToVisEdge(edge: GraphEdge): any {
        return {
            from: edge.from,
            to: edge.to,
            arrows: edge.arrows,
            color: edge.color,
            width: edge.width,
            label: edge.label,
        };
    }
}
