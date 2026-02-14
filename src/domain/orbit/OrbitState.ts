/**
 * Orbit 轨道视图 - Domain 层核心状态接口
 *
 * @version 2.0
 * @description 支持方向漫游的 Orbit 状态定义
 */

import type { AssociationType } from '@/core/queue/neural/types';

/**
 * 方向漫游模式
 */
export type DirectionMode = 'AUTO' | AssociationType;

/**
 * 导航路径节点
 */
export interface NavigationPathNode {
  /** 卡片 ID */
  cardId: string;
  /** 卡片标题 */
  cardTitle: string;
  /** 是否为种子块 */
  isSeed: boolean;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 候选节点（增强版 - 支持方向分类）
 */
export interface CandidateNode {
  /** 唯一标识 */
  id: string;
  /** 块 ID */
  blockId: string;
  /** 标题 */
  title: string;
  /** 关联类型 */
  associationType: AssociationType;
  /** 权重 */
  weight: number;
  /** 显示标签（如"双链来源"） */
  reason: string;
}

/**
 * 遗落块
 */
export interface MissedBlock {
  /** 唯一标识 */
  id: string;
  /** 块 ID */
  blockId: string;
  /** 关联类型 */
  associationType: AssociationType;
  /** 遗落时间戳 */
  missedAt: number;
  /** 遗落原因 */
  reason: 'SEED_SELECTED' | 'DIRECTION_SELECTED';
}

/**
 * Orbit 核心状态（v2 - 支持方向漫游 + 路径导航）
 */
export interface OrbitStateV2 {
  // ===== 现有字段（兼容旧版）=====
  /** 历史路径 */
  historyPath: NavigationPathNode[];
  /** 当前节点 ID */
  currentNodeId: string | null;

  // ===== 🆕 方向漫游字段 =====
  /** 当前选中的方向 */
  selectedDirection: DirectionMode;
  /** AUTO 模式包含的方向列表 */
  autoModeDirections: AssociationType[];
  /** 按方向分组的候选节点 */
  candidatesByDirection: Map<AssociationType, CandidateNode[]>;

  // ===== 🆕 双重遗落块机制 =====
  /** 种子遗落块：种子ID -> 遗落块列表 */
  seedMissedBlocks: Map<string, MissedBlock[]>;
  /** 方向遗落块：关联类型 -> 遗落块列表 */
  directionMissedBlocks: Map<AssociationType, MissedBlock[]>;

  // ===== 🆕 路径导航系统字段 =====
  /** 当前路径指针（-1 表示未初始化） */
  currentPathIndex: number;
  /** 导航模式：explore 探索新邻居 | follow 沿路径前进 */
  navigationMode: 'explore' | 'follow';
  /** 是否有书签（用于"返回最新"功能） */
  hasBookmark: boolean;
}

/**
 * 空 Orbit 状态（用于初始化）
 */
export function createEmptyOrbitState(): OrbitStateV2 {
  return {
    historyPath: [],
    currentNodeId: null,
    selectedDirection: 'AUTO',
    autoModeDirections: [],
    candidatesByDirection: new Map(),
    seedMissedBlocks: new Map(),
    directionMissedBlocks: new Map(),
  };
}
