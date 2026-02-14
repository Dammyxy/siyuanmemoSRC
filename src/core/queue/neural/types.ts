/**
 * Neural Roaming Queue - Type Definitions
 * 神经漫游队列 - 类型定义
 */

/**
 * 神经漫游中的块类型
 */
export enum NeuralBlockType {
  /** 闪卡 - 需要主动回忆和评分 */
  FLASHCARD = 'flashcard',
  /** 主题 - 被动阅读，作为知识跳板 */
  TOPIC = 'topic',
}

/**
 * 关联类型枚举
 * Association types for neural wandering
 */
export enum AssociationType {
  /** 双向链接 (权重 10) */
  REF_LINK = 'ref',
  /** 文档层级 (权重 5) */
  HIERARCHY = 'context',
  /** 标签关联 (权重 3) */
  TAG = 'tag',
  /** 兄弟块 (权重 1) */
  SIBLING = 'sibling',
}

/**
 * 加权邻居节点
 * Weighted neighbor node in the knowledge graph
 */
export interface WeightedNeighbor {
  /** 块 ID */
  id: string;
  /** 块内容文本（用于图谱显示） */
  title?: string;
  /** 权重值 */
  weight: number;
  /** 关联类型 */
  associationType: AssociationType;
  /** 关联原因描述（用于 UI 显示） */
  reason: string;
  /** 可选的元数据 */
  metadata?: {
    /** 引用类型：出链或入链 */
    refType?: 'outgoing' | 'incoming';
    /** 文档标题 */
    documentTitle?: string;
    /** 标签列表 */
    tags?: string[];
  };
}

/**
 * 神经块接口
 * Neural block representing either a flashcard or a topic
 */
export interface NeuralBlock {
  /** 块 ID */
  id: string;
  /** 块类型：闪卡或主题 */
  type: NeuralBlockType;
  /** 内容 */
  content: string;
  /** 思源块类型 */
  blockType: string;
  /** 是否包含 FSRS 属性 */
  hasFlashcard: boolean;
  /** 在漫游中的权重 */
  weight: number;
  /** 元数据 */
  metadata?: {
    /** 字数 */
    wordCount: number;
    /** 是否包含链接 */
    hasLinks: boolean;
    /** 文档标题 */
    documentTitle?: string;
  };
}

/**
 * 神经上下文信息
 * Neural context describing how a card was selected
 */
export interface NeuralContext {
  /** 前一张卡片的 ID */
  previousCardId: string | null;
  /** 关联类型 */
  associationType: AssociationType;
  /** 本地化的关联原因描述 */
  reason: string;
  /** 块类型：闪卡或主题 */
  blockType?: NeuralBlockType;
  /** 是否是闪卡 */
  isFlashcard?: boolean;
}

/**
 * 神经队列配置
 * Configuration for neural roaming queue
 */
export interface NeuralQueueConfig {
  /** 历史过滤器容量 (默认 50) */
  historyCapacity: number;

  /** 关联类型权重配置 */
  weights: {
    /** 双向链接权重 (默认 10) */
    refLink: number;
    /** 文档层级权重 (默认 5) */
    hierarchy: number;
    /** 标签权重 (默认 3) */
    tag: number;
    /** 兄弟块权重 (默认 1) */
    sibling: number;
  };

  /** 块类型权重配置 */
  blockWeights: {
    /** 闪卡权重 (默认 10) */
    flashcard: number;
    /** 主题块权重 */
    topic: {
      /** 标题块权重 (默认 4) */
      heading: number;
      /** 段落块权重 (默认 3) */
      paragraph: number;
      /** 列表项权重 (默认 2) */
      listItem: number;
    };
  };

  /** 查询限制配置 */
  queryLimits: {
    /** 同文档卡片查询上限 (默认 30) */
    contextCards: number;
    /** 标签关联卡片查询上限 (默认 10) */
    tagCards: number;
  };

  /** 功能开关 */
  features: {
    /** 是否启用标签关联 (默认 false) */
    enableTagAssociation: boolean;
    /** 是否启用兄弟块关联 (默认 false) */
    enableSiblingAssociation: boolean;
  };

  /** 主题模式配置 */
  topicMode: {
    /** 是否启用主题模式 (默认 true) */
    enabled: boolean;
    /** 最小内容长度 (默认 10) */
    minContentLength: number;
    /** 最大内容长度 (默认 2000) */
    maxContentLength: number;
    /** 允许的块类型 (默认 ['p', 'h', 'i', 'l']) */
    allowedBlockTypes: string[];
    /** 排除的路径模式 */
    excludePaths: string[];
    /** 质量阈值 (默认 5) */
    qualityThreshold: number;
  };

  /** FSRS 集成策略 */
  fsrsIntegration: 'none' | 'minimal';
}

/**
 * 默认配置
 */
export const DEFAULT_NEURAL_QUEUE_CONFIG: NeuralQueueConfig = {
  historyCapacity: 50,
  weights: {
    refLink: 10,
    hierarchy: 5,
    tag: 3,
    sibling: 1,
  },
  blockWeights: {
    flashcard: 10,
    topic: {
      heading: 4,
      paragraph: 3,
      listItem: 2,
    },
  },
  queryLimits: {
    contextCards: 30,
    tagCards: 10,
  },
  features: {
    enableTagAssociation: false,
    enableSiblingAssociation: false,
  },
  topicMode: {
    enabled: true,
    minContentLength: 10,
    maxContentLength: 2000,
    allowedBlockTypes: ['p', 'h', 'i', 'l'],
    excludePaths: ['/Templates/', '/Archive/', '/Trash/'],
    qualityThreshold: 5,
  },
  fsrsIntegration: 'none',
};

/**
 * 神经队列状态
 * State of the neural roaming queue
 */
export interface NeuralQueueState {
  /** 是否激活 */
  isActive: boolean;
  /** 当前种子卡片 ID */
  currentSeedId: string | null;
  /** 已访问的卡片 ID 列表 */
  visitedCards: string[];
  /** 会话开始时间 */
  sessionStartTime: number;
  /** 总共复习的卡片数 */
  totalCardsReviewed: number;
  /** 导航路径 */
  navigationPath: NavigationPathNode[];
}

/**
 * 导航路径节点
 * Node in the navigation path
 */
export interface NavigationPathNode {
  /** 卡片 ID */
  cardId: string;
  /** 卡片标题 */
  cardTitle: string;
  /** 关联类型 */
  associationType: AssociationType;
  /** 时间戳 */
  timestamp: number;
  /** 🆕 是否为种子块 (Orbit) */
  isSeed?: boolean;
}

/**
 * 邻居查询结果
 * Result of neighbor query
 */
export interface NeighborQueryResult {
  /** 块 ID */
  id: string;
  /** 关联类型 */
  type: AssociationType;
}

/**
 * 查询选项
 * Options for neighbor queries
 */
export interface QueryOptions {
  /** 是否包含引用链接 */
  includeRefs?: boolean;
  /** 是否包含同文档卡片 */
  includeContext?: boolean;
  /** 是否包含标签关联 */
  includeTags?: boolean;
  /** 是否包含兄弟块 */
  includeSiblings?: boolean;
}

// ============================================================================
// Orbit Visualization Types (轨道可视化类型)
// ============================================================================

/**
 * Orbit 节点类型枚举
 * Node types in the Orbit visualization
 */
export type OrbitNodeType = 'history' | 'seed' | 'current' | 'missed' | 'candidate';

/**
 * 遗落块记录
 * Missed block - candidate that was skipped when choosing a seed
 */
export interface MissedBlock {
  /** 块 ID */
  id: string;
  /** 关联类型 */
  associationType: AssociationType;
  /** 被遗落的时间戳 */
  missedAt: number;
}

/**
 * 候选节点
 * Candidate node - current explorable neighbor
 */
export interface CandidateNode {
  /** 块 ID */
  id: string;
  /** 关联类型 */
  associationType: AssociationType;
  /** 权重 */
  weight: number;
  /** 关联原因描述 */
  reason: string;
}

/**
 * Orbit 状态
 * Complete state of the Orbit visualization system
 */
export interface OrbitState {
  /** 历史路径（有序） */
  historyPath: NavigationPathNode[];
  /** 遗落块映射：种子ID -> 遗落块列表 */
  missedBlocks: Map<string, MissedBlock[]>;
  /** 当前节点 ID */
  currentNodeId: string | null;
  /** 候选节点列表 */
  candidateNodes: CandidateNode[];
}
