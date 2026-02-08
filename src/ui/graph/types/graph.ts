/**
 * 神经漫游图谱可视化类型定义
 * 
 * 定义图谱节点、边、候选节点、窗口配置等核心数据结构
 */

// 复用核心的 AssociationType 定义
import type { AssociationType as CoreAssociationType, OrbitNodeType } from '../../../core/queue/neural/types';
export { AssociationType, OrbitNodeType } from '../../../core/queue/neural/types';

// 在文件内部使用的类型别名
type AssociationType = CoreAssociationType;

/**
 * 节点颜色配置
 */
export interface NodeColor {
    /** 背景色 */
    background: string;
    /** 边框色 */
    border: string;
    /** 高亮状态颜色 */
    highlight: {
        background: string;
        border: string;
    };
}

/**
 * 图谱节点
 */
export interface GraphNode {
    /** 块ID */
    id: string;
    /** 显示标签（截断后的内容） */
    label: string;
    /** 完整标题（悬停提示） */
    title: string;
    /** 节点类型 - 🆕 扩展支持 Orbit 节点类型 */
    type: 'history' | 'seed' | 'current' | 'missed' | 'candidate';
    /** 是否为当前节点 */
    isCurrent?: boolean;
    /** 关联类型（候选节点） */
    associationType?: AssociationType;
    /** 节点大小 */
    size: number;
    /** 节点颜色 */
    color: NodeColor;
    /** 节点图标 */
    icon?: string;
    /** 引用数 */
    refs?: number;
    /** 被引用数 */
    defs?: number;
    /** 🆕 Orbit 节点类型（可选，用于内部区分） */
    orbitNodeType?: OrbitNodeType;
}

/**
 * 边颜色配置
 */
export interface EdgeColor {
    /** 默认颜色 */
    color: string;
    /** 高亮颜色 */
    highlight?: string;
    /** 悬停颜色 */
    hover?: string;
}

/**
 * 图谱边（连线）
 */
export interface GraphEdge {
    /** 起始节点ID */
    from: string;
    /** 目标节点ID */
    to: string;
    /** 箭头方向 */
    arrows?: 'to' | 'from' | 'to,from';
    /** 边颜色 */
    color?: EdgeColor;
    /** 边宽度 */
    width?: number;
    /** 边标签 */
    label?: string;
}

/**
 * 候选节点
 */
export interface CandidateNode {
    /** 块ID */
    id: string;
    /** 关联类型 */
    type: AssociationType;
    /** 权重 */
    weight: number;
    /** 关联原因描述 */
    reason: string;
}

/**
 * 窗口配置
 */
export interface WindowConfig {
    /** 窗口尺寸 */
    size: {
        width: number;
        height: number;
    };
    /** 窗口位置 */
    position: {
        x: number;
        y: number;
    };
    /** 窗口可见性 */
    visible: boolean;
}

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

/**
 * vis-network 配置选项（简化版）
 */
export interface VisNetworkOptions {
    nodes?: any;
    edges?: any;
    physics?: any;
    interaction?: any;
    layout?: any;
}

/**
 * 聚焦选项
 */
export interface FocusOptions {
    /** 动画配置 */
    animation?: {
        duration: number;
        easingFunction: string;
    };
    /** 缩放级别 */
    scale?: number;
}
