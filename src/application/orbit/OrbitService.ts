/**
 * Orbit 轨道视图 - 应用服务（Application 层）
 *
 * @description 协调数据获取和布局计算，提供完整的图谱数据
 */

import type { OrbitDataAdapter } from '@/infrastructure/orbit/OrbitDataAdapter';
import { OrbitLayoutEngine } from '@/domain/orbit/OrbitLayoutEngine';
import type { DirectionMode } from '@/infrastructure/orbit/OrbitDataAdapter';

/**
 * Orbit 服务
 */
export class OrbitService {
  private layoutEngine = new OrbitLayoutEngine();

  constructor(private adapter: OrbitDataAdapter) {}

  /**
   * 获取完整的图谱数据（数据 + 布局）
   *
   * @param selectedDirection 当前选中的方向
   * @returns 节点和边的位置信息
   */
  async getOrbitVisualization(selectedDirection: DirectionMode) {
    // 1. 从 adapter 获取数据
    const state = await this.adapter.getOrbitState(selectedDirection);

    // 2. 使用 layoutEngine 计算布局
    const layout = this.layoutEngine.calculate(state);

    return layout;
  }

  /**
   * 切换方向
   *
   * @param fromDirection 原方向
   * @param toDirection 新方向
   */
  async switchDirection(fromDirection: DirectionMode, toDirection: DirectionMode) {
    await this.adapter.switchDirection(fromDirection, toDirection);
  }

  /**
   * 清除方向遗落块
   */
  clearDirectionMissedBlocks(): void {
    this.adapter.clearDirectionMissedBlocks();
  }
}
