/**
 * CytoscapeOrbitRenderer - 鍩轰簬 Cytoscape.js 鐨?Orbit 杞ㄩ亾鍥捐氨娓叉煋鍣?
 * 
 * 浣跨敤 Cytoscape.js 瀹炵幇绮剧‘鐨勮建閬撳竷灞€锛屽畬鍏ㄦ帶鍒惰妭鐐逛綅缃€?
 * 
 * 鐗规€э細
 * - 绮剧‘鐨勪綅缃帶鍒讹紙preset 甯冨眬锛?
 * - 涓板瘜鐨勬牱寮忕郴缁?
 * - 浼樼鐨勬€ц兘
 * - 鏀寔浜や簰浜嬩欢
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import cytoscape, { Core } from 'cytoscape';
import type { GraphNode, GraphEdge } from '../types/graph';
import { ORBIT_NODE_STYLES, ORBIT_CANDIDATE_COLORS, ORBIT_EDGE_STYLES } from '../utils/OrbitStyles';

/**
 * Orbit 鍥捐氨鏁版嵁鎺ュ彛
 */
export interface OrbitGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Map<string, { x: number; y: number }>;
}

/**
 * Cytoscape Orbit 娓叉煋鍣?
 */
export class CytoscapeOrbitRenderer {
    /** Cytoscape 瀹炰緥 */
    private cy: Core | null = null;

    /** 瀹瑰櫒鍏冪礌 */
    private container: HTMLElement | null = null;

    /** 褰撳墠鍥捐氨鏁版嵁 */
    private graphData: OrbitGraphData | null = null;

    /** Whether initial fit has been applied */
    private hasRendered = false;

    /** Incrementing token to cancel stale progressive renders */
    private renderVersion = 0;

    /**
     * 娓叉煋 Orbit 鍥捐氨
     * 
     * @param container 瀹瑰櫒鍏冪礌
     * @param graphData 鍥捐氨鏁版嵁锛堝寘鍚妭鐐广€佽竟鍜屼綅缃級
     * @param currentNodeId 褰撳墠鑺傜偣 ID锛堝彲閫夛級
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

        if (!graphData.nodes || graphData.nodes.length === 0) {
            console.warn('[CytoscapeOrbitRenderer] No nodes to render');
            return;
        }

        // Reuse existing instance when possible
        if (this.cy && this.container === container) {
            this.graphData = graphData;
            this.updateElements(graphData);
            return;
        }

        this.container = container;
        this.graphData = graphData;

        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
            this.hasRendered = false;
        }

        try {
            const elements = this.convertToElements(graphData);

            this.cy = cytoscape({
                container,
                elements: [],
                style: this.getStylesheet(),
                layout: {
                    name: 'preset',
                },
                minZoom: 0.1,
                maxZoom: 3,
                wheelSensitivity: 2,
            });

            this.bindEvents();

            this.addElementsGradually(elements, {
                fit: true,
                onDone: () => {
                    this.hasRendered = true;
                    console.log('[CytoscapeOrbitRenderer] Rendered', graphData.nodes.length, 'nodes');
                },
            });
        } catch (error) {
            console.error('[CytoscapeOrbitRenderer] Render failed:', error);
        }
    }

    private updateElements(graphData: OrbitGraphData): void {
        if (!this.cy) return;

        const elements = this.convertToElements(graphData);
        const zoom = this.cy.zoom();
        const pan = this.cy.pan();

        this.cy.batch(() => {
            this.cy.elements().remove();
        });
        this.cy.style(this.getStylesheet());

        this.addElementsGradually(elements, {
            zoom,
            pan,
            fit: !this.hasRendered,
            onDone: () => {
                if (!this.hasRendered) {
                    this.hasRendered = true;
                }
            },
        });
    }
    private convertToElements(graphData: OrbitGraphData): any[] {
        const elements: any[] = [];

        // 杞崲鑺傜偣
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
                classes: [node.type], // 鐢ㄤ簬鏍峰紡閫夋嫨鍣?
            });
        }

        // 杞崲杈?
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

        this.appendOrbitGuides(elements, graphData);
        return elements;
    }

    private addElementsGradually(
        elements: any[],
        options: { fit?: boolean; zoom?: number; pan?: { x: number; y: number }; onDone?: () => void } = {}
    ): void {
        if (!this.cy) return;

        const currentVersion = ++this.renderVersion;
        const nodes = elements.filter((el) => el.group === 'nodes');
        const edges = elements.filter((el) => el.group === 'edges');

        const addBatch = (items: any[], batchSize: number, done?: () => void) => {
            let index = 0;
            const step = () => {
                if (!this.cy || this.renderVersion !== currentVersion) return;

                const slice = items.slice(index, index + batchSize);
                if (slice.length > 0) {
                    this.cy.batch(() => {
                        this.cy?.add(slice);
                    });
                }

                index += batchSize;
                if (index < items.length) {
                    requestAnimationFrame(step);
                } else {
                    done?.();
                }
            };
            step();
        };

        addBatch(nodes, 120, () => {
            addBatch(edges, 160, () => {
                if (!this.cy || this.renderVersion !== currentVersion) return;
                if (typeof options.zoom === 'number' && options.pan) {
                    this.cy.zoom(options.zoom);
                    this.cy.pan(options.pan);
                }
                if (options.fit) {
                    this.cy.fit(undefined, 50);
                }
                options.onDone?.();
            });
        });
    }

    /**
     * Append orbit guide lines (main / missed / candidate) as dashed tracks.
     */
    private appendOrbitGuides(elements: any[], graphData: OrbitGraphData): void {
        const positions = graphData.positions;

        const addGuide = (idPrefix: string, nodeIds: string[]) => {
            if (nodeIds.length < 2) return;

            const coords = nodeIds
                .map((id) => positions.get(id))
                .filter((pos): pos is { x: number; y: number } => !!pos);
            if (coords.length < 2) return;

            const xs = coords.map((p) => p.x);
            const ys = coords.map((p) => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const avgY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
            const padding = 40;

            const leftId = `orbit-guide-${idPrefix}-left`;
            const rightId = `orbit-guide-${idPrefix}-right`;

            elements.push({
                group: 'nodes',
                data: { id: leftId },
                position: { x: minX - padding, y: avgY },
                classes: ['orbit-guide'],
            });
            elements.push({
                group: 'nodes',
                data: { id: rightId },
                position: { x: maxX + padding, y: avgY },
                classes: ['orbit-guide'],
            });
            elements.push({
                group: 'edges',
                data: {
                    id: `orbit-guide-${idPrefix}-edge`,
                    source: leftId,
                    target: rightId,
                    edgeType: 'orbit-guide',
                },
            });
        };

        const mainIds = graphData.nodes
            .filter((n) => n.type === 'history' || n.type === 'seed' || n.type === 'current')
            .map((n) => n.id);
        addGuide('main', mainIds);
    }

    /**
     * 鎺ㄦ柇杈圭殑绫诲瀷锛堜富璺緞/鍒嗘敮/鍊欓€夛級
     * 
     * @param edge 杈规暟鎹?
     * @param graphData 鍥捐氨鏁版嵁
     * @returns 杈圭被鍨?
     * @private
     */
    private inferEdgeType(edge: GraphEdge, graphData: OrbitGraphData): string {
        const sourceNode = graphData.nodes.find(n => n.id === edge.from);
        const targetNode = graphData.nodes.find(n => n.id === edge.to);

        if (!sourceNode || !targetNode) return 'main';

        // 鍊欓€夎竟锛氫粠褰撳墠鑺傜偣鍒板€欓€夎妭鐐?
        if (sourceNode.type === 'current' && targetNode.type === 'candidate') {
            return 'candidate';
        }

        // 鍒嗘敮杈癸細浠庣瀛愬埌閬楄惤鍧?
        if (sourceNode.type === 'seed' && targetNode.type === 'missed') {
            return 'branch';
        }

        // 涓昏矾寰勮竟锛氬巻鍙茶妭鐐逛箣闂?
        return 'main';
    }

    /**
     * 鑾峰彇 Cytoscape 鏍峰紡琛?
     * 
     * @returns 鏍峰紡閰嶇疆鏁扮粍
     * @private
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3
     */
    private getStylesheet(): any[] {
        // 馃敡 鑾峰彇 CSS 鍙橀噺鐨勫疄闄呭€硷紙Cytoscape 涓嶆敮鎸?CSS 鍙橀噺锛?
        const rootStyle = getComputedStyle(document.body);
        const primaryColor = rootStyle.getPropertyValue('--b3-theme-primary').trim() || '#4A90E2';
        const primaryLightColor = rootStyle.getPropertyValue('--b3-theme-primary-light').trim() || '#6BA3E8';
        const hlPointColor = rootStyle.getPropertyValue('--b3-graph-hl-point').trim() || '#FF4444';
        const hlLineColor = rootStyle.getPropertyValue('--b3-graph-hl-line').trim() || '#4A90E2';
        const fontFamily = rootStyle.getPropertyValue('--b3-font-family').trim() || 'sans-serif';
        const borderColor = rootStyle.getPropertyValue('--b3-border-color').trim() || '#d0d0d0';

        return [
            // 榛樿鑺傜偣鏍峰紡
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'bottom',
                    'text-halign': 'center',
                    'text-margin-y': 5,
                    'font-size': '11px',
                    'font-family': fontFamily,
                    'color': '#333',
                    'text-outline-width': 2,
                    'text-outline-color': '#fff',
                    'text-max-width': '80px',
                    'text-wrap': 'ellipsis',
                    'shape': 'ellipse',
                    'min-zoomed-font-size': 8,
                },
            },

            // 鍘嗗彶鑺傜偣鏍峰紡
            {
                selector: 'node.history',
                style: {
                    'background-color': primaryColor,
                    'border-width': ORBIT_NODE_STYLES.history.borderWidth,
                    'border-color': primaryLightColor,
                    'width': ORBIT_NODE_STYLES.history.size,
                    'height': ORBIT_NODE_STYLES.history.size,
                },
            },

            // 绉嶅瓙鑺傜偣鏍峰紡锛堢豢鑹诧級
            {
                selector: 'node.seed',
                style: {
                    'background-color': ORBIT_NODE_STYLES.seed.color.background,
                    'border-width': ORBIT_NODE_STYLES.seed.borderWidth,
                    'border-color': ORBIT_NODE_STYLES.seed.color.border,
                    'width': ORBIT_NODE_STYLES.seed.size,
                    'height': ORBIT_NODE_STYLES.seed.size,
                },
            },

            // 褰撳墠鑺傜偣鏍峰紡锛堥珮浜級
            {
                selector: 'node.current',
                style: {
                    'background-color': hlPointColor,
                    'border-width': ORBIT_NODE_STYLES.current.borderWidth,
                    'border-color': hlPointColor,
                    'width': ORBIT_NODE_STYLES.current.size,
                    'height': ORBIT_NODE_STYLES.current.size,
                },
            },

            // 閬楄惤鍧楁牱寮忥紙鐏拌壊铏氱嚎锛?
            {
                selector: 'node.missed',
                style: {
                    'background-color': ORBIT_NODE_STYLES.missed.color.background,
                    'border-width': ORBIT_NODE_STYLES.missed.borderWidth,
                    'border-color': ORBIT_NODE_STYLES.missed.color.border,
                    'border-style': 'dashed',
                    'width': ORBIT_NODE_STYLES.missed.size,
                    'height': ORBIT_NODE_STYLES.missed.size,
                    'opacity': 0.55,
                },
            },

            // 鍊欓€夎妭鐐规牱寮忥紙鎸夊叧鑱旂被鍨嬬潃鑹诧級
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
                    'width': 14,
                    'height': 14,
                    'opacity': 0.85,
                },
            },

            // 榛樿杈规牱寮?
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

            // 涓昏矾寰勮竟鏍峰紡锛堝疄绾跨澶达級
            {
                selector: 'edge[edgeType="main"]',
                style: {
                    'width': ORBIT_EDGE_STYLES.main.width,
                    'line-color': hlLineColor,
                    'target-arrow-color': hlLineColor,
                    'target-arrow-shape': 'triangle',
                },
            },

            // 鍒嗘敮杈规牱寮忥紙铏氱嚎锛屾棤绠ご锛?
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

            // 鍊欓€夎竟鏍峰紡锛堣櫄绾跨澶达紝鎸夊叧鑱旂被鍨嬬潃鑹诧級
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

            // 鎮仠鏁堟灉
            {
                selector: 'node:active',
                style: {
                    'overlay-color': '#4A90E2',
                    'overlay-padding': 6,
                    'overlay-opacity': 0.3,
                },
            },
            {
                selector: 'node.orbit-guide',
                style: {
                    'width': 1,
                    'height': 1,
                    'opacity': 0,
                    'label': '',
                },
            },
            {
                selector: 'edge[edgeType="orbit-guide"]',
                style: {
                    'width': 1,
                    'line-style': 'dashed',
                    'line-color': borderColor,
                    'target-arrow-shape': 'none',
                    'opacity': 0.35,
                },
            }];
    }

    /**
     * 缁戝畾浜や簰浜嬩欢
     * 
     * @private
     */
    private bindEvents(): void {
        if (!this.cy) return;

        // 鑺傜偣鐐瑰嚮浜嬩欢
        this.cy.on('tap', 'node', (event) => {
            const node = event.target;
            const nodeId = node.id();
            const nodeType = node.data('nodeType');

            console.log('[CytoscapeOrbitRenderer] Node clicked:', nodeId, nodeType);

            // 瑙﹀彂鑷畾涔変簨浠讹紙鐢?GraphCanvas 鐩戝惉锛?
            const customEvent = new CustomEvent('orbit-node-click', {
                detail: { nodeId, nodeType },
            });
            this.container?.dispatchEvent(customEvent);
        });

        // 鑺傜偣鍙抽敭浜嬩欢
        this.cy.on('cxttap', 'node', (event) => {
            const node = event.target;
            const nodeId = node.id();
            const nodeType = node.data('nodeType');

            // 鍙鍊欓€夎妭鐐瑰拰閬楄惤鍧楁樉绀哄彸閿彍鍗?
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

        // 鐢诲竷鐐瑰嚮浜嬩欢
        this.cy.on('tap', (event) => {
            if (event.target === this.cy) {
                const customEvent = new CustomEvent('orbit-canvas-click');
                this.container?.dispatchEvent(customEvent);
            }
        });
    }

    /**
     * 鑱氱劍鍒版寚瀹氳妭鐐?
     * 
     * @param nodeId 鑺傜偣 ID
     * @param scale 缂╂斁绾у埆锛堥粯璁?1.5锛?
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
     * 鏄剧ず鍏ㄨ锛堥€傚簲鎵€鏈夎妭鐐癸級
     * 
     * Requirements: 7.4
     */
    public showOverview(): void {
        if (!this.cy) return;

        this.cy.animate({
            fit: { eles: this.cy.elements(), padding: 50 },
            duration: 500,
            easing: 'ease-in-out-cubic',
        });

        console.log('[CytoscapeOrbitRenderer] Showing overview');
    }

    /**
     * 閿€姣佹覆鏌撳櫒
     */
    public destroy(): void {
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
            this.hasRendered = false;
        }
        this.container = null;
        this.graphData = null;
    }

    /**
     * 鑾峰彇 Cytoscape 瀹炰緥
     * 
     * @returns Cytoscape 瀹炰緥
     */
    public getInstance(): Core | null {
        return this.cy;
    }
}
