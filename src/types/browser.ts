import type { CardFilter } from './unified-data-source';
import { CardState } from './card';
import {
  isNeuralBrowserQueue,
  isRetrievalBrowserQueue,
  normalizeBrowserQueueId,
} from './browser-queue-identity';

export { CardState };

export const STATE_LABELS: Record<CardState, string> = {
  [CardState.New]: '新卡',
  [CardState.Learning]: '学习中',
  [CardState.Review]: '复习',
  [CardState.Relearning]: '重学',
  [CardState.Suspended]: '已暂停',
};

export const STATE_COLORS: Partial<Record<CardState, string>> = {
  [CardState.New]: 'var(--b3-card-info-color)',
  [CardState.Learning]: 'var(--b3-card-warning-color)',
  [CardState.Review]: 'var(--b3-card-success-color)',
  [CardState.Relearning]: 'var(--b3-card-error-color)',
  [CardState.Suspended]: 'var(--b3-card-error-color)',
};

export type BrowserCardType =
  | 'topic'
  | 'item'
  | 'concept'
  | 'descriptor'
  | 'incremental'
  | 'webpage';

export interface BrowserCardMeta extends Record<string, unknown> {
  templateID?: string;
  content?: string;
  deckId?: string;
  rootId?: string;
  box?: string;
  path?: string;
  hPath?: string;
  blockType?: string;
  isDocument?: boolean;
  suspended?: boolean;
  note?: string;
  isIncomplete?: boolean;
  fieldMapping?: Record<string, string>;
}

export interface BrowserCard {
  id: string;
  cardId?: string;
  fsrsCardId?: string;
  blockId: string;
  deckId: string;
  content: string;
  fullContent?: string;
  rootId?: string;
  state: CardState;
  stateLabel: string;
  due: Date;
  dueFormatted: string;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: Date | null;
  lastReviewFormatted: string;
  interval: number;
  firstReview: Date | null;
  firstReviewFormatted: string;
  priority: number;
  suspended: boolean;
  tags?: string[];
  note?: string;
  queueIndex?: number;
  cardType?: BrowserCardType;
  aFactor?: number;
  meta?: BrowserCardMeta;
}

export interface FilterPreset {
  key: string;
  label: string;
  i18nKey: string;
  icon?: string;
  description?: string;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { key: 'all', i18nKey: 'filterPresetAll', label: '全部卡片', icon: 'iconRiffCard' },
  { key: 'due', i18nKey: 'filterPresetDue', label: '今日到期', icon: 'iconToday' },
  { key: 'overdue', i18nKey: 'filterPresetOverdue', label: '已过期', icon: 'iconClose' },
  { key: 'new', i18nKey: 'filterPresetNew', label: '新卡片', icon: 'iconAdd' },
  { key: 'learning', i18nKey: 'filterPresetLearning', label: '学习中', icon: 'iconPlay' },
  { key: 'leech', i18nKey: 'filterPresetLeech', label: '难点卡片', icon: 'iconBug' },
  { key: 'suspended', i18nKey: 'filterPresetSuspended', label: '已暂停', icon: 'iconPause' },
  { key: 'cdf-abnormal', i18nKey: 'filterPresetCdfAbnormal', label: 'CDF 异常', icon: 'iconWarning' },
  { key: 'cdf-orphaned', i18nKey: 'filterPresetCdfOrphaned', label: 'CDF 孤儿关系', icon: 'iconUnlink' },
  { key: 'cdf-duplicate', i18nKey: 'filterPresetCdfDuplicate', label: 'CDF 重复关系', icon: 'iconCopy' },
  { key: 'cdf-legacy-unavailable', i18nKey: 'filterPresetCdfLegacyUnavailable', label: 'CDF 旧关系不可用', icon: 'iconHistory' },
  { key: 'cdf-content-incomplete', i18nKey: 'filterPresetCdfContentIncomplete', label: 'CDF 内容不完整', icon: 'iconEdit' },
  { key: 'current-doc', i18nKey: 'filterPresetCurrentDoc', label: '当前文档', icon: 'iconFile' },
  { key: 'topic-only', i18nKey: 'filterPresetTopicOnly', label: '仅 Topic', icon: 'iconFile' },
  { key: 'item-only', i18nKey: 'filterPresetItemOnly', label: '仅 Item', icon: 'iconCheck' },
  { key: 'concept-only', i18nKey: 'filterPresetConceptOnly', label: '仅 Concept', icon: 'iconBrain' },
  { key: 'descriptor-only', i18nKey: 'filterPresetDescriptorOnly', label: '仅 Descriptor', icon: 'iconTag' },
];

export type CardTypeFilter =
  | 'all'
  | 'topic-only'
  | 'item-only'
  | 'concept-only'
  | 'descriptor-only'
  | 'missing-block-only';

export function getAvailableCardTypeFilters(
  queueId: string | null,
  _context?: { docId?: string | null },
): Array<{ value: CardTypeFilter; i18nKey: string; label: string }> {
  const normalizedQueueId = normalizeBrowserQueueId(queueId);
  if (isRetrievalBrowserQueue(normalizedQueueId) || normalizedQueueId === 'final-drill') {
    return [
      { value: 'all', i18nKey: 'cardTypeAll', label: '所有类型' },
      { value: 'item-only', i18nKey: 'cardTypeItemOnly', label: '仅 Item' },
      { value: 'descriptor-only', i18nKey: 'cardTypeDescriptorOnly', label: '仅 Descriptor' },
    ];
  }

  if (isNeuralBrowserQueue(normalizedQueueId)) {
    return [
      { value: 'concept-only', i18nKey: 'cardTypeConceptOnly', label: '仅 Concept' },
    ];
  }

  return [
    { value: 'all', i18nKey: 'cardTypeAll', label: '所有类型' },
    { value: 'topic-only', i18nKey: 'cardTypeTopicOnly', label: '仅 Topic' },
    { value: 'item-only', i18nKey: 'cardTypeItemOnly', label: '仅 Item' },
    { value: 'concept-only', i18nKey: 'cardTypeConceptOnly', label: '仅 Concept' },
    { value: 'descriptor-only', i18nKey: 'cardTypeDescriptorOnly', label: '仅 Descriptor' },
  ];
}

export type BatchAction =
  | 'reschedule'
  | 'reset'
  | 'suspend'
  | 'unsuspend'
  | 'priority'
  | 'delete';

export interface BatchActionDef {
  key: BatchAction;
  label: string;
  i18nKey: string;
  icon: string;
  shortcut?: string;
  danger?: boolean;
}

export const BATCH_ACTIONS: BatchActionDef[] = [
  { key: 'reschedule', i18nKey: 'batchReschedule', label: '重新调度', icon: 'iconCalendar', shortcut: 'Ctrl+J' },
  { key: 'reset', i18nKey: 'batchReset', label: '重置为新卡', icon: 'iconRefresh', shortcut: 'Ctrl+Shift+R' },
  { key: 'suspend', i18nKey: 'batchSuspend', label: '暂停卡片', icon: 'iconPause', shortcut: 'Ctrl+K' },
  { key: 'unsuspend', i18nKey: 'batchUnsuspend', label: '恢复卡片', icon: 'iconPlay', shortcut: 'Ctrl+Shift+K' },
  { key: 'priority', i18nKey: 'batchSetPriority', label: '设置优先级', icon: 'iconMark', shortcut: 'Ctrl+P' },
  { key: 'delete', i18nKey: 'batchDeleteCard', label: '取消闪卡', icon: 'iconTrashcan', shortcut: 'Del', danger: true },
];

export interface RescheduleOptions {
  mode: 'absolute' | 'relative';
  absoluteDate?: Date;
  relativeDays?: number;
}

export interface BrowserConfig {
  pageSize: number;
  showPreview: boolean;
  previewWidth: number;
}

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  pageSize: 100,
  showPreview: true,
  previewWidth: 350,
};

export function calculateRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `明天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === -1) {
    return '昨天';
  }
  if (diffDays < -1) {
    return `已过期 ${Math.abs(diffDays)} 天`;
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDueDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatHistoryDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncateContent(text: string, maxLength = 100): string {
  const cleaned = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}...`;
}

function readBrowserProjectionString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBrowserProjectionNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function readBrowserFaceContent(meta: Record<string, unknown>): string {
  const faces = Array.isArray(meta.faces) ? meta.faces : [];
  if (faces.length === 0) {
    return '';
  }

  const faceIndex = readBrowserProjectionNumber(meta.faceIndex) ?? 0;
  const face = faces[Math.min(faceIndex, faces.length - 1)];
  if (!face || typeof face !== 'object') {
    return '';
  }

  const record = face as Record<string, unknown>;
  return [
    readBrowserProjectionString(record.question),
    readBrowserProjectionString(record.answer),
  ].filter(Boolean).join('\n').trim();
}

export function resolveBrowserCardFullContent(input: {
  meta?: Record<string, unknown> | null;
  content?: unknown;
  title?: unknown;
  imageOcclusionPrompt?: unknown;
}): string {
  const meta = input.meta || {};
  return (
    readBrowserProjectionString(meta.content)
    || readBrowserProjectionString(meta.title)
    || readBrowserProjectionString(meta.imageOcclusionPrompt)
    || readBrowserFaceContent(meta)
    || readBrowserProjectionString(input.content)
    || readBrowserProjectionString(input.title)
    || readBrowserProjectionString(input.imageOcclusionPrompt)
  );
}

export interface IBreadcrumbItem {
  id: string;
  content?: string;
  hpath?: string;
  name?: string;
  type?: string;
  subType?: string;
  children?: unknown[];
}

export type BrowserPreviewSource = 'selected-card' | 'breadcrumb';
export type BrowserViewMode = 'flat' | 'hierarchy';

const NON_TRANSLATED_CARD_TYPE_FILTER_LABELS: Partial<Record<CardTypeFilter, string>> = {
  'topic-only': '仅 Topic',
  'item-only': '仅 Item',
  'concept-only': '仅 Concept',
  'descriptor-only': '仅 Descriptor',
};

export function getCardTypeFilterDisplayLabel(value: CardTypeFilter): string | undefined {
  return NON_TRANSLATED_CARD_TYPE_FILTER_LABELS[value];
}

export type BrowserMode = 'dialog' | 'tab' | 'dock';
export type BrowserGlobalScope = '__all__' | '__dismissed__';
export type NeuralSubview = 'concept-cards' | 'engine-history' | 'roam-history' | 'worldline-anchors';

export interface BrowserOpenState {
  queueId?: string | null;
  globalScope?: BrowserGlobalScope | null;
  scopeDocIds?: string[] | null;
  docId?: string | null;
  queryText?: string;
  preset?: string | null;
  cardType?: CardTypeFilter | null;
  filter?: CardFilter | null;
  neuralSubview?: NeuralSubview | null;
}

export interface GlobalStats {
  total: number;
  new: number;
  learning: number;
  review: number;
  due: number;
  overdue: number;
  suspended: number;
}

export interface QueueStats {
  active: string;
  counts: Record<string, number>;
}

export interface NumberCondition {
  operator: '<' | '>' | '<=' | '>=' | '=' | '!=';
  value: number;
}

export interface ParsedBrowserQuery {
  text: string;
  tags: string[];
  decks: string[];
  states: CardState[];
  docs: string[];
  conditions: {
    priority?: NumberCondition[];
    interval?: NumberCondition[];
    reps?: NumberCondition[];
    lapses?: NumberCondition[];
    difficulty?: NumberCondition[];
    retrievability?: NumberCondition[];
    stability?: NumberCondition[];
  };
}

export function parseQuery(input: string): ParsedBrowserQuery {
  const tokens = (input || '').trim().split(/\s+/).filter(Boolean);
  const tags: string[] = [];
  const decks: string[] = [];
  const docs: string[] = [];
  const states: CardState[] = [];
  const freeText: string[] = [];

  const conditions: ParsedBrowserQuery['conditions'] = {
    priority: [],
    interval: [],
    reps: [],
    lapses: [],
    difficulty: [],
    retrievability: [],
    stability: [],
  };

  const pushUnique = (arr: string[], v: string) => {
    if (v && !arr.includes(v)) arr.push(v);
  };

  const fieldAliases: Record<string, keyof ParsedBrowserQuery['conditions']> = {
    prior: 'priority',
    priority: 'priority',
    intrv: 'interval',
    interval: 'interval',
    reps: 'reps',
    lapses: 'lapses',
    dif: 'difficulty',
    difficulty: 'difficulty',
    fi: 'retrievability',
    retrievability: 'retrievability',
    af: 'stability',
    stability: 'stability',
  };

  const parseNumberCondition = (token: string): boolean => {
    let normalizedToken = token
      .replace(/＜/g, '<')
      .replace(/＞/g, '>')
      .replace(/＝/g, '=')
      .replace(/！/g, '!');

    normalizedToken = normalizedToken
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&le;/g, '<=')
      .replace(/&ge;/g, '>=');

    const match = normalizedToken.match(/^([a-zA-Z_]+)(<=|>=|<|>|=|!=)(-?\d+(\.\d+)?)$/);
    if (!match) return false;

    const [, field, operator, valueStr] = match;
    const fieldName = fieldAliases[field.toLowerCase()];
    if (!fieldName) return false;

    const value = Number.parseFloat(valueStr);
    if (Number.isNaN(value)) return false;

    conditions[fieldName]!.push({ operator: operator as NumberCondition['operator'], value });
    return true;
  };

  for (const token of tokens) {
    if (parseNumberCondition(token)) {
      continue;
    }

    const idx = token.indexOf(':');
    if (idx <= 0) {
      freeText.push(token);
      continue;
    }

    const key = token.slice(0, idx).toLowerCase();
    const rawValue = token.slice(idx + 1).trim();
    if (!rawValue) continue;

    if (key === 'tag') {
      pushUnique(tags, rawValue.replace(/^#+|#+$/g, ''));
      continue;
    }
    if (key === 'deck') {
      pushUnique(decks, rawValue);
      continue;
    }
    if (key === 'doc') {
      pushUnique(docs, rawValue);
      continue;
    }
    if (key === 'state') {
      const parts = rawValue.split(/[\/,|]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      for (const p of parts) {
        if (p === 'new') states.push(CardState.New);
        else if (p === 'review') states.push(CardState.Review);
        else if (p === 'learning') states.push(CardState.Learning);
        else if (p === 'relearning') states.push(CardState.Relearning);
      }
      continue;
    }

    freeText.push(token);
  }

  return {
    text: freeText.join(' ').trim(),
    tags,
    decks,
    states: Array.from(new Set(states)),
    docs,
    conditions,
  };
}

export function checkNumberCondition(actualValue: number, conditions: NumberCondition[]): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((cond) => {
    switch (cond.operator) {
      case '<': return actualValue < cond.value;
      case '>': return actualValue > cond.value;
      case '<=': return actualValue <= cond.value;
      case '>=': return actualValue >= cond.value;
      case '=': return actualValue === cond.value;
      case '!=': return actualValue !== cond.value;
      default: return true;
    }
  });
}

export function matchesParsedQuery(card: BrowserCard, parsed: ParsedBrowserQuery): boolean {
  if (parsed.decks.length && !parsed.decks.includes(card.deckId)) return false;
  if (parsed.states.length && !parsed.states.includes(card.state)) return false;
  if (parsed.docs.length && (!card.rootId || !parsed.docs.includes(card.rootId))) return false;

  if (parsed.tags.length) {
    const tags = card.tags || [];
    if (!parsed.tags.every((tag) => tags.includes(tag))) return false;
  }

  if (parsed.text) {
    const q = parsed.text.toLowerCase();
    if (!(card.fullContent || card.content || '').toLowerCase().includes(q)) return false;
  }

  const conds = parsed.conditions;
  if (conds.priority && !checkNumberCondition(card.priority ?? 50, conds.priority)) return false;
  if (conds.interval && !checkNumberCondition(card.interval ?? 0, conds.interval)) return false;
  if (conds.reps && !checkNumberCondition(card.reps ?? 0, conds.reps)) return false;
  if (conds.lapses && !checkNumberCondition(card.lapses ?? 0, conds.lapses)) return false;
  if (conds.difficulty && card.difficulty !== undefined && !checkNumberCondition(card.difficulty, conds.difficulty)) return false;
  if (conds.retrievability && card.retrievability !== undefined && !checkNumberCondition(card.retrievability, conds.retrievability)) return false;
  if (conds.stability && card.stability !== undefined && !checkNumberCondition(card.stability, conds.stability)) return false;

  return true;
}

type BrowserCardIdentityLike = Pick<BrowserCard, 'id' | 'blockId' | 'cardId' | 'fsrsCardId'>;

export function resolveBrowserCardActionId(
  card: BrowserCardIdentityLike | null | undefined,
): string {
  return String(card?.fsrsCardId || card?.cardId || card?.id || '').trim();
}

export function resolveBrowserCardStableId(
  card: BrowserCardIdentityLike | null | undefined,
): string {
  return resolveBrowserCardActionId(card) || String(card?.blockId || '').trim();
}

export type SortValueType = 'number' | 'date' | 'string' | 'boolean';

export interface SortDisplayContract {
  colId: string;
  aliases?: string[];
  valueType: SortValueType;
  getRawValue: (row: BrowserCard) => unknown;
  formatDisplayValue?: (row: BrowserCard) => string;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function formatNumberValue(value: unknown): string {
  const parsed = toFiniteNumber(value);
  return parsed == null ? '-' : String(parsed);
}

const SORT_DISPLAY_CONTRACTS: ReadonlyArray<SortDisplayContract> = Object.freeze([
  {
    colId: 'priority',
    valueType: 'number',
    getRawValue: (row) => row.priority,
    formatDisplayValue: (row) => formatNumberValue(row.priority),
  },
  {
    colId: 'interval',
    valueType: 'number',
    getRawValue: (row) => row.interval,
    formatDisplayValue: (row) => formatNumberValue(row.interval),
  },
  {
    colId: 'reps',
    valueType: 'number',
    getRawValue: (row) => row.reps,
    formatDisplayValue: (row) => formatNumberValue(row.reps),
  },
  {
    colId: 'lapses',
    valueType: 'number',
    getRawValue: (row) => row.lapses,
    formatDisplayValue: (row) => formatNumberValue(row.lapses),
  },
  {
    colId: 'retrievability',
    valueType: 'number',
    getRawValue: (row) => row.retrievability,
    formatDisplayValue: (row) => formatNumberValue(row.retrievability),
  },
  {
    colId: 'difficulty',
    valueType: 'number',
    getRawValue: (row) => row.difficulty,
    formatDisplayValue: (row) => formatNumberValue(row.difficulty),
  },
  {
    colId: 'stability',
    valueType: 'number',
    getRawValue: (row) => row.stability,
    formatDisplayValue: (row) => formatNumberValue(row.stability),
  },
  {
    colId: 'due',
    aliases: ['dueFormatted'],
    valueType: 'date',
    getRawValue: (row) => row.due,
    formatDisplayValue: (row) => formatDueDate(toDateValue(row.due)),
  },
  {
    colId: 'lastReview',
    aliases: ['lastReviewFormatted'],
    valueType: 'date',
    getRawValue: (row) => row.lastReview,
    formatDisplayValue: (row) => formatHistoryDate(toDateValue(row.lastReview)),
  },
  {
    colId: 'firstReview',
    aliases: ['firstReviewFormatted'],
    valueType: 'date',
    getRawValue: (row) => row.firstReview,
    formatDisplayValue: (row) => formatHistoryDate(toDateValue(row.firstReview)),
  },
]);

const CONTRACT_BY_COL_ID = new Map<string, SortDisplayContract>();
for (const contract of SORT_DISPLAY_CONTRACTS) {
  CONTRACT_BY_COL_ID.set(contract.colId, contract);
  for (const alias of contract.aliases || []) {
    CONTRACT_BY_COL_ID.set(alias, contract);
  }
}

export function getSortDisplayContract(colId: unknown): SortDisplayContract | null {
  if (typeof colId !== 'string') return null;
  const normalized = colId.trim();
  return normalized ? CONTRACT_BY_COL_ID.get(normalized) || null : null;
}

export function normalizeSortContractColId(colId: unknown): string | null {
  const contract = getSortDisplayContract(colId);
  if (contract) return contract.colId;
  if (typeof colId !== 'string') return null;
  const normalized = colId.trim();
  return normalized || null;
}

export function getSortContractRawValue(row: BrowserCard, colId: unknown): unknown {
  const contract = getSortDisplayContract(colId);
  if (contract) return contract.getRawValue(row);

  const normalizedColId = normalizeSortContractColId(colId);
  if (!normalizedColId) return undefined;
  return (row as unknown as Record<string, unknown>)?.[normalizedColId];
}

export function getSortContractValueType(colId: unknown): SortValueType | null {
  return getSortDisplayContract(colId)?.valueType || null;
}

export function formatSortContractDisplayValue(row: BrowserCard, colId: unknown): string | null {
  const contract = getSortDisplayContract(colId);
  if (!contract || typeof contract.formatDisplayValue !== 'function') return null;
  return contract.formatDisplayValue(row);
}
