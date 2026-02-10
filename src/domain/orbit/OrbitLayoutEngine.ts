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
   * @returns 节点和边的位置信息
   */
  calculate(state: OrbitStateV2): LayoutResult {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodePositions = new Map<string, { x: number; y: number }>();

    console.log('[OrbitLayoutEngine] calculate called:', {
      historyPathLength: state.historyPath?.length || 0,
      currentNodeId: state.currentNodeId,
      candidatesByDirectionSize: state.candidatesByDirection?.size || 0,
      candidatesByDirectionKeys: state.candidatesByDirection ? Array.from(state.candidatesByDirection.keys()) : [],
    });

    // 1. 主轨道布局（y=0）- 水平排列历史路径
    this.layoutMainTrack(state.historyPath, state.currentNodeId, nodes, edges, nodePositions);

    // 2. 🆕 关系大节点布局（扇形分布）
    this.layoutDirectionGroups(
      state.candidatesByDirection,
      state.currentNodeId,
      nodePositions,
      nodes,
      edges
    );

    // 3. 🆕 遗落块布局（上方双层）
    this.layoutMissedBlocks(
      state.seedMissedBlocks,
      state.directionMissedBlocks,
      nodePositions,
      nodes,
      edges
    );

    console.log('[OrbitLayoutEngine] calculate result:', {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodeTypes: nodes.map(n => n.type),
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
    nodePositions: Map<string, { x: number; y: number }>
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

      nodes.push({
        id: nodeId,
        type: nodeType,
        position: { x, y },
        data: { label: node.cardTitle, blockId: node.cardId },
        draggable: false,
      });

      // 只保存当前节点的位置（用于候选区连线）
      if (isCurrent) {
        nodePositions.set(node.cardId, { x, y });
      }

      // 主轨道连线
      if (index > 0) {
        edges.push({
          id: `main-${index}`,
          source: `path-${index - 1}`,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: '#4a90d9', strokeWidth: 3 },
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
    edges: Edge[]
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
        },
        draggable: false,
      });

      // 在关系大节点下方排列候选块（竖向列表）
      const visibleCandidates = candidates.slice(0, MAX_CANDIDATES_PER_DIRECTION);
      visibleCandidates.forEach((candidate, idx) => {
        const candX = groupX;
        const candY = groupY + 100 + idx * CANDIDATE_VERTICAL_SPACING;

        nodes.push({
          id: candidate.id,
          type: 'candidate',
          position: { x: candX, y: candY },
          data: {
            label: candidate.title,
            assocType: candidate.associationType,
            reason: candidate.reason,
          },
          draggable: false,
        });
      });

      // 如果候选数超过限制，显示 "+X 更多" 节点
      if (candidates.length > MAX_CANDIDATES_PER_DIRECTION) {
        const moreNodeId = `more-${direction}`;
        const moreY = groupY + 100 + MAX_CANDIDATES_PER_DIRECTION * CANDIDATE_VERTICAL_SPACING;
        nodes.push({
          id: moreNodeId,
          type: 'more',
          position: { x: groupX, y: moreY },
          data: {
            count: candidates.length - MAX_CANDIDATES_PER_DIRECTION,
            direction,
          },
          draggable: false,
        });
      }
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
    edges: Edge[]
  ): void {
    const { SEED_MISSED_Y, DIRECTION_MISSED_Y, MISSED_HORIZONTAL_SPACING } = LAYOUT_CONSTANTS;

    // 1. 种子遗落块（第一层，y=-150）
    seedMissedBlocks.forEach((missedList, seedId) => {
      // 🔧 防御性检查：确保 missedList 存在且是数组
      if (!missedList || !Array.isArray(missedList) || missedList.length === 0) {
        return;
      }

      const seedPos = nodePositions.get(seedId);
      if (!seedPos) return;

      const totalWidth = (missedList.length - 1) * MISSED_HORIZONTAL_SPACING;
      const startX = seedPos.x - totalWidth / 2;

      missedList.forEach((missed, idx) => {
        const missedX = startX + idx * MISSED_HORIZONTAL_SPACING;
        nodes.push({
          id: `seed-missed-${missed.id}`,
          type: 'missed',
          position: { x: missedX, y: SEED_MISSED_Y },
          data: {
            label: missed.blockId.slice(0, 8),
            assocType: missed.associationType,
            reason: missed.reason,
          },
          draggable: false,
        });

        // 虚线连接到种子块
        edges.push({
          id: `missed-edge-${seedId}-${idx}`,
          source: seedId,
          target: `seed-missed-${missed.id}`,
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
        nodes.push({
          id: `dir-missed-${missed.id}`,
          type: 'missed',
          position: {
            x: directionMissedXOffset,
            y: DIRECTION_MISSED_Y,
          },
          data: {
            label: missed.blockId.slice(0, 8),
            assocType: missed.associationType,
            reason: missed.reason,
          },
          draggable: false,
        });

        directionMissedXOffset += MISSED_HORIZONTAL_SPACING;
      });
    });
  }
}
