/**
 * GraphDataService - 图谱数据获取和转换服?
 * 
 * 负责?NeuralRoamQueue 获取历史路径和候选节点，
 * 并转换为图谱可视化所需的数据格式?
 * 
 * Requirements: 1.1, 2.1, 8.1
 */

import type { NeuralRoamQueue } from '@/queues/NeuralRoamQueue';
import type {
    GraphNode,
    GraphEdge,
    CandidateNode,
    NodeColor,
} from '@/application/graph/types';
import { AssociationType } from '@/core/queue/neural/types';
import { sql } from '@/core/siyuan/api';
import { ATTR_CARD_ID } from '@/core/siyuan/block';
import { calculateNodeSize } from './nodeCalculator';
import { QueryEngine } from '@/core/queue/neural/QueryEngine';
import { NeuralQueueStorage } from '@/core/queue/neural/NeuralQueueStorage';
import { OrbitLayoutEngine, Position } from './OrbitLayoutEngine';
import { getNodeStyle, getEdgeStyle } from './OrbitStyles';
import type { OrbitState, MissedBlock as OrbitMissedBlock, CandidateNode as OrbitCandidateNode, NavigationPathNode } from '@/core/queue/neural/types';

/**
 * 块数据接口（?SQL 查询返回?
 */
interface BlockData {
    id: string;
    content: string;
    type: string;
    root_id: string;
    parent_id: string;
    card_id?: string;
    has_flashcard?: number;
    ref_count?: number;  // 引用数（出链?
    def_count?: number;  // 被引用数（入链）
    [key: string]: any;
}

/**
 * 图谱数据服务?
 */
export class GraphDataService {
    /** 神经漫游队列实例 */
    private queue: NeuralRoamQueue;

    /** 节点数据缓存 */
    private nodeCache: Map<string, BlockData> = new Map();

    /** 缓存过期时间（毫秒） */
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟

    /** 缓存时间?*/
    private cacheTimestamps: Map<string, number> = new Map();

    /** 🆕 Orbit 布局引擎 */
    private orbitLayoutEngine: OrbitLayoutEngine = new OrbitLayoutEngine();

    constructor(queue: NeuralRoamQueue) {
        this.queue = queue;
    }

    /**
     * 获取图谱数据
     * 
     * @param selectedDirections 选中的漫游方?
     * @returns 图谱节点和边数据
     * Requirements: 1.1, 2.1
     */
    async getGraphData(
        selectedDirections: Set<AssociationType>
    ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
        try {
            // 1. 获取历史路径
            const historyPath = this.getHistoryPath();

            // 2. 获取当前节点
            const currentNode = this.getCurrentNode();

            // 3. 获取候选节点（基于选中的方向）
            const candidates = await this.getCandidateNodes(selectedDirections);

            // 4. 收集所有块数据（用于归一化节点大小）
            const allBlockData: Map<string, BlockData> = new Map();
            const addedNodeIds = new Set<string>();

            // 4.1 收集历史路径节点数据（应用过滤逻辑?
            for (const blockId of historyPath) {
                const blockData = await this.fetchBlockData(blockId);
                if (blockData) {
                    // 使用实际返回的块 ID（可能被替换为父列表项）
                    if (!allBlockData.has(blockData.id)) {
                        allBlockData.set(blockData.id, blockData);
                        addedNodeIds.add(blockData.id);
                    }
                }
            }

            // 4.2 收集候选节点数据（应用过滤逻辑 + 去重?
            for (const candidate of candidates) {
                const blockData = await this.fetchBlockData(candidate.id);
                if (blockData) {
                    // 使用实际返回的块 ID（可能被替换为父列表项）
                    if (!allBlockData.has(blockData.id)) {
                        allBlockData.set(blockData.id, blockData);
                        addedNodeIds.add(blockData.id);
                    }
                }
            }

            // 5. 计算最大引用数和被引用数（用于归一化）
            let maxRefs = 1;
            let maxDefs = 1;
            for (const blockData of allBlockData.values()) {
                maxRefs = Math.max(maxRefs, blockData.ref_count || 0);
                maxDefs = Math.max(maxDefs, blockData.def_count || 0);
            }

            // 6. 转换为图谱节点格?
            const nodes: GraphNode[] = [];
            const edges: GraphEdge[] = [];

            // 6.1 添加历史路径节点（使用实际的?ID?
            const actualHistoryPath: string[] = [];
            for (let i = 0; i < historyPath.length; i++) {
                const requestedBlockId = historyPath[i];

                // 查找实际的块数据（可能被替换为父列表项）
                let actualBlockData: BlockData | null = null;
                for (const [actualId, data] of allBlockData.entries()) {
                    // 检查是否是请求的块或其父列表项
                    if (actualId === requestedBlockId) {
                        actualBlockData = data;
                        break;
                    }
                }

                if (!actualBlockData) {
                    console.warn(`[GraphDataService] Block ${requestedBlockId} not found in allBlockData`);
                    continue;
                }

                const actualBlockId = actualBlockData.id;

                // 跳过重复节点
                if (actualHistoryPath.includes(actualBlockId)) {
                    console.log(`[GraphDataService] Skipping duplicate history node ${actualBlockId}`);
                    continue;
                }

                actualHistoryPath.push(actualBlockId);

                const refs = actualBlockData.ref_count || 0;
                const defs = actualBlockData.def_count || 0;

                nodes.push({
                    id: actualBlockId,
                    label: this.truncateLabel(actualBlockData.content),
                    title: this.buildNodeTitle(actualBlockData.content, refs, defs),
                    type: 'history',
                    isCurrent: actualBlockId === currentNode,
                    size: this.calculateNodeSize(actualBlockData, maxRefs, maxDefs),
                    color: this.getNodeColor('history', actualBlockId === currentNode),
                    icon: this.getNodeIcon(actualBlockData),
                });

                // 添加历史路径连线（使用实际的?ID?
                if (actualHistoryPath.length > 1) {
                    const prevBlockId = actualHistoryPath[actualHistoryPath.length - 2];
                    edges.push({
                        from: prevBlockId,
                        to: actualBlockId,
                        arrows: 'to',
                        color: { color: '#4A90E2' },
                        width: 2,
                    });
                }
            }

            // 6.2 添加候选节点（使用实际的块 ID + 去重?
            const addedCandidateIds = new Set<string>(actualHistoryPath);

            for (const candidate of candidates) {
                // 查找实际的块数据（可能被替换为父列表项）
                let actualBlockData: BlockData | null = null;
                for (const [actualId, data] of allBlockData.entries()) {
                    if (actualId === candidate.id) {
                        actualBlockData = data;
                        break;
                    }
                }

                if (!actualBlockData) {
                    continue;
                }

                const actualBlockId = actualBlockData.id;

                // 跳过已添加的节点（历史路?+ 已添加的候选节点）
                if (addedCandidateIds.has(actualBlockId)) {
                    console.log(`[GraphDataService] Skipping duplicate candidate node ${actualBlockId}`);
                    continue;
                }

                addedCandidateIds.add(actualBlockId);

                const refs = actualBlockData.ref_count || 0;
                const defs = actualBlockData.def_count || 0;

                nodes.push({
                    id: actualBlockId,
                    label: this.truncateLabel(actualBlockData.content),
                    title: this.buildNodeTitle(
                        actualBlockData.content,
                        refs,
                        defs,
                        this.getAssociationLabel(candidate.type)
                    ),
                    type: 'candidate',
                    associationType: candidate.type,
                    size: this.calculateNodeSize(actualBlockData, maxRefs, maxDefs),
                    color: this.getNodeColor('candidate'),
                    icon: this.getNodeIcon(actualBlockData),
                });
            }

            return { nodes, edges };
        } catch (error) {
            console.error('[GraphDataService] Failed to get graph data:', error);
            throw error;
        }
    }

    /**
     * 获取历史路径
     * 
     * @returns 历史路径中的?ID 数组
     * Requirements: 1.1
     */
    getHistoryPath(): string[] {
        return this.queue.getHistorySnapshot();
    }

    /**
     * Get candidate nodes for Orbit.
     */
    async getCandidateNodes(
        selectedDirections: Set<AssociationType>
    ): Promise<CandidateNode[]> {
        try {
            const currentNode = this.getCurrentNode();
            if (!currentNode) {
                console.log('[GraphDataService] No current node, returning empty candidates');
                return [];
            }

            // Prefer cached candidates for consistency with the queue.
            const cachedCandidates = this.queue.getCurrentCandidatesForSeed?.() || [];
            if (cachedCandidates.length > 0) {
                const filteredCached = cachedCandidates.filter(c =>
                    selectedDirections.has(c.associationType)
                );

                const candidates: CandidateNode[] = filteredCached.map(c => ({
                    id: c.id,
                    type: c.associationType,
                    weight: c.weight,
                    reason: c.reason || this.getAssociationLabel(c.associationType),
                }));

                console.log(
                    `[GraphDataService] Found ${candidates.length} cached candidates for directions:`,
                    Array.from(selectedDirections).map(d => this.getAssociationLabel(d)).join(', ')
                );

                return candidates;
            }

            // Fallback: query neighbors directly.
            const config = NeuralQueueStorage.loadConfig();
            const queryEngine = new QueryEngine(config);
            const neighbors = await queryEngine.fetchNeighbors(currentNode);

            const visited = new Set(this.queue.getHistorySnapshot?.() || []);
            const filteredNeighbors = neighbors.filter(neighbor =>
                selectedDirections.has(neighbor.type) && !visited.has(neighbor.id)
            );

            const candidates: CandidateNode[] = filteredNeighbors.map(neighbor => ({
                id: neighbor.id,
                type: neighbor.type,
                weight: 1.0,
                reason: this.getAssociationLabel(neighbor.type),
            }));

            console.log(`[GraphDataService] Found ${candidates.length} candidates for directions:`,
                Array.from(selectedDirections).map(d => this.getAssociationLabel(d)).join(', '));

            return candidates;
        } catch (error) {
            console.error('[GraphDataService] Failed to get candidate nodes:', error);
            return [];
        }
    }

    /**
     * Get current node id.
     */
    getCurrentNode(): string | null {
        const seed = this.queue.getCurrentSeed();
        if (seed) return seed;

        const history = this.queue.getHistorySnapshot?.() || [];
        return history.length ? history[history.length - 1] : null;
    }


    /**
     * Fetch block data from the database (cache + filtering).
     */
    private async fetchBlockData(blockId: string): Promise<BlockData | null> {
        try {
            // 检查缓?
            const cached = this.nodeCache.get(blockId);
            const cacheTime = this.cacheTimestamps.get(blockId);

            if (cached && cacheTime && (Date.now() - cacheTime < this.CACHE_TTL)) {
                return cached;
            }

            // 从数据库查询（应用神经漫游过滤逻辑?
            const stmt = `
                SELECT 
                    b.*,
                    a.value as card_id,
                    CASE 
                        WHEN a.value IS NOT NULL AND a.value != '' THEN 1
                        ELSE 0
                    END as has_flashcard,
                    (SELECT COUNT(*) FROM refs WHERE block_id = b.id) as ref_count,
                    (SELECT COUNT(*) FROM refs WHERE def_block_id = b.id) as def_count
                FROM blocks b
                LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
                WHERE (
                    -- 情况 1: 如果是列表项块，直接返回
                    (b.id = '${this.escapeSQL(blockId)}' AND b.type = 'i')
                    
                    OR
                    
                    -- 情况 2: 如果是段?标题块，检查是否在列表项中
                    (
                        b.id = '${this.escapeSQL(blockId)}' 
                        AND (b.type = 'p' OR b.type = 'h' OR b.type = 't')
                        AND b.parent_id NOT IN (
                            SELECT id FROM blocks WHERE type = 'i'
                        )
                    )
                    
                    OR
                    
                    -- 情况 3: 如果查询的是段落/标题块，但它在列表项中，返回其父列表?
                    (
                        b.type = 'i'
                        AND b.id IN (
                            SELECT parent_id FROM blocks 
                            WHERE id = '${this.escapeSQL(blockId)}' 
                            AND (type = 'p' OR type = 'h' OR type = 't')
                        )
                    )
                )
                AND b.type != 'l'  -- 永远不返回列表块
                LIMIT 1
            `;

            const rows = await sql(stmt);

            if (rows.length === 0) {
                console.log(`[GraphDataService] Block ${blockId} filtered out (likely a list block or invalid)`);
                return null;
            }

            const blockData = rows[0] as BlockData;

            // 如果返回的块 ID 与查询的不同，说明进行了替换（段??父列表项?
            if (blockData.id !== blockId) {
                console.log(`[GraphDataService] Replaced ${blockId} with parent list item ${blockData.id}`);
            }

            // 更新缓存
            this.nodeCache.set(blockId, blockData);
            this.cacheTimestamps.set(blockId, Date.now());

            return blockData;
        } catch (error) {
            console.error(`[GraphDataService] Failed to fetch block data for ${blockId}:`, error);
            return null;
        }
    }

    /**
     * 截断标签到指定长?
     * 
     * @param content 内容
     * @param maxLength 最大长度（默认20?
     * @returns 截断后的标签
     * @private
     * Requirements: 14.1
     */
    private truncateLabel(content: string, maxLength: number = 20): string {
        if (!content) return '';

        // 移除 Markdown 标记
        const plainText = content
            .replace(/[*_~`#]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();

        if (plainText.length <= maxLength) {
            return plainText;
        }

        return plainText.substring(0, maxLength) + '...';
    }

    /**
     * 获取节点颜色
     * 
     * @param type 节点类型
     * @param isCurrent 是否为当前节?
     * @returns 节点颜色配置
     * @private
     * Requirements: 7.1, 7.2, 7.3
     */
    private getNodeColor(type: 'history' | 'candidate', isCurrent: boolean = false): NodeColor {
        if (isCurrent) {
            // 当前节点：红?
            return {
                background: '#FF4444',
                border: '#CC0000',
                highlight: {
                    background: '#FF6666',
                    border: '#FF0000',
                },
            };
        }

        if (type === 'history') {
            // 历史节点：蓝色高?
            return {
                background: '#4A90E2',
                border: '#2E5C8A',
                highlight: {
                    background: '#6BA3E8',
                    border: '#4A90E2',
                },
            };
        }

        // 候选节点：灰色
        return {
            background: '#CCCCCC',
            border: '#999999',
            highlight: {
                background: '#DDDDDD',
                border: '#AAAAAA',
            },
        };
    }

    /**
     * 获取节点图标
     * 
     * @param blockData 块数?
     * @returns 图标名称
     * @private
     * Requirements: 14.3, 14.4
     */
    private getNodeIcon(blockData: BlockData): string | undefined {
        if (blockData.has_flashcard === 1) {
            return 'iconCard';
        }

        // 根据块类型返回图?
        switch (blockData.type) {
            case 'd':
                return 'iconDocument';
            case 'h':
                return 'iconHeading';
            case 'p':
                return 'iconParagraph';
            case 'l':
                return 'iconList';
            case 'i':
                return 'iconListItem';
            default:
                return undefined;
        }
    }

    /**
     * 计算节点大小（使用归一化算法）
     * 
     * 基于引用数和被引用数计算节点大小?
     * 使用归一?+ 强化对比度算法，模仿思源原生关系图?
     * 
     * @param blockData 块数?
     * @param maxRefs 最大引用数（用于归一化）
     * @param maxDefs 最大被引用数（用于归一化）
     * @returns 节点大小
     * @private
     * Requirements: 14.6, 14.7, 14.8
     */
    private calculateNodeSize(blockData: BlockData, maxRefs: number, maxDefs: number): number {
        const refs = blockData.ref_count || 0;
        const defs = blockData.def_count || 0;

        return calculateNodeSize(refs, defs, {}, maxRefs, maxDefs);
    }

    /**
     * 构建节点悬停提示文本
     * 
     * 格式：内?+ 引用统计 + 关联类型（可选）
     * 
     * @param content 节点内容
     * @param refs 引用?
     * @param defs 被引用数
     * @param associationType 关联类型（可选）
     * @returns 悬停提示文本
     * @private
     * Requirements: 14.1
     */
    private buildNodeTitle(
        content: string,
        refs: number,
        defs: number,
        associationType?: string
    ): string {
        let title = content;

        if (refs > 0 || defs > 0) {
            title += `
??: ${refs}, ???: ${defs}`;
        }

        if (associationType) {
            title += `
????: ${associationType}`;
        }

        return title;
    }

    private getAssociationLabel(type: AssociationType): string {
        const labelMap: Record<AssociationType, string> = {
            [AssociationType.REF_LINK]: '????',
            [AssociationType.HIERARCHY]: '????',
            [AssociationType.TAG]: '????',
            [AssociationType.SIBLING]: '???',
        };
        return labelMap[type] || '????';
    }

    private escapeSQL(value: string): string {
        if (!value) return '';
        return value.replace(/'/g, "''");
    }

    /**
     * 清空缓存
     */
    clearCache(): void {
        this.nodeCache.clear();
        this.cacheTimestamps.clear();
    }

    // ============================================================================
    // Orbit 图谱数据方法
    // ============================================================================

    /**
     * 获取 Orbit 图谱数据
     * 
     * @param selectedDirections 可选的选中方向，用于获取候选节?
     * @returns 包含节点、边和位置信息的图谱数据
     * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3
     */
    public async getOrbitGraphData(selectedDirections?: Set<AssociationType>): Promise<OrbitGraphData> {
        try {
            // 1. ?NeuralQueue 获取 OrbitState
            const orbitState = this.queue.getOrbitState();

            if (!orbitState) {
                console.warn('[GraphDataService] No Orbit state available');
                return this.getEmptyGraphData();
            }

            // 2. 🔧 获取候选节点（如果提供了方向参数）
            //    注意：OrbitState.candidateNodes 来自 NeuralQueue.getCurrentCandidates()?
            //    但该方法返回空数组。我们直接调?getCandidateNodes 获取真实候选?
            let candidateNodes = orbitState.candidateNodes;
            if (selectedDirections && selectedDirections.size > 0) {
                const graphCandidates = await this.getCandidateNodes(selectedDirections);
                candidateNodes = graphCandidates.map(c => ({
                    id: c.id,
                    associationType: c.type,
                    weight: c.weight,
                    reason: c.reason,
                }));
                console.log(`[GraphDataService] Fetched ${candidateNodes.length} candidates for Orbit`);
            }

            const historyIds = new Set(orbitState.historyPath.map(node => node.cardId));
            candidateNodes = candidateNodes.filter(c => !historyIds.has(c.id));

            const enhancedState = {
                ...orbitState,
                candidateNodes,
            };

            // 4. 构建节点和边
            const { nodes, edges, addedNodeIds, normalizedHistoryPath, normalizedMissedBlocks, normalizedCandidateNodes, currentActualId } = await this.buildOrbitGraph(enhancedState);

            // 5. 🔧 基于实际添加的节点重新构建过滤后的状态，确保布局连续
            const filteredHistoryPath = normalizedHistoryPath.filter(
                node => addedNodeIds.has(node.cardId)
            );

            const filteredMissedBlocks = new Map();
            normalizedMissedBlocks.forEach((list, seedId) => {
                const filtered = list.filter(item => addedNodeIds.has(item.id));
                if (filtered.length > 0) {
                    filteredMissedBlocks.set(seedId, filtered);
                }
            });

            const filteredCandidateNodes = normalizedCandidateNodes.filter(c => addedNodeIds.has(c.id));

            const filteredState = {
                ...enhancedState,
                historyPath: filteredHistoryPath,
                missedBlocks: filteredMissedBlocks,
                candidateNodes: filteredCandidateNodes,
                currentNodeId: currentActualId ?? enhancedState.currentNodeId,
            };

            // 6. 计算布局（使用过滤后的状态）
            const positions = this.orbitLayoutEngine.calculateLayout(filteredState);

            console.log('[GraphDataService] Orbit graph data generated:', {
                nodes: nodes.length,
                edges: edges.length,
                positions: positions.size,
                filteredHistory: filteredHistoryPath.length,
                candidates: filteredCandidateNodes.length,
            });

            return { nodes, edges, positions };
        } catch (error) {
            console.error('[GraphDataService] Failed to get Orbit graph data:', error);
            return this.getEmptyGraphData();
        }
    }

    /**
     * 构建 Orbit 图谱的节点和?
     * 
     * @param state Orbit 状?
     * @returns 节点和边数据
     * @private
     */
    private async buildOrbitGraph(state: OrbitState): Promise<{
        nodes: GraphNode[];
        edges: GraphEdge[];
        addedNodeIds: Set<string>;
        normalizedHistoryPath: NavigationPathNode[];
        normalizedMissedBlocks: Map<string, OrbitMissedBlock[]>;
        normalizedCandidateNodes: OrbitCandidateNode[];
        currentActualId: string | null;
    }> {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        const addedNodeIds = new Set<string>();
        const historyNodeIds: string[] = [];
        const idMap = new Map<string, string>();

        const normalizedHistoryPath: NavigationPathNode[] = [];
        const normalizedMissedBlocks = new Map<string, OrbitMissedBlock[]>();
        const normalizedCandidateNodes: OrbitCandidateNode[] = [];

        const currentActualId = state.currentNodeId
            ? (await this.fetchBlockData(state.currentNodeId))?.id || state.currentNodeId
            : null;

        // 1. History nodes (orbit zone)
        for (const pathNode of state.historyPath) {
            const blockData = await this.fetchBlockData(pathNode.cardId);
            if (!blockData) continue;

            const titleText = (blockData.content || pathNode.cardTitle || '').trim();
            if (!titleText) continue;

            const actualId = blockData.id || pathNode.cardId;
            idMap.set(pathNode.cardId, actualId);

            const isCurrent = currentActualId ? actualId === currentActualId : pathNode.cardId === state.currentNodeId;
            const nodeType = pathNode.isSeed ? 'seed' : 'history';
            const finalType = isCurrent ? 'current' : nodeType;

            if (addedNodeIds.has(actualId)) {
                if (isCurrent) {
                    const existing = nodes.find(n => n.id === actualId);
                    if (existing) {
                        const currentStyle = getNodeStyle('current');
                        existing.type = 'current';
                        existing.isCurrent = true;
                        existing.size = currentStyle.size;
                        existing.color = currentStyle.color;
                    }
                }
                continue;
            }

            const style = getNodeStyle(finalType as any, pathNode.associationType);
            const label = this.truncateLabel(titleText || actualId);

            nodes.push({
                id: actualId,
                label,
                title: titleText,
                type: finalType as any,
                isCurrent,
                size: style.size,
                color: style.color,
            });

            addedNodeIds.add(actualId);
            historyNodeIds.push(actualId);
            normalizedHistoryPath.push({ ...pathNode, cardId: actualId });
        }

        // 2. Main path edges (skip empty blocks)
        for (let i = 0; i < historyNodeIds.length - 1; i++) {
            const fromId = historyNodeIds[i];
            const toId = historyNodeIds[i + 1];

            if (!addedNodeIds.has(fromId) || !addedNodeIds.has(toId)) {
                continue;
            }

            const edgeStyle = getEdgeStyle('main');
            edges.push({
                from: fromId,
                to: toId,
                arrows: 'to',
                color: edgeStyle.color,
                width: edgeStyle.width,
            });
        }

        // 3. Missed nodes + dashed links from seed
        for (const [seedId, missedList] of state.missedBlocks) {
            const seedActualId = idMap.get(seedId) || seedId;
            if (!addedNodeIds.has(seedActualId)) {
                continue;
            }

            const normalizedList: OrbitMissedBlock[] = [];
            for (const missed of missedList) {
                const blockData = await this.fetchBlockData(missed.id);
                if (!blockData) continue;

                const titleText = (blockData.content || '').trim();
                if (!titleText) continue;

                const actualId = blockData.id || missed.id;
                if (addedNodeIds.has(actualId)) continue;

                const style = getNodeStyle('missed');
                nodes.push({
                    id: actualId,
                    label: this.truncateLabel(titleText),
                    title: titleText,
                    type: 'missed',
                    size: style.size,
                    color: style.color,
                });

                addedNodeIds.add(actualId);
                normalizedList.push({ ...missed, id: actualId });

                const edgeStyle = getEdgeStyle('branch');
                edges.push({
                    from: seedActualId,
                    to: actualId,
                    color: edgeStyle.color,
                    width: edgeStyle.width,
                });
            }

            if (normalizedList.length > 0) {
                normalizedMissedBlocks.set(seedActualId, normalizedList);
            }
        }

        // 4. Candidate nodes + dashed links from current
        for (const candidate of state.candidateNodes) {
            const blockData = await this.fetchBlockData(candidate.id);
            if (!blockData) continue;

            const titleText = (blockData.content || '').trim();
            if (!titleText) continue;

            const actualId = blockData.id || candidate.id;
            if (addedNodeIds.has(actualId)) continue;

            const style = getNodeStyle('candidate', candidate.associationType);
            nodes.push({
                id: actualId,
                label: this.truncateLabel(titleText),
                title: candidate.reason,
                type: 'candidate',
                associationType: candidate.associationType,
                size: style.size,
                color: style.color,
            });

            addedNodeIds.add(actualId);
            normalizedCandidateNodes.push({ ...candidate, id: actualId });

            if (currentActualId && addedNodeIds.has(currentActualId)) {
                const edgeStyle = getEdgeStyle('candidate', candidate.associationType);
                edges.push({
                    from: currentActualId,
                    to: actualId,
                    arrows: 'to',
                    color: edgeStyle.color,
                    width: edgeStyle.width,
                });
            }
        }

        return {
            nodes,
            edges,
            addedNodeIds,
            normalizedHistoryPath,
            normalizedMissedBlocks,
            normalizedCandidateNodes,
            currentActualId,
        };
    }

    /**
     * 获取空图谱数?
     * 
     * @returns 空图谱数?
     * @private
     */
    private getEmptyGraphData(): OrbitGraphData {
        return {
            nodes: [],
            edges: [],
            positions: new Map(),
        };
    }
}

/**
 * Orbit 图谱数据接口
 */
export interface OrbitGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Map<string, Position>;
}
