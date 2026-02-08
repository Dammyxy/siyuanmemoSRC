/**
 * 神经漫游图谱可视化类型定义
 *
 * 定义图谱节点、边、候选节点、窗口配置等核心数据结构
 */

import type { AssociationType as CoreAssociationType } from '@/core/queue/neural/types';
export { AssociationType, OrbitNodeType } from '@/core/queue/neural/types';
export type { GraphNode, GraphEdge, CandidateNode, NodeColor, EdgeColor, WindowConfig } from '@/application/graph/types';
export type { VisNetworkOptions, FocusOptions } from '@/infrastructure/graph/types';

// 在文件内使用的类型别名
type AssociationType = CoreAssociationType;

/**
 * 图谱事件类型
 */
export type GraphEvent =
    | { type: 'node-click'; nodeId: string }
    | { type: 'direction-change'; directions: Set<AssociationType> }
    | { type: 'graph-refresh' };

/**
 * 复习界面事件类型
 */
export type ReviewEvent =
    | { type: 'card-change'; cardId: string }
    | { type: 'history-update'; path: string[] }
    | { type: 'queue-update' };
