/**
 * 浏览器常量定义
 * 
 * 集中管理魔法数字和默认值
 */

/** 默认优先级 */
export const DEFAULT_PRIORITY = 50;

/** 优先级范围 */
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 100;

/** 优先级分级阈值 */
export const PRIORITY_HIGH_THRESHOLD = 80;
export const PRIORITY_MEDIUM_THRESHOLD = 40;

/** 默认难点卡片阈值（遗忘次数） */
export const DEFAULT_LEECH_THRESHOLD = 8;

/** 预览面板默认尺寸 */
export const DEFAULT_PREVIEW_SIZE = {
  dialog: 500,
  tab: 300,
  dock: 300,
};

/** 预览面板尺寸范围 */
export const PREVIEW_SIZE_MIN = 150;
export const PREVIEW_SIZE_MAX = 800;

/** 缓存过期时间（毫秒） */
export const CACHE_TTL = 60 * 1000; // 60秒

/** 分页大小 */
export const DEFAULT_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

/** 截断文本的默认长度 */
export const DEFAULT_TRUNCATE_LENGTH = 100;

/** 批量操作的最大数量 */
export const MAX_BATCH_SIZE = 1000;

/** SQL 查询的批量大小 */
export const SQL_BATCH_SIZE = 200;

/** 搜索防抖延迟（毫秒） */
export const SEARCH_DEBOUNCE_DELAY = 300;

/** 自动保存延迟（毫秒） */
export const AUTO_SAVE_DELAY = 1000;

/** 性能监控阈值（毫秒） */
export const PERFORMANCE_SLOW_THRESHOLD = 500;
export const PERFORMANCE_VERY_SLOW_THRESHOLD = 1000;

/** 卡片状态枚举值 */
export const CARD_STATE = {
  NEW: 0,
  LEARNING: 1,
  REVIEW: 2,
  RELEARNING: 3,
} as const;

/** 卡片状态标签映射 */
export const CARD_STATE_LABELS: Record<number, string> = {
  [CARD_STATE.NEW]: '新卡',
  [CARD_STATE.LEARNING]: '学习中',
  [CARD_STATE.REVIEW]: '复习',
  [CARD_STATE.RELEARNING]: '重学',
};

/** 卡片状态颜色映射 */
export const CARD_STATE_COLORS: Record<number, string> = {
  [CARD_STATE.NEW]: 'var(--b3-card-info-color)',
  [CARD_STATE.LEARNING]: 'var(--b3-card-warning-color)',
  [CARD_STATE.REVIEW]: 'var(--b3-card-success-color)',
  [CARD_STATE.RELEARNING]: 'var(--b3-card-error-color)',
};

/** 卡片类型 */
export const CARD_TYPE = {
  TOPIC: 'topic',
  ITEM: 'item',
} as const;

/** 卡片类型标签 */
export const CARD_TYPE_LABELS: Record<string, string> = {
  [CARD_TYPE.TOPIC]: '📄 主题',
  [CARD_TYPE.ITEM]: '❓ 卡片',
};

/** 筛选预设键 */
export const PRESET_KEYS = {
  ALL: 'all',
  DUE: 'due',
  OVERDUE: 'overdue',
  LEECH: 'leech',
  NEW: 'new',
  LEARNING: 'learning',
  SUSPENDED: 'suspended',
  CURRENT_DOC: 'current-doc',
  TOPIC_ONLY: 'topic-only',
  ITEM_ONLY: 'item-only',
} as const;

/** 排序字段 */
export const SORT_FIELDS = {
  PRIORITY: 'priority',
  DUE: 'due',
  INTERVAL: 'interval',
  DIFFICULTY: 'difficulty',
  RETRIEVABILITY: 'retrievability',
  REPS: 'reps',
  LAPSES: 'lapses',
  STABILITY: 'stability',
} as const;

/** 视图模式 */
export const VIEW_MODE = {
  FLAT: 'flat',
  HIERARCHY: 'hierarchy',
} as const;

/** 浏览器模式 */
export const BROWSER_MODE = {
  DIALOG: 'dialog',
  TAB: 'tab',
  DOCK: 'dock',
} as const;

/** 批量操作类型 */
export const BATCH_ACTION = {
  RESCHEDULE: 'reschedule',
  RESET: 'reset',
  SUSPEND: 'suspend',
  UNSUSPEND: 'unsuspend',
  PRIORITY: 'priority',
  DELETE: 'delete',
} as const;

/** 键盘快捷键 */
export const KEYBOARD_SHORTCUTS = {
  RESCHEDULE: 'Ctrl+J',
  RESET: 'Ctrl+Shift+R',
  SUSPEND: 'Ctrl+K',
  UNSUSPEND: 'Ctrl+Shift+K',
  PRIORITY: 'Ctrl+P',
  DELETE: 'Del',
  REFRESH: 'F5',
  SEARCH: 'Ctrl+F',
  SELECT_ALL: 'Ctrl+A',
} as const;

/** 列字段名 */
export const COLUMN_FIELDS = {
  NO: 'noColumn',
  CONTENT: 'content',
  PRIORITY: 'priority',
  INTERVAL: 'interval',
  LAST_REVIEW: 'lastReviewFormatted',
  DUE: 'dueFormatted',
  REPS: 'reps',
  LAPSES: 'lapses',
  STATE: 'stateLabel',
  CARD_TYPE: 'cardType',
  FIRST_REVIEW: 'firstReviewFormatted',
  RETRIEVABILITY: 'retrievability',
  DIFFICULTY: 'difficulty',
  STABILITY: 'stability',
} as const;

/** 列宽度 */
export const COLUMN_WIDTHS = {
  NO: 50,
  PRIORITY: 55,
  INTERVAL: 55,
  LAST_REVIEW: 110,
  DUE: 110,
  REPS: 50,
  LAPSES: 50,
  STATE: 65,
  CARD_TYPE: 70,
  FIRST_REVIEW: 110,
  RETRIEVABILITY: 55,
  DIFFICULTY: 55,
  STABILITY: 55,
} as const;

/** 图标名称 */
export const ICONS = {
  CARDS: 'iconRiffCard',
  CALENDAR: 'iconCalendar',
  REFRESH: 'iconRefresh',
  PAUSE: 'iconPause',
  PLAY: 'iconPlay',
  MARK: 'iconMark',
  TRASH: 'iconTrashcan',
  INFO: 'iconInfo',
  SETTINGS: 'iconSettings',
  SEARCH: 'iconSearch',
  FILTER: 'iconFilter',
  SORT: 'iconSort',
  PREVIEW: 'iconPreview',
  LAYOUT_RIGHT: 'iconLayoutRight',
  CLOSE: 'iconClose',
  FILES: 'iconFiles',
  LIST: 'iconList',
  TAGS: 'iconTags',
  BUG: 'iconBug',
  BOOK: 'iconBook',
  ADD: 'iconAdd',
  CHECK: 'iconCheck',
} as const;

/** 消息类型 */
export const MESSAGE_TYPE = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

/** 对话框尺寸 */
export const DIALOG_SIZE = {
  SMALL: { width: '500px', height: '400px' },
  MEDIUM: { width: '760px', height: '70vh' },
  LARGE: { width: '90vw', height: '85vh' },
  FULL: { width: '100vw', height: '100vh' },
} as const;

/** 时间格式 */
export const TIME_FORMAT = {
  DATE: 'YYYY-MM-DD',
  TIME: 'HH:mm:ss',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  SHORT_DATE: 'MM-DD',
  SHORT_TIME: 'HH:mm',
} as const;

/** 数值精度 */
export const DECIMAL_PLACES = {
  DIFFICULTY: 1,
  STABILITY: 1,
  RETRIEVABILITY: 0,
  A_FACTOR: 2,
} as const;

/** 排序字段配置（用于 UI 显示） */
export interface SortFieldConfig {
  colId: string;
  label: string;
  icon?: string;
}

export const SORT_FIELD_CONFIGS: SortFieldConfig[] = [
  // FSRS 参数
  { colId: 'priority', label: '优先级', icon: 'iconStar' },
  { colId: 'interval', label: '间隔', icon: 'iconHourGlass' },
  { colId: 'reps', label: '复习次数', icon: 'iconRefresh' },
  { colId: 'lapses', label: '遗忘次数', icon: 'iconWarn' },
  { colId: 'difficulty', label: '难度', icon: 'iconGraph' },
  { colId: 'retrievability', label: '可提取性', icon: 'iconEye' },
  { colId: 'stability', label: '稳定性', icon: 'iconLock' },
  // 时间字段
  { colId: 'lastReviewFormatted', label: '上次复习', icon: 'iconHistory' },
  { colId: 'dueFormatted', label: '下次复习', icon: 'iconCalendar' },
  { colId: 'firstReviewFormatted', label: '首次复习', icon: 'iconClock' },
];
