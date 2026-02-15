/**
 * 快速制卡渲染器 - 类型定义
 * 
 * 本文件定义了快速制卡渲染器的核心类型和接口
 */

/**
 * 快速卡片类型
 * 
 * @description 定义支持的快速卡片类型
 * - basic: 基础卡片（>> << <>）
 * - concept: 概念卡片（::）
 * - descriptor: 描述符卡片（;;）
 * - cloze: 填空卡片（{{}}）
 * - multiLine: 列表模版卡片（>>>）
 */
export type QuickCardType = 
  | 'basic'      // >> << <>
  | 'concept'    // ::
  | 'descriptor' // ;;
  | 'cloze'      // {{}}
  | 'multiLine'; // >>>

/**
 * 隐藏内容类型
 * 
 * @description 定义卡片正面可以隐藏的内容类型
 * - mark: 标记内容（<mark> 标签或 data-type="mark"）
 * - list: 列表内容（.li 或 .list 类）
 * - heading: 标题内容（NodeHeading 类型）
 * - superblock: 超级块内容（.sb 类）
 */
export type HiddenContentType = 
  | 'mark'       // 标记
  | 'list'       // 列表
  | 'heading'    // 标题
  | 'superblock'; // 超级块

/**
 * 快速卡片元数据
 * 
 * @description 包含卡片的元数据信息，用于策略解析
 */
export interface QuickCardMetadata {
  /**
   * 原始符号
   * @example '>>', '<<', '<>', '::', ';;', '{{}}', '>>>'
   */
  symbol: string;
  
  /**
   * 父块 ID（可选）
   * @description 用于 Xiuyuan 模版判断
   */
  parentBlockId?: string;
  
  /**
   * 是否使用 Xiuyuan 模版（可选）
   * @description 仅对描述符卡片有效
   */
  isXiuyuanTemplate?: boolean;
  
  /**
   * Xiuyuan 类型标记（可选）
   * @description 用于区分 Xiuyuan 双向卡的正向和反向
   * @example 'forward', 'reverse'
   */
  typeMarker?: string;
  
  /**
   * 卡片 ID（可选）
   * @description Xiuyuan 卡片的唯一标识
   */
  cardId?: string;
}

/**
 * 卡片面数据
 * 
 * @description 表示卡片的一个面（正面或反面）的数据
 */
export interface CardFaceData {
  /**
   * HTML 内容
   * @description 卡片面的 HTML 内容
   */
  html: string;
  
  /**
   * 需要隐藏的内容类型列表
   * @description 用于生成对应的 CSS 类
   */
  hiddenTypes: HiddenContentType[];
}

/**
 * 思源块数据
 * 
 * @description 从思源 API 获取的块数据结构
 */
export interface SiyuanBlock {
  /**
   * 块 ID
   */
  id: string;
  
  /**
   * 块内容
   * @description 块的 Markdown 或 HTML 内容
   */
  content: string;
  
  /**
   * 父块 ID（可选）
   * @description 用于判断 Xiuyuan 模版
   */
  parentID?: string;
}
