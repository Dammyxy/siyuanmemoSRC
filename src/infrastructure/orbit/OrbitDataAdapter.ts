/**
 * Orbit 轨道视图 - 数据适配器（Infrastructure 层）
 *
 * @description 负责从 NeuralQueue 获取数据并转换为 Domain 层的 OrbitState
 */

import type { NeuralQueue } from '@/core/queue/neural/NeuralQueue';
import type { OrbitStateV2 } from '@/domain/orbit/OrbitState';
import { AssociationType } from '@/core/queue/neural/types';

/**
 * 方向模式类型
 */
export type DirectionMode = 'AUTO' | AssociationType;

/**
 * Orbit 数据适配器
 */
export class OrbitDataAdapter {
  constructor(private neuralQueue: NeuralQueue) {}

  /**
   * 获取 Orbit 状态
   *
   * @param selectedDirection 当前选中的方向
   * @returns Orbit 状态对象
   */
  async getOrbitState(selectedDirection: DirectionMode): Promise<OrbitStateV2> {
    // 直接调用 NeuralQueue 的 getOrbitStateV2 方法，获取完整数据
    return await this.neuralQueue.getOrbitStateV2(selectedDirection);
  }

  /**
   * 切换方向（记录遗落块）
   *
   * @param fromDirection 原方向
   * @param toDirection 新方向
   */
  async switchDirection(
    fromDirection: DirectionMode,
    toDirection: DirectionMode
  ): Promise<void> {
    // 只有从具体方向切换到其他方向时才记录遗落块
    if (fromDirection !== 'AUTO' && fromDirection !== toDirection) {
      const currentNodeId = (this.neuralQueue as any).currentSeedId;
      if (!currentNodeId) return;

      const candidates = await this.neuralQueue.getCandidatesForDirection(
        currentNodeId,
        fromDirection
      );
      this.neuralQueue.recordDirectionMissed(
        fromDirection,
        candidates.map(c => c.id)
      );
    }
  }

  /**
   * 清除方向遗落块
   */
  clearDirectionMissedBlocks(): void {
    this.neuralQueue.clearDirectionMissedBlocks();
  }
}
