/**
 * OrbitLayoutEngine - 轨道布局引擎
 * 
 * 实现 Orbit 设计方案中的轨道布局：
 * - 主轨道：历史路径从左到右
 * - 遗落区：在种子块上方
 * - 候选区：在当前节点右下方
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { AssociationType } from '../../../core/queue/neural/types';
import type { OrbitState, NavigationPathNode, MissedBlock, CandidateNode } from '../../../core/queue/neural/types';

/**
 * 位置接口
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Orbit 布局引擎
 */
export class OrbitLayoutEngine {
  // Layout constants
  private readonly HORIZONTAL_SPACING = 180;
  private readonly MISSED_OFFSET_Y = -220;
  private readonly MISSED_HORIZONTAL_SPACING = 70;
  private readonly CANDIDATE_OFFSET_Y = 220;
  private readonly CANDIDATE_SPACING = 70;
  private readonly CANDIDATE_GROUP_GAP = 50;

  /**
   * 计算所有节点的布局位置
   * 
   * @param state - Orbit 状态
   * @returns 节点 ID 到位置的映射
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
   */
  public calculateLayout(state: OrbitState): Map<string, Position> {
    try {
      const positions = new Map<string, Position>();

      // 1. 计算主轨道节点位置（历史路径）
      const mainOrbitPositions = this.calculateMainOrbitPositions(state.historyPath, state.currentNodeId);
      mainOrbitPositions.forEach((pos, id) => positions.set(id, pos));

      // 2. 计算遗落块位置（在种子块上方）
      const missedPositions = this.calculateMissedBlockPositions(
        state.missedBlocks,
        mainOrbitPositions
      );
      missedPositions.forEach((pos, id) => positions.set(id, pos));

      // 3. 计算候选节点位置（在当前节点右下方）
      if (state.currentNodeId) {
        const currentNodePosition = mainOrbitPositions.get(state.currentNodeId);
        if (currentNodePosition) {
          const candidatePositions = this.calculateCandidatePositions(
            state.candidateNodes,
            currentNodePosition
          );
          candidatePositions.forEach((pos, id) => positions.set(id, pos));
        }
      }

      return positions;
    } catch (error) {
      console.error('[OrbitLayoutEngine] Layout calculation failed:', error);
      // 返回降级布局
      return this.calculateFallbackLayout(state);
    }
  }

  /**
   * 计算主轨道节点位置（历史路径）
   * 
   * 主轨道从左到右排列，每个节点间隔 HORIZONTAL_SPACING
   * 
   * @param historyPath 历史路径节点列表
   * @returns 节点 ID 到位置的映射
   * @private
   * Requirements: 1.1, 1.4
   */
  private calculateMainOrbitPositions(
    historyPath: NavigationPathNode[],
    currentNodeId?: string | null
  ): Map<string, Position> {
    const positions = new Map<string, Position>();

    if (historyPath.length === 0) return positions;

    const currentIndex = currentNodeId
      ? historyPath.findIndex(node => node.cardId === currentNodeId)
      : -1;
    const pivotIndex = currentIndex >= 0 ? currentIndex : Math.floor(historyPath.length / 2);

    historyPath.forEach((node, index) => {
      positions.set(node.cardId, {
        x: (index - pivotIndex) * this.HORIZONTAL_SPACING,
        y: 0,
      });
    });

    return positions;
  }

  /**
   * 计算遗落块位置（在种子块上方）
   * 
   * 遗落块在对应种子块的上方，水平居中分布
   * 
   * @param missedBlocks 遗落块映射
   * @param mainOrbitPositions 主轨道节点位置
   * @returns 节点 ID 到位置的映射
   * @private
   * Requirements: 1.2, 1.5
   */
  private calculateMissedBlockPositions(
    missedBlocks: Map<string, MissedBlock[]>,
    mainOrbitPositions: Map<string, Position>
  ): Map<string, Position> {
    const positions = new Map<string, Position>();

    missedBlocks.forEach((missedList, seedId) => {
      const seedPos = mainOrbitPositions.get(seedId);
      if (!seedPos) {
        return;
      }

      // 计算遗落块的起始 x 坐标（居中分布）
      const totalWidth = (missedList.length - 1) * this.MISSED_HORIZONTAL_SPACING;
      const startX = seedPos.x - totalWidth / 2;

      missedList.forEach((missed, index) => {
        positions.set(missed.id, {
          x: startX + index * this.MISSED_HORIZONTAL_SPACING,
          y: seedPos.y + this.MISSED_OFFSET_Y,
        });
      });
    });

    return positions;
  }

  /**
   * 计算候选节点位置（在当前节点右下方）
   * 
   * 候选节点在当前节点的右下方，垂直排列
   * 
   * @param candidateNodes 候选节点列表
   * @param currentNodePosition 当前节点位置
   * @returns 节点 ID 到位置的映射
   * @private
   * Requirements: 1.3
   */
  private calculateCandidatePositions(
    candidateNodes: CandidateNode[],
    currentNodePosition: Position
  ): Map<string, Position> {
    const positions = new Map<string, Position>();
    if (!candidateNodes.length) return positions;

    const order: AssociationType[] = [
      AssociationType.REF_LINK,
      AssociationType.HIERARCHY,
      AssociationType.TAG,
      AssociationType.SIBLING,
    ];

    const groups = new Map<AssociationType, CandidateNode[]>();
    for (const candidate of candidateNodes) {
      const type = candidate.associationType || AssociationType.REF_LINK;
      const list = groups.get(type) || [];
      list.push(candidate);
      groups.set(type, list);
    }

    const extraTypes = Array.from(groups.keys()).filter(type => !order.includes(type));
    const finalOrder = [...order, ...extraTypes];
    const activeGroups = finalOrder.filter(type => (groups.get(type) || []).length > 0);

    const groupWidths = activeGroups.map(type => {
      const count = (groups.get(type) || []).length;
      return count > 1 ? (count - 1) * this.CANDIDATE_SPACING : 0;
    });

    const totalWidth = groupWidths.reduce((sum, w) => sum + w, 0)
      + Math.max(0, activeGroups.length - 1) * this.CANDIDATE_GROUP_GAP;

    let cursor = currentNodePosition.x - totalWidth / 2;
    const baseY = currentNodePosition.y + this.CANDIDATE_OFFSET_Y;

    for (const type of activeGroups) {
      const list = groups.get(type) || [];
      list.forEach((candidate, index) => {
        positions.set(candidate.id, {
          x: cursor + index * this.CANDIDATE_SPACING,
          y: baseY,
        });
      });

      const width = list.length > 1 ? (list.length - 1) * this.CANDIDATE_SPACING : 0;
      cursor += width + this.CANDIDATE_GROUP_GAP;
    }

    return positions;
  }

  /**
   * Fallback layout for safety.
   */
  private calculateFallbackLayout(state: OrbitState): Map<string, Position> {
    const positions = new Map<string, Position>();

    state.historyPath.forEach((node, index) => {
      positions.set(node.cardId, { x: index * 200, y: 0 });
    });

    return positions;
  }
}
