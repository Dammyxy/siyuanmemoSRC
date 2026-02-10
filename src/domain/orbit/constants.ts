/**
 * Orbit 轨道视图 - 布局常量
 *
 * @description 定义节点位置、颜色、标签等常量
 */

/**
 * 布局常量
 */
export const LAYOUT_CONSTANTS = {
  /** 主轨道 Y 坐标 */
  MAIN_TRACK_Y: 0,
  /** 历史节点水平间距 */
  HORIZONTAL_SPACING: 180,

  /** 候选区 Y 偏移（在当前节点下方） */
  CANDIDATE_AREA_Y_OFFSET: 200,
  /** 关系节点水平间距 */
  DIRECTION_GROUP_SPACING: 150,
  /** 候选节点竖向间距 */
  CANDIDATE_VERTICAL_SPACING: 50,
  /** 每个方向最多显示候选数 */
  MAX_CANDIDATES_PER_DIRECTION: 5,

  /** 种子遗落块 Y 坐标 */
  SEED_MISSED_Y: -150,
  /** 方向遗落块 Y 坐标 */
  DIRECTION_MISSED_Y: -250,
  /** 遗落块水平间距 */
  MISSED_HORIZONTAL_SPACING: 80,
};

/**
 * 方向对应的角度（扇形布局）
 * 注意：键使用 AssociationType 枚举的值（'ref', 'context', 'tag', 'sibling'）
 */
export const DIRECTION_ANGLES: Record<string, number> = {
  ref: 15,        // REF_LINK: 0-30度
  context: 45,    // HIERARCHY: 30-60度
  tag: 75,        // TAG: 60-90度
  sibling: 105,   // SIBLING: 90-120度
};

/**
 * 方向对应的颜色
 * 注意：键使用 AssociationType 枚举的值（'ref', 'context', 'tag', 'sibling'）
 */
export const DIRECTION_COLORS: Record<string, string> = {
  ref: '#2196F3',       // REF_LINK: 蓝色
  context: '#FF9800',   // HIERARCHY: 橙色
  tag: '#9C27B0',       // TAG: 紫色
  sibling: '#00BCD4',   // SIBLING: 青色
};

/**
 * 方向对应的中文标签
 * 注意：键使用 AssociationType 枚举的值（'ref', 'context', 'tag', 'sibling'）
 */
export const DIRECTION_LABELS: Record<string, string> = {
  ref: '引用',        // REF_LINK
  context: '同文档',  // HIERARCHY
  tag: '标签',        // TAG
  sibling: '兄弟',    // SIBLING
};

/**
 * 方向对应的图标
 */
export const DIRECTION_ICONS = {
  REF_LINK: '🔗',
  HIERARCHY: '📂',
  TAG: '🏷️',
  SIBLING: '👥',
  AUTO: '🤖',
};
