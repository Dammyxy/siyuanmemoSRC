/**
 * SiyuanGraphRenderer - 完全基于思源原生关系图的渲染器
 * 
 * 直接复制思源 Graph.ts 的 onGraph 方法逻辑，
 * 确保 100% 的手感一致性。
 * 
 * 源码参考：H:\project-F\flashcard\siyuan\app\src\layout\dock\Graph.ts
 */

import type { GraphNode, GraphEdge } from '../types/graph';

declare const vis: any;

export interface SiyuanGraphData {
    nodes: Array<{
        id: string;
        label: string;
        type: string;
        color?: any;
        size?: number;
        [key: string]: any;
    }>;
    links: Array<{
        from: string;
        to: string;
        ref?: boolean;
        color?: any;
        [key: string]: any;
    }>;
}

export class SiyuanGraphRenderer {
    private network: any = null;
    private container: HTMLElement | null = null;
    private graphData: SiyuanGraphData | null = null;

    /**
     * 初始化并渲染图谱
     * 
     * 完全复制思源的 onGraph 方法逻辑
     * 
     * @param container 容器元素
     * @param graphData 图谱数据
     * @param highlightNodeId 需要高亮的节点 ID（可选）
     * @param layoutHint 布局提示（可选）：{ historyNodes: string[], candidateNodes: string[], currentNode: string }
     */
    render(
        container: HTMLElement, 
        graphData: SiyuanGraphData, 
        highlightNodeId?: string,
        layoutHint?: { historyNodes: string[], candidateNodes: string[], currentNode: string }
    ): void {
        if (container.clientHeight === 0) {
            console.warn('[SiyuanGraphRenderer] Container height is 0, cannot render');
            return;
        }

        this.container = container;
        this.graphData = graphData;

        // 销毁旧实例
        this.network?.destroy();

        if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
            console.warn('[SiyuanGraphRenderer] No graph data to render');
            return;
        }

        // 🆕 应用布局提示：为节点设置初始位置
        if (layoutHint) {
            this.applyLayoutHint(graphData, layoutHint);
        }

        // 使用思源的颜色配置
        const rootStyle = getComputedStyle(document.body);
        
        // 为节点设置颜色（根据块类型）
        graphData.nodes.forEach(item => {
            switch (item.type) {
                case 'NodeDocument':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-doc-point').trim() };
                    break;
                case 'NodeParagraph':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-p-point').trim() };
                    break;
                case 'NodeHeading':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-heading-point').trim() };
                    break;
                case 'NodeMathBlock':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-math-point').trim() };
                    break;
                case 'NodeCodeBlock':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-code-point').trim() };
                    break;
                case 'NodeTable':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-table-point').trim() };
                    break;
                case 'NodeList':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-list-point').trim() };
                    break;
                case 'NodeListItem':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-listitem-point').trim() };
                    break;
                case 'NodeBlockquote':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-bq-point').trim() };
                    break;
                case 'NodeCallout':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-callout-point').trim() };
                    break;
                case 'NodeSuperBlock':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-super-point').trim() };
                    break;
                case 'tag':
                case 'textmark tag':
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-tag-point').trim() };
                    break;
                default:
                    item.color = { background: rootStyle.getPropertyValue('--b3-graph-p-point').trim() };
                    break;
            }
        });

        // 为连线设置颜色
        graphData.links.forEach(item => {
            if (item.ref) {
                item.color = { color: rootStyle.getPropertyValue('--b3-graph-ref-line').trim() };
            } else {
                item.color = { color: rootStyle.getPropertyValue('--b3-graph-line').trim() };
            }
        });

        // 获取思源配置（使用 local 配置）
        const siyuan = (window as any).siyuan;
        const config = siyuan?.config?.graph?.local || {
            d3: {
                nodeSize: 16,
                linkWidth: 1,
                lineOpacity: 0.8,
                collideRadius: 1000,
                centerStrength: 0.01,
                collideStrength: 0.08,
                linkDistance: 150,
            }
        };

        // 动态计算物理引擎参数（完全复制思源逻辑）
        const timestep = 32 < graphData.nodes.length ? 0.1 : 0.5;
        
        let maxVelocity = graphData.nodes.length;
        if (graphData.nodes.length > 1024) {
            maxVelocity = 1024;
        }
        if (graphData.nodes.length < 256) {
            maxVelocity = 256;
        }
        
        let minVelocity = graphData.nodes.length;
        if (graphData.nodes.length > 64) {
            minVelocity = 64;
        }
        if (graphData.nodes.length < 16) {
            minVelocity = 8;
        }

        // vis-network 配置（完全复制思源配置）
        const options = {
            autoResize: true,
            interaction: {
                hover: true,
            },
            nodes: {
                borderWidth: 0,
                borderWidthSelected: 5,
                shape: 'dot',
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
                width: config.d3.linkWidth,
                arrowStrikethrough: false,
                smooth: false,
                color: {
                    opacity: config.d3.lineOpacity,
                    hover: rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2',
                    highlight: rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2',
                }
            },
            layout: {
                randomSeed: 0,
                improvedLayout: false,
            },
            physics: {
                enabled: true,
                forceAtlas2Based: {
                    theta: 0.5,
                    gravitationalConstant: -config.d3.collideRadius,
                    centralGravity: config.d3.centerStrength,
                    springConstant: config.d3.collideStrength,
                    springLength: config.d3.linkDistance,
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
                wind: { x: 0, y: 0 }
            },
        };

        // 渐进式加载（完全复制思源逻辑）
        let i = Math.max(Math.ceil(graphData.nodes.length * 0.1), 128);
        let j = Math.max(Math.ceil(graphData.links.length * 0.1), 128);
        
        const nodes = new vis.DataSet(graphData.nodes.slice(0, i));
        const edges = new vis.DataSet(graphData.links.slice(0, j));
        
        const network = new vis.Network(container, { nodes, edges }, options);
        
        // 🆕 如果有布局提示，禁用初始缩放，让节点保持在设定位置
        if (!layoutHint) {
            // 初始缩放（完全复制思源逻辑）
            const initialScale = Math.max(0.03, 1 - 0.3 * Math.floor(graphData.nodes.length / 128));
            if (1 !== initialScale) {
                network.moveTo({
                    position: { x: 0, y: 0 },
                    scale: initialScale,
                    animation: false
                });
            }
        }

        // 批量添加剩余节点和边
        const time = 256;
        const intervalNodeTime = Math.max(Math.ceil(time / 8), 32);
        let batch = graphData.nodes.length / time / 2;
        if (batch < 64) {
            batch = 64;
        }
        if (batch > 256) {
            batch = 256;
        }

        const intervalNode = setInterval(() => {
            if (!network.images) {
                clearInterval(intervalNode);
                return;
            }
            const nodesAdded = graphData.nodes.slice(i, i + batch);
            if (nodesAdded.length === 0) {
                clearInterval(intervalNode);
                return;
            }
            network.body.data.nodes.add(nodesAdded);
            i += batch;
        }, intervalNodeTime);

        const intervalEdge = setInterval(() => {
            if (!network.images) {
                clearInterval(intervalEdge);
                return;
            }
            const edgesAdded = graphData.links.slice(j, j + batch);
            if (edgesAdded.length === 0) {
                clearInterval(intervalEdge);
                // 🆕 渐进加载完成后，聚焦到当前节点
                if (highlightNodeId) {
                    setTimeout(() => {
                        this.focusNode(highlightNodeId);
                    }, 500);
                } else {
                    network.fit({
                        animation: true
                    });
                }
                return;
            }
            network.body.data.edges.add(edgesAdded);
            j += batch;
        }, time);

        this.network = network;

        // 事件监听（完全复制思源逻辑）
        network.on('stabilizationIterationsDone', () => {
            network.physics.stopSimulation();
            // 🆕 稳定后聚焦到当前节点
            if (highlightNodeId) {
                this.focusNode(highlightNodeId);
            }
        });

        network.on('dragEnd', () => {
            setTimeout(() => {
                network.physics.stopSimulation();
            }, 3000);
        });

        console.log('[SiyuanGraphRenderer] Graph rendered with Siyuan native logic');
    }

    /**
     * 🆕 应用布局提示：为节点设置初始位置
     * 
     * 布局规则：
     * - 历史节点：在左侧（x < 0）
     * - 当前节点：在中心（x = 0, y = 0）
     * - 候选节点：在右侧（x > 0）
     * 
     * @param graphData 图谱数据
     * @param layoutHint 布局提示
     * @private
     */
    private applyLayoutHint(
        graphData: SiyuanGraphData,
        layoutHint: { historyNodes: string[], candidateNodes: string[], currentNode: string }
    ): void {
        const { historyNodes, candidateNodes, currentNode } = layoutHint;
        
        // 计算布局参数
        const horizontalSpacing = 300; // 水平间距
        const verticalSpacing = 200;   // 垂直间距
        
        graphData.nodes.forEach(node => {
            if (node.id === currentNode) {
                // 当前节点：中心位置
                node.x = 0;
                node.y = 0;
                node.fixed = { x: false, y: false }; // 允许物理引擎调整
            } else if (historyNodes.includes(node.id)) {
                // 历史节点：左侧
                const index = historyNodes.indexOf(node.id);
                node.x = -horizontalSpacing - (index * 100);
                node.y = (index - historyNodes.length / 2) * verticalSpacing;
                node.fixed = { x: false, y: false };
            } else if (candidateNodes.includes(node.id)) {
                // 候选节点：右侧
                const index = candidateNodes.indexOf(node.id);
                node.x = horizontalSpacing + (index * 100);
                node.y = (index - candidateNodes.length / 2) * verticalSpacing;
                node.fixed = { x: false, y: false };
            }
        });
        
        console.log('[SiyuanGraphRenderer] Applied layout hint:', {
            historyCount: historyNodes.length,
            candidateCount: candidateNodes.length,
            currentNode
        });
    }

    /**
     * 聚焦到指定节点
     * 
     * @param nodeId 节点 ID
     */
    focusNode(nodeId: string): void {
        if (!this.network || this.container?.clientHeight === 0) {
            return;
        }

        if (this.network.findNode(nodeId).length === 0) {
            console.warn(`[SiyuanGraphRenderer] Node ${nodeId} not found`);
            return;
        }

        this.network.focus(nodeId, {
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad',
            },
        });
        this.network.selectNodes([nodeId]);
    }

    /**
     * 绑定点击事件
     * 
     * @param callback 点击回调
     */
    onClick(callback: (nodeId: string | null) => void): void {
        if (!this.network) return;

        this.network.on('click', (params: any) => {
            if (params.nodes && params.nodes.length === 1) {
                callback(params.nodes[0]);
            } else {
                callback(null);
            }
        });
    }

    /**
     * 销毁图谱
     */
    destroy(): void {
        this.network?.destroy();
        this.network = null;
        this.container = null;
        this.graphData = null;
    }

    /**
     * 获取 network 实例
     */
    getNetwork(): any {
        return this.network;
    }

    // ============================================================================
    // Orbit 布局支持
    // ============================================================================

    /**
     * 🆕 使用 Orbit 布局渲染图谱
     * 
     * 接受预计算的节点位置，并应用到图谱渲染
     * 禁用物理引擎以保持轨道布局
     * 
     * @param container 容器元素
     * @param graphData 图谱数据
     * @param positions 节点位置映射（节点ID -> {x, y}）
     * @param currentNodeId 当前节点 ID（可选）
     * Requirements: 1.1, 1.2, 1.3
     */
    renderWithOrbitLayout(
        container: HTMLElement,
        graphData: SiyuanGraphData,
        positions: Map<string, { x: number; y: number }>,
        currentNodeId?: string
    ): void {
        if (container.clientHeight === 0) {
            console.warn('[SiyuanGraphRenderer] Container height is 0, cannot render');
            return;
        }

        this.container = container;
        this.graphData = graphData;

        // 销毁旧实例
        this.network?.destroy();

        if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
            console.warn('[SiyuanGraphRenderer] No graph data to render');
            return;
        }

        try {
            // 1. 应用预计算的位置到节点，并锁定位置
            graphData.nodes.forEach(node => {
                const pos = positions.get(node.id);
                if (pos) {
                    node.x = pos.x;
                    node.y = pos.y;
                    node.fixed = { x: true, y: true }; // 🔧 锁定位置，禁止物理引擎移动
                }
            });

            // 2. 应用节点颜色（复用思源配置）
            const rootStyle = getComputedStyle(document.body);
            graphData.nodes.forEach(item => {
                // 如果节点已有颜色配置（来自 OrbitStyles），则跳过
                if (item.color) return;

                // 否则使用思源默认颜色
                switch (item.type) {
                    case 'NodeDocument':
                        item.color = { background: rootStyle.getPropertyValue('--b3-graph-doc-point').trim() };
                        break;
                    case 'NodeParagraph':
                        item.color = { background: rootStyle.getPropertyValue('--b3-graph-p-point').trim() };
                        break;
                    default:
                        item.color = { background: rootStyle.getPropertyValue('--b3-graph-p-point').trim() };
                        break;
                }
            });

            // 3. 应用边颜色
            graphData.links.forEach(item => {
                if (!item.color) {
                    item.color = { color: rootStyle.getPropertyValue('--b3-graph-line').trim() };
                }
            });

            // 4. 创建 vis-network 配置（禁用物理引擎）
            const options = {
                autoResize: true,
                interaction: {
                    hover: true,
                },
                nodes: {
                    borderWidth: 0,
                    borderWidthSelected: 5,
                    shape: 'dot',
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
                    width: 2,
                    arrowStrikethrough: false,
                    smooth: false,
                    color: {
                        opacity: 0.8,
                        hover: rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2',
                        highlight: rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2',
                    }
                },
                layout: {
                    randomSeed: 0,
                    improvedLayout: false,
                },
                physics: {
                    enabled: false, // 🔧 禁用物理引擎，保持轨道布局
                },
            };

            // 5. 创建数据集
            const nodes = new vis.DataSet(graphData.nodes);
            const edges = new vis.DataSet(graphData.links);

            // 6. 创建网络
            const network = new vis.Network(container, { nodes, edges }, options);

            // 7. 聚焦到当前节点
            if (currentNodeId) {
                setTimeout(() => {
                    this.focusNode(currentNodeId);
                }, 300);
            } else {
                // 适应所有节点
                network.fit({
                    animation: {
                        duration: 500,
                        easingFunction: 'easeInOutQuad',
                    }
                });
            }

            this.network = network;

            console.log('[SiyuanGraphRenderer] Rendered with Orbit layout (physics disabled)');
        } catch (error) {
            console.error('[SiyuanGraphRenderer] Failed to render with Orbit layout:', error);
            // 降级：使用标准渲染
            this.render(container, graphData, currentNodeId);
        }
    }

    /**
     * 🆕 聚焦到当前节点（Orbit 专用）
     * 
     * @param scale 缩放级别（可选，默认 1.5）
     */
    focusCurrentNode(scale: number = 1.5): void {
        if (!this.network || !this.graphData) {
            return;
        }

        // 查找当前节点（type === 'current'）
        const currentNode = this.graphData.nodes.find(n => n.type === 'current');
        if (!currentNode) {
            console.warn('[SiyuanGraphRenderer] No current node found');
            return;
        }

        this.network.focus(currentNode.id, {
            scale,
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad',
            },
        });
        this.network.selectNodes([currentNode.id]);
    }

    /**
     * 🆕 显示全览（适应所有节点）
     */
    showOverview(): void {
        if (!this.network) {
            return;
        }

        this.network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad',
            },
        });
    }
}
