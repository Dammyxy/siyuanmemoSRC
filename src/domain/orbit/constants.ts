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

  /** 关系大节点距离当前节点的半径 */
  DIRECTION_GROUP_RADIUS: 250,
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
 */
export const DIRECTION_ANGLES = {
  REF_LINK: 15,      // 0-30度
  HIERARCHY: 45,     // 30-60度
  TAG: 75,           // 60-90度
  SIBLING: 105,      // 90-120度
};

/**
 * 方向对应的颜色
 */
export const DIRECTION_COLORS = {
  REF_LINK: '#2196F3',    // 蓝色
  HIERARCHY: '#FF9800',   // 橙色
  TAG: '#9C27B0',         // 紫色
  SIBLING: '#00BCD4',     // 青色
};

/**
 * 方向对应的中文标签
 */
export const DIRECTION_LABELS = {
  REF_LINK: '引用',
  HIERARCHY: '同文档',
  TAG: '标签',
  SIBLING: '兄弟',
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
