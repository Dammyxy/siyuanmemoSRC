/**
 * Orbit 轨道视图 - 布局引擎
 *
 * @description 负责计算所有节点和边的位置（纯函数，无副作用）
 */

import type { Node, Edge } from '@vue-flow/core';
import type { OrbitStateV2, NavigationPathNode, CandidateNode, MissedBlock } from './OrbitState';
import { AssociationType } from '@/core/queue/neural/types';
import {
  LAYOUT_CONSTANTS,
  DIRECTION_ANGLES,
  DIRECTION_COLORS,
} from './constants';

/**
 * 布局计算结果
 */
export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Orbit 布局引擎
 */
export class OrbitLayoutEngine {
  /**
   * 计算完整布局
   *
   * @param state - Orbit 状态
   * @param expandedDirections - 已展开的方向列表（可选）
   * @returns 节点和边的位置信息
   */
  calculate(state: OrbitStateV2, expandedDirections: string[] = []): LayoutResult {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodePositions = new Map<string, { x: number; y: number }>();
    const missingSeeds = new Set<string>();
    const expandedSet = new Set(expandedDirections); // 转换为 Set 提高查询效率

    // 🔧 新增：块 ID 到节点 ID 的映射（用于边的连接）
    const blockIdToNodeId = new Map<string, string>();

    console.log('[OrbitLayoutEngine] calculate called:', {
      historyPathLength: state.historyPath?.length || 0,
      currentNodeId: state.currentNodeId,
      candidatesByDirectionSize: state.candidatesByDirection?.size || 0,
      candidatesByDirectionKeys: state.candidatesByDirection ? Array.from(state.candidatesByDirection.keys()) : [],
      expandedDirections: expandedDirections,
    });

    // 🔧 检测缺失的种子
    if (state.seedMissedBlocks && state.historyPath) {
      state.seedMissedBlocks.forEach((missedBlocks, seedId) => {
        const seedExists = state.historyPath?.some(n => n.cardId === seedId);
        if (!seedExists) {
          missingSeeds.add(seedId);
        }
      });

      if (missingSeeds.size > 0) {
        console.warn(`[OrbitLayoutEngine] Detected ${missingSeeds.size} missing seeds:`,
          Array.from(missingSeeds).map(id => id.substring(0, 12)).join(', '));
      }
    }

    // 1. 主轨道布局（y=0）- 水平排列历史路径
    this.layoutMainTrack(state.historyPath, state.currentNodeId, nodes, edges, nodePositions, blockIdToNodeId);

    // 2. 🆕 关系大节点布局（扇形分布）- 传入展开状态
    this.layoutDirectionGroups(
      state.candidatesByDirection,
      state.currentNodeId,
      nodePositions,
      nodes,
      edges,
      blockIdToNodeId,  // 🔧 传入映射
      expandedSet  // 🔧 传入展开状态
    );

    // 3. 🆕 遗落块布局（上方双层）- 传入缺失种子集合和节点 ID 映射
    this.layoutMissedBlocks(
      state.seedMissedBlocks,
      state.directionMissedBlocks,
      nodePositions,
      nodes,
      edges,
      missingSeeds,
      blockIdToNodeId  // 🔧 传入映射
    );

    console.log('[OrbitLayoutEngine] calculate result:', {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodeTypes: nodes.map(n => n.type),
      missingSeedsCount: missingSeeds.size,
      nodePositions: nodes.map(n => ({ id: n.id.substring(0, 12), type: n.type, x: n.position.x, y: n.position.y })),
    });

    return { nodes, edges };
  }

  /**
   * 主轨道布局（历史路径）
   */
  private layoutMainTrack(
    historyPath: NavigationPathNode[],
    currentNodeId: string | null,
    nodes: Node[],
    edges: Edge[],
    nodePositions: Map<string, { x: number; y: number }>,
    blockIdToNodeId: Map<string, string>  // 🔧 新增：块 ID 到节点 ID 的映射
  ): void {
    if (historyPath.length === 0) return;

    // 找到当前节点作为中心点
    const pivotIdx = historyPath.findIndex((n) => n.cardId === currentNodeId);
    const pivot = pivotIdx >= 0 ? pivotIdx : historyPath.length - 1;

    historyPath.forEach((node, index) => {
      const x = (index - pivot) * LAYOUT_CONSTANTS.HORIZONTAL_SPACING;
      const y = LAYOUT_CONSTANTS.MAIN_TRACK_Y;
      const isCurrent = node.cardId === currentNodeId;

      let nodeType = 'history';
      if (isCurrent) nodeType = 'current';
      else if (node.isSeed) nodeType = 'seed';

      // 使用 path-${index} 作为唯一ID，避免重复
      const nodeId = `path-${index}`;

      // 🔧 调试：记录节点创建
      console.log('[OrbitLayoutEngine] Creating main track node:', {
        nodeId,
        nodeType,
        cardId: node.cardId?.substring(0, 12),
        isCurrent,
        isSeed: node.isSeed,
      });

      nodes.push({
        id: nodeId,
        type: nodeType,
        position: { x, y },
        data: { label: node.cardTitle, blockId: node.cardId },
        draggable: false,
      });

      // 🔧 建立块 ID 到节点 ID 的映射
      blockIdToNodeId.set(node.cardId, nodeId);

      // 🔧 关键修复：保存所有节点的位置（不只是当前节点）
      // 遗落块布局需要所有种子节点的位置
      nodePositions.set(node.cardId, { x, y });

      // 主轨道连线
      if (index > 0) {
        edges.push({
          id: `main-${index}`,
          source: `path-${index - 1}`,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: '#8B5CF6', strokeWidth: 3 },  // 紫色连线
        });
      }
    });
  }

  /**
   * 关系大节点水平布局（在当前节点下方）
   */
  private layoutDirectionGroups(
    candidatesByDirection: Map<AssociationType, CandidateNode[]>,
    currentNodeId: string | null,
    nodePositions: Map<string, { x: number; y: number }>,
    nodes: Node[],
    edges: Edge[],
    blockIdToNodeId: Map<string, string>,  // 🔧 新增：块 ID 到节点 ID 的映射
    expandedDirections: Set<string> = new Set()  // 🆕 展开状态
  ): void {
    if (!currentNodeId) return;

    const currentPos = nodePositions.get(currentNodeId);
    if (!currentPos) return;

    const { CANDIDATE_AREA_Y_OFFSET, DIRECTION_GROUP_SPACING, CANDIDATE_VERTICAL_SPACING, MAX_CANDIDATES_PER_DIRECTION } =
      LAYOUT_CONSTANTS;

    // 固定的方向顺序：ref, context, tag, sibling
    const directionOrder: AssociationType[] = [
      AssociationType.REF_LINK,
      AssociationType.HIERARCHY,
      AssociationType.TAG,
      AssociationType.SIBLING,
    ];

    // 计算总宽度，居中对齐
    const totalDirections = directionOrder.length;
    const totalWidth = (totalDirections - 1) * DIRECTION_GROUP_SPACING;
    const startX = currentPos.x - totalWidth / 2;

    directionOrder.forEach((direction, index) => {
      const candidates = candidatesByDirection.get(direction) || [];
      const color = DIRECTION_COLORS[direction] || '#999';  // 🆕 获取方向颜色

      // 🆕 判断该方向是否展开
      // 🔧 默认完全收起：展开时显示所有，未展开时不显示任何候选块
      const isExpanded = expandedDirections.has(direction);
      const maxCandidates = isExpanded ? Infinity : 0;

      // 计算关系大节点位置（水平排列）
      const groupX = startX + index * DIRECTION_GROUP_SPACING;
      const groupY = currentPos.y + CANDIDATE_AREA_Y_OFFSET;

      // 创建关系大节点
      const groupNodeId = `group-${direction}`;
      nodes.push({
        id: groupNodeId,
        type: 'directionGroup',
        position: { x: groupX, y: groupY },
        data: {
          direction,
          count: candidates.length,
          isExpanded,  // 🆕 传递展开状态给 DirectionGroupNode
        },
        draggable: false,
      });

      // 🆕 添加从当前节点到关系节点的虚线连接
      const currentNodeNodeId = blockIdToNodeId.get(currentNodeId);
      if (currentNodeNodeId) {
        edges.push({
          id: `current-to-group-${direction}`,
          source: currentNodeNodeId,  // ✅ 使用节点 ID
          target: groupNodeId,
          type: 'smoothstep',
          style: {
            stroke: color,
            strokeWidth: 1,
            strokeDasharray: '4,4',
            opacity: 0.5,
          },
          animated: false,
        });
      }

      // 🔧 移除 MoreNode 按钮：现在直接左键点击关系节点展开/收起

      // 在关系节点下方排列候选块（竖向列表）
      // 从关系节点下方 60px 开始
      const startY = groupY + 60;
      const visibleCandidates = candidates.slice(0, maxCandidates);
      visibleCandidates.forEach((candidate, idx) => {
        const candX = groupX;
        const candY = startY + idx * CANDIDATE_VERTICAL_SPACING;

        // 🔧 关键修复：为候选节点 ID 添加前缀，避免与其他节点冲突
        const candidateNodeId = `candidate-${candidate.id}`;

        nodes.push({
          id: candidateNodeId,  // ✅ 使用带前缀的 ID
          type: 'candidate',
          position: { x: candX, y: candY },
          data: {
            label: candidate.title,
            assocType: candidate.associationType,
            reason: candidate.reason,
            blockId: candidate.id,  // 🔧 添加 blockId 字段（用于点击导航）
          },
          draggable: false,
        });
      });
    });
  }

  /**
   * 遗落块布局（上方双层）
   */
  private layoutMissedBlocks(
    seedMissedBlocks: Map<string, MissedBlock[]>,
    directionMissedBlocks: Map<AssociationType, MissedBlock[]>,
    nodePositions: Map<string, { x: number; y: number }>,
    nodes: Node[],
    edges: Edge[],
    missingSeeds: Set<string> = new Set(),
    blockIdToNodeId: Map<string, string>  // 🔧 新增：块 ID 到节点 ID 的映射
  ): void {
    const { SEED_MISSED_Y, DIRECTION_MISSED_Y, MISSED_HORIZONTAL_SPACING } = LAYOUT_CONSTANTS;

    // 1. 种子遗落块（第一层，y=-150）
    seedMissedBlocks.forEach((missedList, seedId) => {
      // 🔧 防御性检查：确保 missedList 存在且是数组
      if (!missedList || !Array.isArray(missedList) || missedList.length === 0) {
        return;
      }

      // 🔧 跳过缺失的种子
      if (missingSeeds.has(seedId)) {
        console.warn(`[OrbitLayoutEngine] Skipping missed blocks for missing seed: ${seedId.substring(0, 12)}`);
        return;
      }

      // 🔧 关键修复：获取正确的节点 ID
      const seedNodeId = blockIdToNodeId.get(seedId);
      if (!seedNodeId) {
        console.warn(`[OrbitLayoutEngine] Seed node ID not found for block ${seedId.substring(0, 12)}, skipping missed blocks`);
        return;
      }

      const seedPos = nodePositions.get(seedId);
      if (!seedPos) {
        console.warn(`[OrbitLayoutEngine] Seed position not found for ${seedId.substring(0, 12)}, skipping missed blocks`);
        return;
      }

      const totalWidth = (missedList.length - 1) * MISSED_HORIZONTAL_SPACING;
      const startX = seedPos.x - totalWidth / 2;

      missedList.forEach((missed, idx) => {
        const missedX = startX + idx * MISSED_HORIZONTAL_SPACING;

        // 🔧 验证遗落块数据完整性
        if (!missed.id || !missed.blockId) {
          console.warn(`[OrbitLayoutEngine] Invalid missed block data, skipping`);
          return;
        }

        // 🔧 关键修复：为遗落块节点 ID 添加唯一性保证
        const missedNodeId = `seed-missed-${seedId.substring(0, 8)}-${missed.id.substring(0, 8)}-${idx}`;

        nodes.push({
          id: missedNodeId,  // ✅ 使用更唯一的 ID
          type: 'missed',
          position: { x: missedX, y: SEED_MISSED_Y },
          data: {
            label: missed.blockId.slice(0, 8),
            assocType: missed.associationType,
            reason: missed.reason,
            blockId: missed.blockId,  // 🔧 添加 blockId 字段
          },
          draggable: false,
        });

        // 🔧 关键修复：使用节点 ID 而不是块 ID
        edges.push({
          id: `missed-edge-${seedId.substring(0, 8)}-${idx}`,
          source: seedNodeId,  // ✅ 修复：使用节点 ID
          target: missedNodeId,  // ✅ 使用正确的节点 ID
          type: 'smoothstep',
          style: {
            stroke: 'rgba(128,128,128,0.5)',
            strokeWidth: 1,
            strokeDasharray: '5,5',
          },
        });
      });
    });

    // 2. 方向遗落块（第二层，y=-250）
    let directionMissedXOffset = 0;
    directionMissedBlocks.forEach((missedList, direction) => {
      // 🔧 防御性检查：确保 missedList 存在且是数组
      if (!missedList || !Array.isArray(missedList) || missedList.length === 0) {
        return;
      }

      missedList.forEach((missed, idx) => {
        // 🔧 验证遗落块数据完整性
        if (!missed.id || !missed.blockId) {
          console.warn(`[OrbitLayoutEngine] Invalid direction missed block data, skipping`);
          return;
        }

        // 🔧 关键修复：为方向遗落块节点 ID 添加唯一性保证
        const missedNodeId = `dir-missed-${direction}-${missed.id.substring(0, 8)}-${idx}`;

        nodes.push({
          id: missedNodeId,  // ✅ 使用更唯一的 ID
          type: 'missed',
          position: {
            x: directionMissedXOffset,
            y: DIRECTION_MISSED_Y,
          },
          data: {
            label: missed.blockId.slice(0, 8),
            assocType: missed.associationType,
            reason: missed.reason,
            blockId: missed.blockId,  // 🔧 添加 blockId 字段
          },
          draggable: false,
        });

        directionMissedXOffset += MISSED_HORIZONTAL_SPACING;
      });
    });
  }
}
