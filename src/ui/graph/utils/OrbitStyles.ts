/**
 * OrbitStyles - Orbit 样式配置
 * 
 * 定义 Orbit 节点和边的视觉样式配置
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { AssociationType } from '../../../core/queue/neural/types';
import type { NodeColor, EdgeColor } from '../types/graph';

/**
 * 节点样式配置接口
 */
export interface NodeStyle {
  color: NodeColor;
  size: number;
  borderWidth: number;
  borderDashes?: number[];
  shape: string;
}

/**
 * 边样式配置接口
 */
export interface EdgeStyle {
  width: number;
  dashes: boolean | number[];
  arrows: {
    to?: {
      enabled: boolean;
      scaleFactor?: number;
    };
  };
  color: EdgeColor;
}

/**
 * Orbit 节点样式配置
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export const ORBIT_NODE_STYLES: Record<string, NodeStyle> = {
  seed: {
    color: {
      background: '#4CAF50',
      border: '#2E7D32',
      highlight: {
        background: '#66BB6A',
        border: '#1B5E20',
      },
    },
    size: 20,
    borderWidth: 4,
    shape: 'dot',
  },
  current: {
    color: {
      background: 'var(--b3-graph-hl-point)',
      border: 'var(--b3-graph-hl-point)',
      highlight: {
        background: 'var(--b3-graph-hl-point)',
        border: 'var(--b3-graph-hl-point)',
      },
    },
    size: 26,
    borderWidth: 4,
    shape: 'dot',
  },
  history: {
    color: {
      background: 'var(--b3-theme-primary)',
      border: 'var(--b3-theme-primary-light)',
      highlight: {
        background: 'var(--b3-theme-primary-light)',
        border: 'var(--b3-theme-primary)',
      },
    },
    size: 14,
    borderWidth: 2,
    shape: 'dot',
  },
  missed: {
    color: {
      background: 'rgba(128, 128, 128, 0.4)',
      border: 'rgba(128, 128, 128, 0.6)',
      highlight: {
        background: 'rgba(128, 128, 128, 0.6)',
        border: 'rgba(128, 128, 128, 0.8)',
      },
    },
    size: 9,
    borderWidth: 1,
    borderDashes: [5, 5],
    shape: 'dot',
  },
};

/**
 * 候选节点颜色映射
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export const ORBIT_CANDIDATE_COLORS: Record<AssociationType, string> = {
  [AssociationType.REF_LINK]: '#2196F3',    // 蓝色
  [AssociationType.HIERARCHY]: '#FF9800',   // 橙色
  [AssociationType.TAG]: '#9C27B0',         // 紫色
  [AssociationType.SIBLING]: '#00BCD4',     // 青色
};

/**
 * 边样式配置
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export const ORBIT_EDGE_STYLES: Record<string, EdgeStyle> = {
  main: {
    width: 3,
    dashes: false,
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 1,
      },
    },
    color: {
      color: 'var(--b3-graph-hl-line)',
      highlight: 'var(--b3-graph-hl-line)',
    },
  },
  branch: {
    width: 1,
    dashes: [5, 5],
    arrows: {
      to: {
        enabled: false,
      },
    },
    color: {
      color: 'rgba(128, 128, 128, 0.3)',
      highlight: 'rgba(128, 128, 128, 0.5)',
    },
  },
  candidate: {
    width: 2,
    dashes: [3, 3],
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 0.8,
      },
    },
    color: {
      color: '#999999', // 默认颜色，会被动态设置
      highlight: '#999999',
    },
  },
};

/**
 * 获取候选节点样式
 * 
 * @param associationType 关联类型
 * @returns 节点样式配置
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export function getCandidateNodeStyle(associationType: AssociationType): NodeStyle {
  const color = ORBIT_CANDIDATE_COLORS[associationType];
  return {
    color: {
      background: color,
      border: color,
      highlight: {
        background: color,
        border: color,
      },
    },
    size: 12,
    borderWidth: 2,
    borderDashes: [3, 3],
    shape: 'dot',
  };
}

/**
 * 获取候选边样式
 * 
 * @param associationType 关联类型
 * @returns 边样式配置
 * Requirements: 3.5
 */
export function getCandidateEdgeStyle(associationType: AssociationType): EdgeStyle {
  const color = ORBIT_CANDIDATE_COLORS[associationType];
  return {
    ...ORBIT_EDGE_STYLES.candidate,
    color: {
      color,
      highlight: color,
    },
  };
}

/**
 * 获取节点样式（根据节点类型）
 * 
 * @param nodeType 节点类型
 * @param associationType 关联类型（候选节点需要）
 * @returns 节点样式配置
 */
export function getNodeStyle(
  nodeType: 'history' | 'seed' | 'current' | 'missed' | 'candidate',
  associationType?: AssociationType
): NodeStyle {
  if (nodeType === 'candidate' && associationType) {
    return getCandidateNodeStyle(associationType);
  }
  return ORBIT_NODE_STYLES[nodeType];
}

/**
 * 获取边样式（根据边类型）
 * 
 * @param edgeType 边类型
 * @param associationType 关联类型（候选边需要）
 * @returns 边样式配置
 */
export function getEdgeStyle(
  edgeType: 'main' | 'branch' | 'candidate',
  associationType?: AssociationType
): EdgeStyle {
  if (edgeType === 'candidate' && associationType) {
    return getCandidateEdgeStyle(associationType);
  }
  return ORBIT_EDGE_STYLES[edgeType];
}
