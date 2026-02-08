/**
 * CytoscapeOrbitRenderer - 基于 Cytoscape.js 的 Orbit 轨道图谱渲染器
 * 
 * 使用 Cytoscape.js 实现精确的轨道布局，完全控制节点位置。
 * 
 * 特性：
 * - 精确的位置控制（preset 布局）
 * - 丰富的样式系统
 * - 优秀的性能
 * - 支持交互事件
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import cytoscape, { Core, NodeSingular, EdgeSingular } from 'cytoscape';
import type { GraphNode, GraphEdge } from '../types/graph';
import { ORBIT_NODE_STYLES, ORBIT_CANDIDATE_COLORS, ORBIT_EDGE_STYLES } from '../utils/OrbitStyles';

/**
 * Orbit 图谱数据接口
 */
export interface OrbitGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Map<string, { x: number; y: number }>;
}

/**
 * Cytoscape Orbit 渲染器
 */
export class CytoscapeOrbitRenderer {
    /** Cytoscape 实例 */
    private cy: Core | null = null;
    
    /** 容器元素 */
    private container: HTMLElement | null = null;
    
    /** 当前图谱数据 */
    private graphData: OrbitGraphData | null = null;

    /**
     * 渲染 Orbit 图谱
     * 
     * @param container 容器元素
     * @param graphData 图谱数据（包含节点、边和位置）
     * @param currentNodeId 当前节点 ID（可选）
     * Requirements: 1.1, 1.2, 1.3
     */
    public render(
        container: HTMLElement,
        graphData: OrbitGraphData,
        currentNodeId?: string
    ): void {
        if (!container || container.clientHeight === 0) {
            console.warn('[CytoscapeOrbitRenderer] Invalid container');
            return;
        }

        this.container = container;
        this.graphData = graphData;

        // 销毁旧实例
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }

        if (!graphData.nodes || graphData.nodes.length === 0) {
            console.warn('[CytoscapeOrbitRenderer] No nodes to render');
            return;
        }

        try {
            // 转换数据为 Cytoscape 格式
            const elements = this.convertToElements(graphData);

            // 创建 Cytoscape 实例
            this.cy = cytoscape({
                container,
                elements,
                style: this.getStylesheet(),
                layout: {
                    name: 'preset', // 使用预设位置，不自动布局
                },
                minZoom: 0.1,
                maxZoom: 3,
                wheelSensitivity: 0.2,
            });

            // 绑定事件
            this.bindEvents();

            // 聚焦到当前节点或适应所有节点
            if (currentNodeId) {
                setTimeout(() => this.focusNode(currentNodeId), 100);
            } else {
                this.cy.fit(50); // 50px padding
            }

            console.log('[CytoscapeOrbitRenderer] Rendered', graphData.nodes.length, 'nodes');
        } catch (error) {
            console.error('[CytoscapeOrbitRenderer] Render failed:', error);
        }
    }

    /**
     * 转换图谱数据为 Cytoscape 元素格式
     * 
     * @param graphData 图谱数据
     * @returns Cytoscape 元素数组
     * @private
     */
    private convertToElements(graphData: OrbitGraphData): any[] {
        const elements: any[] = [];

        // 转换节点
        for (const node of graphData.nodes) {
            const position = graphData.positions.get(node.id);
            
            elements.push({
                group: 'nodes',
                data: {
                    id: node.id,
                    label: node.label,
                    title: node.title,
                    nodeType: node.type, // 'history' | 'seed' | 'current' | 'missed' | 'candidate'
                    associationType: node.associationType,
                    isCurrent: node.isCurrent,
                },
                position: position || { x: 0, y: 0 },
                classes: [node.type], // 用于样式选择器
            });
        }

        // 转换边
        for (const edge of graphData.edges) {
            elements.push({
                group: 'edges',
                data: {
                    id: `${edge.from}-${edge.to}`,
                    source: edge.from,
                    target: edge.to,
                    edgeType: this.inferEdgeType(edge, graphData),
                },
            });
        }

        return elements;
    }

    /**
     * 推断边的类型（主路径/分支/候选）
     * 
     * @param edge 边数据
     * @param graphData 图谱数据
     * @returns 边类型
     * @private
     */
    private inferEdgeType(edge: GraphEdge, graphData: OrbitGraphData): string {
        const sourceNode = graphData.nodes.find(n => n.id === edge.from);
        const targetNode = graphData.nodes.find(n => n.id === edge.to);

        if (!sourceNode || !targetNode) return 'main';

        // 候选边：从当前节点到候选节点
        if (sourceNode.type === 'current' && targetNode.type === 'candidate') {
            return 'candidate';
        }

        // 分支边：从种子到遗落块
        if (sourceNode.type === 'seed' && targetNode.type === 'missed') {
            return 'branch';
        }

        // 主路径边：历史节点之间
        return 'main';
    }

    /**
     * 获取 Cytoscape 样式表
     * 
     * @returns 样式配置数组
     * @private
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3
     */
    private getStylesheet(): any[] {
        // 🔧 获取 CSS 变量的实际值（Cytoscape 不支持 CSS 变量）
        const rootStyle = getComputedStyle(document.body);
        const primaryColor = rootStyle.getPropertyValue('--b3-theme-primary').trim() || '#4A90E2';
        const primaryLightColor = rootStyle.getPropertyValue('--b3-theme-primary-light').trim() || '#6BA3E8';
        const hlPointColor = rootStyle.getPropertyValue('--b3-graph-hl-point').trim() || '#FF4444';
        const hlLineColor = rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2';
        const fontFamily = rootStyle.getPropertyValue('--b3-font-family').trim() || 'sans-serif';

        return [
            // 默认节点样式
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '12px',
                    'font-family': fontFamily,
                    'color': '#333',
                    'text-outline-width': 2,
                    'text-outline-color': '#fff',
                    'shape': 'ellipse',
                },
            },

            // 历史节点样式
            {
                selector: 'node.history',
                style: {
                    'background-color': primaryColor,
                    'border-width': ORBIT_NODE_STYLES.history.borderWidth,
                    'border-color': primaryLightColor,
                    'width': ORBIT_NODE_STYLES.history.size * 2,
                    'height': ORBIT_NODE_STYLES.history.size * 2,
                },
            },

            // 种子节点样式（绿色）
            {
                selector: 'node.seed',
                style: {
                    'background-color': ORBIT_NODE_STYLES.seed.color.background,
                    'border-width': ORBIT_NODE_STYLES.seed.borderWidth,
                    'border-color': ORBIT_NODE_STYLES.seed.color.border,
                    'width': ORBIT_NODE_STYLES.seed.size * 2,
                    'height': ORBIT_NODE_STYLES.seed.size * 2,
                },
            },

            // 当前节点样式（高亮）
            {
                selector: 'node.current',
                style: {
                    'background-color': hlPointColor,
                    'border-width': ORBIT_NODE_STYLES.current.borderWidth,
                    'border-color': hlPointColor,
                    'width': ORBIT_NODE_STYLES.current.size * 2,
                    'height': ORBIT_NODE_STYLES.current.size * 2,
                },
            },

            // 遗落块样式（灰色虚线）
            {
                selector: 'node.missed',
                style: {
                    'background-color': ORBIT_NODE_STYLES.missed.color.background,
                    'border-width': ORBIT_NODE_STYLES.missed.borderWidth,
                    'border-color': ORBIT_NODE_STYLES.missed.color.border,
                    'border-style': 'dashed',
                    'width': ORBIT_NODE_STYLES.missed.size * 2,
                    'height': ORBIT_NODE_STYLES.missed.size * 2,
                    'opacity': 0.6,
                },
            },

            // 候选节点样式（按关联类型着色）
            {
                selector: 'node.candidate',
                style: {
                    'background-color': (ele: any) => {
                        const type = ele.data('associationType');
                        return ORBIT_CANDIDATE_COLORS[type] || '#999';
                    },
                    'border-width': 2,
                    'border-color': (ele: any) => {
                        const type = ele.data('associationType');
                        return ORBIT_CANDIDATE_COLORS[type] || '#666';
                    },
                    'border-style': 'dashed',
                    'width': 32,
                    'height': 32,
                },
            },

            // 默认边样式
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                },
            },

            // 主路径边样式（实线箭头）
            {
                selector: 'edge[edgeType="main"]',
                style: {
                    'width': ORBIT_EDGE_STYLES.main.width,
                    'line-color': hlLineColor,
                    'target-arrow-color': hlLineColor,
                    'target-arrow-shape': 'triangle',
                },
            },

            // 分支边样式（虚线，无箭头）
            {
                selector: 'edge[edgeType="branch"]',
                style: {
                    'width': ORBIT_EDGE_STYLES.branch.width,
                    'line-color': ORBIT_EDGE_STYLES.branch.color.color,
                    'line-style': 'dashed',
                    'target-arrow-shape': 'none',
                    'opacity': 0.4,
                },
            },

            // 候选边样式（虚线箭头，按关联类型着色）
            {
                selector: 'edge[edgeType="candidate"]',
                style: {
                    'width': ORBIT_EDGE_STYLES.candidate.width,
                    'line-style': 'dashed',
                    'target-arrow-shape': 'triangle',
                    'line-color': (ele: any) => {
                        const target = ele.target();
                        const type = target.data('associationType');
                        return ORBIT_CANDIDATE_COLORS[type] || '#999';
                    },
                    'target-arrow-color': (ele: any) => {
                        const target = ele.target();
                        const type = target.data('associationType');
                        return ORBIT_CANDIDATE_COLORS[type] || '#999';
                    },
                },
            },

            // 悬停效果
            {
                selector: 'node:active',
                style: {
                    'overlay-color': '#4A90E2',
                    'overlay-padding': 6,
                    'overlay-opacity': 0.3,
                },
            },
        ];
    }

    /**
     * 绑定交互事件
     * 
     * @private
     */
    private bindEvents(): void {
        if (!this.cy) return;

        // 节点点击事件
        this.cy.on('tap', 'node', (event) => {
            const node = event.target;
            const nodeId = node.id();
            const nodeType = node.data('nodeType');

            console.log('[CytoscapeOrbitRenderer] Node clicked:', nodeId, nodeType);

            // 触发自定义事件（由 GraphCanvas 监听）
            const customEvent = new CustomEvent('orbit-node-click', {
                detail: { nodeId, nodeType },
            });
            this.container?.dispatchEvent(customEvent);
        });

        // 节点右键事件
        this.cy.on('cxttap', 'node', (event) => {
            const node = event.target;
            const nodeId = node.id();
            const nodeType = node.data('nodeType');

            // 只对候选节点和遗落块显示右键菜单
            if (nodeType === 'candidate' || nodeType === 'missed') {
                const customEvent = new CustomEvent('orbit-node-contextmenu', {
                    detail: {
                        nodeId,
                        nodeType,
                        x: event.originalEvent.clientX,
                        y: event.originalEvent.clientY,
                    },
                });
                this.container?.dispatchEvent(customEvent);
            }
        });

        // 画布点击事件
        this.cy.on('tap', (event) => {
            if (event.target === this.cy) {
                const customEvent = new CustomEvent('orbit-canvas-click');
                this.container?.dispatchEvent(customEvent);
            }
        });
    }

    /**
     * 聚焦到指定节点
     * 
     * @param nodeId 节点 ID
     * @param scale 缩放级别（默认 1.5）
     * Requirements: 7.3
     */
    public focusNode(nodeId: string, scale: number = 1.5): void {
        if (!this.cy) return;

        const node = this.cy.getElementById(nodeId);
        if (node.length === 0) {
            console.warn('[CytoscapeOrbitRenderer] Node not found:', nodeId);
            return;
        }

        this.cy.animate({
            center: { eles: node },
            zoom: scale,
            duration: 500,
            easing: 'ease-in-out-cubic',
        });

        console.log('[CytoscapeOrbitRenderer] Focused on node:', nodeId);
    }

    /**
     * 显示全览（适应所有节点）
     * 
     * Requirements: 7.4
     */
    public showOverview(): void {
        if (!this.cy) return;

        this.cy.animate({
            fit: { padding: 50 },
            duration: 500,
            easing: 'ease-in-out-cubic',
        });

        console.log('[CytoscapeOrbitRenderer] Showing overview');
    }

    /**
     * 销毁渲染器
     */
    public destroy(): void {
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
        this.container = null;
        this.graphData = null;
    }

    /**
     * 获取 Cytoscape 实例
     * 
     * @returns Cytoscape 实例
     */
    public getInstance(): Core | null {
        return this.cy;
    }
}
