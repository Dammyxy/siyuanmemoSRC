/**
 * GraphDataService - 图谱数据获取和转换服务
 * 
 * 负责从 NeuralRoamQueue 获取历史路径和候选节点，
 * 并转换为图谱可视化所需的数据格式。
 * 
 * Requirements: 1.1, 2.1, 8.1
 */

import type { NeuralRoamQueue } from '../../../queues/NeuralRoamQueue';
import type {
    GraphNode,
    GraphEdge,
    CandidateNode,
    NodeColor,
} from '../types/graph';
import { AssociationType } from '../types/graph';
import { sql } from '../../../core/siyuan/api';
import { ATTR_CARD_ID } from '../../../core/siyuan/block';
import { calculateNodeSize } from '../utils/nodeCalculator';
import { QueryEngine } from '../../../core/queue/neural/QueryEngine';
import { NeuralQueueStorage } from '../../../core/queue/neural/NeuralQueueStorage';
import { OrbitLayoutEngine, Position } from './OrbitLayoutEngine';
import { ORBIT_NODE_STYLES, ORBIT_EDGE_STYLES, getNodeStyle, getEdgeStyle } from '../utils/OrbitStyles';
import type { OrbitState } from '../../../core/queue/neural/types';

/**
 * 块数据接口（从 SQL 查询返回）
 */
interface BlockData {
    id: string;
    content: string;
    type: string;
    root_id: string;
    parent_id: string;
    card_id?: string;
    has_flashcard?: number;
    ref_count?: number;  // 引用数（出链）
    def_count?: number;  // 被引用数（入链）
    [key: string]: any;
}

/**
 * 图谱数据服务类
 */
export class GraphDataService {
    /** 神经漫游队列实例 */
    private queue: NeuralRoamQueue;
    
    /** 节点数据缓存 */
    private nodeCache: Map<string, BlockData> = new Map();
    
    /** 缓存过期时间（毫秒） */
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟
    
    /** 缓存时间戳 */
    private cacheTimestamps: Map<string, number> = new Map();
    
    /** 🆕 Orbit 布局引擎 */
    private orbitLayoutEngine: OrbitLayoutEngine = new OrbitLayoutEngine();
    
    constructor(queue: NeuralRoamQueue) {
        this.queue = queue;
    }
    
    /**
     * 获取图谱数据
     * 
     * @param selectedDirections 选中的漫游方向
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
            
            // 4.1 收集历史路径节点数据（应用过滤逻辑）
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
            
            // 4.2 收集候选节点数据（应用过滤逻辑 + 去重）
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
            
            // 6. 转换为图谱节点格式
            const nodes: GraphNode[] = [];
            const edges: GraphEdge[] = [];
            
            // 6.1 添加历史路径节点（使用实际的块 ID）
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
                
                // 添加历史路径连线（使用实际的块 ID）
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
            
            // 6.2 添加候选节点（使用实际的块 ID + 去重）
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
                
                // 跳过已添加的节点（历史路径 + 已添加的候选节点）
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
     * @returns 历史路径中的块 ID 数组
     * Requirements: 1.1
     */
    getHistoryPath(): string[] {
        return this.queue.getHistorySnapshot();
    }
    
    /**
     * 获取候选节点
     * 
     * 通过直接调用 QueryEngine 的方法获取当前节点的所有邻居，
     * 然后根据选中的方向进行过滤。
     * 
     * @param selectedDirections 选中的漫游方向
     * @returns 候选节点列表
     * Requirements: 2.1
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
            
            // 加载配置
            const config = NeuralQueueStorage.loadConfig();
            const queryEngine = new QueryEngine(config);
            
            // 获取所有邻居
            const neighbors = await queryEngine.fetchNeighbors(currentNode);
            
            // 根据选中的方向过滤
            const filteredNeighbors = neighbors.filter(neighbor => 
                selectedDirections.has(neighbor.type)
            );
            
            // 转换为 CandidateNode 格式
            const candidates: CandidateNode[] = filteredNeighbors.map(neighbor => ({
                id: neighbor.id,
                type: neighbor.type,
                weight: 1.0, // 默认权重，后续可以从 WeightedWalkEngine 获取
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
     * 获取当前节点
     * 
     * @returns 当前节点 ID，如果没有则返回 null
     * Requirements: 1.5
     */
    getCurrentNode(): string | null {
        return this.queue.getCurrentSeed();
    }
    
    /**
     * 从数据库获取块数据（带缓存 + 神经漫游过滤逻辑）
     * 
     * 应用神经漫游的块过滤规则：
     * 1. 优先返回列表项块（type='i'）
     * 2. 排除列表块（type='l'）
     * 3. 对于段落块，检查是否在列表项中，如果是则返回父列表项
     * 
     * @param blockId 块 ID
     * @returns 块数据，如果不存在则返回 null
     * @private
     * Requirements: 9.6
     * @see siyuan-plugin-fsrs/NEURAL_ROAM_BLOCK_FILTERING.md
     */
    private async fetchBlockData(blockId: string): Promise<BlockData | null> {
        try {
            // 检查缓存
            const cached = this.nodeCache.get(blockId);
            const cacheTime = this.cacheTimestamps.get(blockId);
            
            if (cached && cacheTime && (Date.now() - cacheTime < this.CACHE_TTL)) {
                return cached;
            }
            
            // 从数据库查询（应用神经漫游过滤逻辑）
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
                    
                    -- 情况 2: 如果是段落/标题块，检查是否在列表项中
                    (
                        b.id = '${this.escapeSQL(blockId)}' 
                        AND (b.type = 'p' OR b.type = 'h' OR b.type = 't')
                        AND b.parent_id NOT IN (
                            SELECT id FROM blocks WHERE type = 'i'
                        )
                    )
                    
                    OR
                    
                    -- 情况 3: 如果查询的是段落/标题块，但它在列表项中，返回其父列表项
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
            
            // 如果返回的块 ID 与查询的不同，说明进行了替换（段落 → 父列表项）
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
     * 截断标签到指定长度
     * 
     * @param content 内容
     * @param maxLength 最大长度（默认20）
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
     * @param isCurrent 是否为当前节点
     * @returns 节点颜色配置
     * @private
     * Requirements: 7.1, 7.2, 7.3
     */
    private getNodeColor(type: 'history' | 'candidate', isCurrent: boolean = false): NodeColor {
        if (isCurrent) {
            // 当前节点：红色
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
            // 历史节点：蓝色高亮
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
     * @param blockData 块数据
     * @returns 图标名称
     * @private
     * Requirements: 14.3, 14.4
     */
    private getNodeIcon(blockData: BlockData): string | undefined {
        if (blockData.has_flashcard === 1) {
            return 'iconCard';
        }
        
        // 根据块类型返回图标
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
     * 基于引用数和被引用数计算节点大小。
     * 使用归一化 + 强化对比度算法，模仿思源原生关系图。
     * 
     * @param blockData 块数据
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
     * 格式：内容 + 引用统计 + 关联类型（可选）
     * 
     * @param content 节点内容
     * @param refs 引用数
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
        
        // 添加引用统计（模仿思源原生样式）
        if (refs > 0 || defs > 0) {
            title += `\n引用: ${refs}, 被引用: ${defs}`;
        }
        
        // 添加关联类型（仅候选节点）
        if (associationType) {
            title += `\n关联类型: ${associationType}`;
        }
        
        return title;
    }
    
    /**
     * 获取关联类型的中文标签
     * 
     * @param type 关联类型
     * @returns 中文标签
     * @private
     * Requirements: 2.3
     */
    private getAssociationLabel(type: AssociationType): string {
        const labelMap: Record<AssociationType, string> = {
            [AssociationType.REF_LINK]: '链接关系',
            [AssociationType.HIERARCHY]: '层级关系',
            [AssociationType.TAG]: '标签关系',
            [AssociationType.SIBLING]: '兄弟块',
        };
        return labelMap[type] || '未知关系';
    }
    
    /**
     * SQL 转义（防止 SQL 注入）
     * 
     * @param value 要转义的值
     * @returns 转义后的值
     * @private
     */
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
     * @returns 包含节点、边和位置信息的图谱数据
     * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3
     */
    public async getOrbitGraphData(): Promise<OrbitGraphData> {
        try {
            // 1. 从 NeuralQueue 获取 OrbitState
            const orbitState = this.queue.getOrbitState();
            
            if (!orbitState) {
                console.warn('[GraphDataService] No Orbit state available');
                return this.getEmptyGraphData();
            }

            // 2. 构建节点和边
            const { nodes, edges } = await this.buildOrbitGraph(orbitState);

            // 3. 计算布局
            const positions = this.orbitLayoutEngine.calculateLayout(orbitState);

            console.log('[GraphDataService] Orbit graph data generated:', {
                nodes: nodes.length,
                edges: edges.length,
                positions: positions.size,
            });

            return { nodes, edges, positions };
        } catch (error) {
            console.error('[GraphDataService] Failed to get Orbit graph data:', error);
            return this.getEmptyGraphData();
        }
    }

    /**
     * 构建 Orbit 图谱的节点和边
     * 
     * @param state Orbit 状态
     * @returns 节点和边数据
     * @private
     */
    private async buildOrbitGraph(state: OrbitState): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        // 1. 构建历史节点
        for (const pathNode of state.historyPath) {
            const nodeType = pathNode.isSeed ? 'seed' : 'history';
            const isCurrent = pathNode.cardId === state.currentNodeId;
            const finalType = isCurrent ? 'current' : nodeType;

            const blockData = await this.fetchBlockData(pathNode.cardId);
            if (!blockData) continue;

            const style = getNodeStyle(finalType as any, pathNode.associationType);

            nodes.push({
                id: pathNode.cardId,
                label: this.truncateLabel(pathNode.cardTitle),
                title: pathNode.cardTitle,
                type: finalType as any,
                isCurrent,
                size: style.size,
                color: style.color,
            });
        }

        // 2. 构建主路径边
        for (let i = 0; i < state.historyPath.length - 1; i++) {
            const edgeStyle = getEdgeStyle('main');
            edges.push({
                from: state.historyPath[i].cardId,
                to: state.historyPath[i + 1].cardId,
                arrows: 'to',
                color: edgeStyle.color,
                width: edgeStyle.width,
            });
        }

        // 3. 构建遗落块节点和边
        for (const [seedId, missedList] of state.missedBlocks) {
            for (const missed of missedList) {
                const blockData = await this.fetchBlockData(missed.id);
                if (!blockData) continue;

                const style = getNodeStyle('missed');

                nodes.push({
                    id: missed.id,
                    label: this.truncateLabel(blockData.content),
                    title: blockData.content,
                    type: 'missed',
                    size: style.size,
                    color: style.color,
                });

                const edgeStyle = getEdgeStyle('branch');
                edges.push({
                    from: seedId,
                    to: missed.id,
                    color: edgeStyle.color,
                    width: edgeStyle.width,
                });
            }
        }

        // 4. 构建候选节点和边
        for (const candidate of state.candidateNodes) {
            const blockData = await this.fetchBlockData(candidate.id);
            if (!blockData) continue;

            const style = getNodeStyle('candidate', candidate.associationType);

            nodes.push({
                id: candidate.id,
                label: this.truncateLabel(blockData.content),
                title: candidate.reason,
                type: 'candidate',
                associationType: candidate.associationType,
                size: style.size,
                color: style.color,
            });

            if (state.currentNodeId) {
                const edgeStyle = getEdgeStyle('candidate', candidate.associationType);
                edges.push({
                    from: state.currentNodeId,
                    to: candidate.id,
                    arrows: 'to',
                    color: edgeStyle.color,
                    width: edgeStyle.width,
                });
            }
        }

        return { nodes, edges };
    }

    /**
     * 获取空图谱数据
     * 
     * @returns 空图谱数据
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
