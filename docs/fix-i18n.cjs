/**
 * i18n 修复脚本
 * 1. 补全 [A][B] 缺失的 key 到两个 JSON 文件
 * 2. 补全 [C] 硬编码字符串对应的 key 到两个 JSON 文件
 */
const fs = require('fs');

const ZH_FILE = './src/i18n/zh_CN.json';
const EN_FILE = './src/i18n/en_US.json';

const zh = JSON.parse(fs.readFileSync(ZH_FILE, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN_FILE, 'utf8'));

// ─── 需要补全的 key：zh 值 / en 值 ────────────────────────────────────────────
// 来源：[A] t() fallback、[B] i18n?.key fallback、[C] 硬编码字符串
const NEW_KEYS = {
  // [A] BrowserHierarchy / BrowserToolbar / CardBrowserToolbar
  queueIncremental:      { zh: '渐进学习',       en: 'Incremental Learning' },
  allCards:              { zh: '全部',            en: 'All' },
  dueToday:              { zh: '今日到期',        en: 'Due Today' },
  overdue:               { zh: '已过期',          en: 'Overdue' },
  leech:                 { zh: '难点卡片',        en: 'Leech' },
  new:                   { zh: '新卡片',          en: 'New' },
  spreadReviews:         { zh: '分摊复习压力 - 将积压的复习任务均匀分散', en: 'Spread Reviews - Distribute overdue reviews evenly' },
  togglePreview:         { zh: '切换预览',        en: 'Toggle Preview' },
  forceRefresh:          { zh: '强制刷新数据（清除缓存）', en: 'Force Refresh (Clear Cache)' },
  migrateTopicItem:      { zh: '识别 Topic/Item 类型', en: 'Detect Topic/Item Types' },
  perfReport:            { zh: '性能报告',        en: 'Performance Report' },

  // [A] BrowserPreview / CardPreviewPanel
  preview:               { zh: '预览',            en: 'Preview' },
  unlockPreview:         { zh: '双击内容区也可解锁', en: 'Double-click content to unlock' },
  lockPreview:           { zh: '锁定编辑',        en: 'Lock Editing' },
  jumpToBlock:           { zh: '跳转',            en: 'Jump to Block' },
  clickToPreview:        { zh: '点击卡片查看详情', en: 'Click a card to preview' },

  // [A] useContextMenu
  postponeHint:          { zh: '将到期时间推迟 N 天', en: 'Postpone due date by N days' },
  priorityLabel:         { zh: '优先级',          en: 'Priority' },
  priorityHint:          { zh: '0-100，越小越优先', en: '0-100, smaller = higher priority' },
  migrateConfirmTitle:   { zh: '识别 Topic/Item 类型', en: 'Detect Topic/Item Types' },

  // [A] SRSBrowser
  practiceLeech:         { zh: '难点攻坚',        en: 'Leech Practice' },
  spreadResult:          { zh: '分散结果',        en: 'Spread Result' },
  spreadSuccess:         { zh: '分散操作完成',    en: 'Spread completed' },
  spreadFailed:          { zh: '分散操作失败',    en: 'Spread failed' },
  openDialogFailed:      { zh: '打开对话框失败',  en: 'Failed to open dialog' },

  // [A] formatters
  today:                 { zh: '今天',            en: 'today' },
  yesterday:             { zh: '昨天',            en: 'yesterday' },

  // [A] SyncStatusIndicator
  skipped:               { zh: '跳过',            en: 'Skipped' },
  quickSyncTooltip:      { zh: '获取新卡片和更新（推荐日常使用）', en: 'Fetch new cards and updates (recommended for daily use)' },
  fullSyncTooltip:       { zh: '完整检查并清理数据（耗时较长，建议每周一次）', en: 'Full check and cleanup (takes longer, recommended weekly)' },

  // [A] NeuralRoamTopArea
  neuralReasonLabel:     { zh: '关联',            en: 'Related' },
  from:                  { zh: '来自',            en: 'From' },

  // [A] ReviewContent
  answerDivider:         { zh: '─── 答案 ───',    en: '─── Answer ───' },

  // [A] ReviewView
  lastReview:            { zh: '上次复习',        en: 'Last Review' },

  // [A] SettingsPanel
  schedulerFsrsV6:       { zh: 'FSRS v6',         en: 'FSRS v6' },
  schedulerAFactorV2:    { zh: 'A-Factor v2',      en: 'A-Factor v2' },

  // [A] FlashcardMetaMenu
  blockNotFound:         { zh: '未找到块信息',    en: 'Block not found' },
  due:                   { zh: '下次复习',        en: 'Next Review' },
  loadError:             { zh: '加载失败',        en: 'Load failed' },

  // [A] FsrsSettingsPanel
  schedulePreview:       { zh: '计划预览',        en: 'Schedule Preview' },
  fsrsSettings:          { zh: 'FSRS v6 设置',    en: 'FSRS v6 Settings' },
  targetRetention:       { zh: '目标记忆率',      en: 'Target Retention' },
  retentionDesc:         { zh: '随着时间的推移，你回忆起某张卡片的概率会下降。当概率降至此百分比时，卡片会进入练习队列。', en: 'Over time, your probability of recalling a card decreases. When it drops to this percentage, the card enters your review queue.' },
  weights:               { zh: '权重',            en: 'Weights' },
  weightsDesc:           { zh: '这些参数控制 FSRS 的复习间隔。建议使用下方按钮根据学习记录自动优化（至少需要 1000 次复习记录）。', en: 'These parameters control FSRS scheduling intervals. Use the button below to optimize them automatically based on your review history (requires at least 1000 reviews).' },
  useDefaultWeights:     { zh: '使用默认权重',    en: 'Use Default Weights' },
  maxInterval:           { zh: '最大间隔',        en: 'Maximum Interval' },
  maxIntervalDesc:       { zh: '复习间隔的上限天数。例如设为 365，则每张卡片每年至少复习一次。', en: 'Maximum days between reviews. E.g., setting 365 means each card is reviewed at least once per year.' },
  schedulerReset:        { zh: '重置调度器',      en: 'Reset Scheduler' },
  resetDesc:             { zh: '重置调度器会恢复默认设置。',  en: 'Resetting will restore default settings.' },
  resetDefaults:         { zh: '重置默认值',      en: 'Reset to Defaults' },

  // [A] SrsEditorDialog
  cardType:              { zh: '卡片类型',        en: 'Card Type' },
  nextReview:            { zh: '下次复习',        en: 'Next Review' },
  priority:              { zh: '优先级',          en: 'Priority' },
  aFactor:               { zh: 'A-Factor',        en: 'A-Factor' },
  learning:              { zh: '学习中',          en: 'Learning' },
  relearning:            { zh: '重新学习',        en: 'Relearning' },
  resetConfirmTitle:     { zh: '确认重置进度',    en: 'Confirm Reset Progress' },

  // [B] PracticeQueueManager
  practiceQueueEmpty:    { zh: '练习队列为空',    en: 'Practice queue is empty' },

  // [C] browser/types.ts - FILTER_PRESETS
  filterPresetAll:       { zh: '全部卡片',        en: 'All Cards' },
  filterPresetDue:       { zh: '今日到期',        en: 'Due Today' },
  filterPresetOverdue:   { zh: '已过期',          en: 'Overdue' },
  filterPresetNew:       { zh: '新卡片',          en: 'New Cards' },
  filterPresetLearning:  { zh: '学习中',          en: 'Learning' },
  filterPresetLeech:     { zh: '难点卡片',        en: 'Leech Cards' },
  filterPresetSuspended: { zh: '已暂停',          en: 'Suspended' },
  filterPresetCurrentDoc:{ zh: '当前文档',        en: 'Current Document' },
  filterPresetTopicOnly: { zh: '仅主题',          en: 'Topic Only' },
  filterPresetItemOnly:  { zh: '仅卡片',          en: 'Item Only' },
  filterPresetConceptOnly:    { zh: '仅概念卡',   en: 'Concept Only' },
  filterPresetDescriptorOnly: { zh: '仅描述符卡', en: 'Descriptor Only' },

  // [C] browser/types.ts - getAvailableCardTypeFilters
  cardTypeAll:           { zh: '所有类型',        en: 'All Types' },
  cardTypeItemOnly:      { zh: '仅卡片',          en: 'Item Only' },
  cardTypeTopicOnly:     { zh: '仅主题',          en: 'Topic Only' },
  cardTypeConceptOnly:   { zh: '仅概念卡',        en: 'Concept Only' },
  cardTypeDescriptorOnly:{ zh: '仅描述符卡',      en: 'Descriptor Only' },

  // [C] browser/types.ts - BATCH_ACTIONS
  batchReschedule:       { zh: '重新调度',        en: 'Reschedule' },
  batchReset:            { zh: '重置为新卡',      en: 'Reset to New' },
  batchSuspend:          { zh: '暂停卡片',        en: 'Suspend Card' },
  batchUnsuspend:        { zh: '取消暂停',        en: 'Unsuspend Card' },
  batchSetPriority:      { zh: '设置优先级',      en: 'Set Priority' },
  batchDeleteCard:       { zh: '取消闪卡',        en: 'Remove Card' },

  // [C] useContextMenu - 列显示
  colDue:                { zh: '到期时间',        en: 'Due Date' },
  colStability:          { zh: '稳定性',          en: 'Stability' },
  colRetrievability:     { zh: '可提取性',        en: 'Retrievability' },
  colReps:               { zh: '复习次数',        en: 'Reviews' },
  colLapses:             { zh: '遗忘次数',        en: 'Lapses' },
  colPriority:           { zh: '优先级',          en: 'Priority' },
  sortRandom:            { zh: '随机排序',        en: 'Random Order' },
  cardTypeLabel:         { zh: '卡片类型',        en: 'Card Type' },

  // [C] constants.ts - 排序选项
  sortByReps:            { zh: '按复习次数',      en: 'By Reviews' },
  sortByLapses:          { zh: '按遗忘次数',      en: 'By Lapses' },
  sortByRetrievability:  { zh: '按可提取性',      en: 'By Retrievability' },
  sortByFirstReview:     { zh: '按首次复习',      en: 'By First Review' },
  colLastReview:         { zh: '上次复习',        en: 'Last Review' },
  colNextReview:         { zh: '下次复习',        en: 'Next Review' },
  colFirstReview:        { zh: '首次复习',        en: 'First Review' },

  // [C] ReviewView.vue
  viewSeedList:          { zh: '查看种子块列表',  en: 'View Seed List' },
  roamFromSeed:          { zh: '从种子块开始漫游', en: 'Roam from Seed' },
  removeSeed:            { zh: '移除种子块',      en: 'Remove Seed' },
  viewHistory:           { zh: '查看历史记录',    en: 'View History' },
  clearHistory:          { zh: '清空历史记录',    en: 'Clear History' },

  // [C] ReviewViewController
  lockAsSeed:            { zh: '锁定为种子',      en: 'Lock as Seed' },
  actionNext:            { zh: '下一个',          en: 'Next' },
  actionInsert:          { zh: '插入',            en: 'Insert' },

  // [C] BlockMenuHandler
  finalDrillQueueTitle:  { zh: '刻意练习队列',    en: 'Deliberate Practice Queue' },
  startPracticeTitle:    { zh: '开始练习？',      en: 'Start Practice?' },

  // [C] DialogManager
  selectCardTypeTitle:   { zh: '选择卡片类型',    en: 'Select Card Type' },

  // [C] IncrementalLearningDataSource
  removeFromQueue:       { zh: '从队列移除',      en: 'Remove from Queue' },

  // [C] dataSourceFactory
  neuralRoam:            { zh: '神经漫游',        en: 'Neural Roam' },

  // [C] useCardActions
  markAsTopic2:          { zh: '标记为 Topic',    en: 'Mark as Topic' },
  markAsItem2:           { zh: '标记为 Item',     en: 'Mark as Item' },
  markAsConcept2:        { zh: '标记为概念卡',    en: 'Mark as Concept' },
  markAsDescriptor2:     { zh: '标记为描述符卡',  en: 'Mark as Descriptor' },

  // [C] DeckDataSource
  reviewSubset:          { zh: '复习子集',        en: 'Review Subset' },

  // [C] CardLoadingState
  loading:               { zh: '加载中...',       en: 'Loading...' },
};

let addedCount = 0;
for (const [key, val] of Object.entries(NEW_KEYS)) {
  if (!zh[key]) { zh[key] = val.zh; addedCount++; }
  if (!en[key]) { en[key] = val.en; }
}

fs.writeFileSync(ZH_FILE, JSON.stringify(zh, null, 4), 'utf8');
fs.writeFileSync(EN_FILE, JSON.stringify(en, null, 2), 'utf8');
console.log(`✓ 补全完成，新增 key 数: ${addedCount}`);
console.log(`  zh_CN.json: ${Object.keys(zh).length} keys`);
console.log(`  en_US.json: ${Object.keys(en).length} keys`);
