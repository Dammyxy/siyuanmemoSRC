/**
 * Riff API 响应规范化工具
 *
 * 统一处理 Riff API 返回的数据格式，消除代码重复。
 *
 * @module normalizers
 */

import type { QueueItem } from '../../queue/types';
import { normalizeRiffCardId, normalizeBlockId, normalizeDeckId } from '../../queue/abstraction/QueueCardRef';
import { DEFAULT_PRIORITY } from '../../queue/abstraction/IPriority';

type UnknownRecord = Record<string, unknown>;
type NextDues = Record<1 | 2 | 3 | 4, string>;

export type RiffQueueItem = QueueItem & {
  cardID: string;
  blockID: string;
  deckID: string;
  cardId?: string;
  blockId?: string;
  deckId?: string;
};

const EMPTY_NEXT_DUES: NextDues = { 1: '', 2: '', 3: '', 4: '' };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function toOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function toStringOrEmpty(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function pickNextDuesSource(input: unknown): UnknownRecord | null {
  if (!isRecord(input)) {
    return null;
  }
  const nextDues = input.nextDues;
  return isRecord(nextDues) ? nextDues : null;
}

/**
 * 规范化 nextDues 字段
 *
 * Riff API 返回的 nextDues 格式不统一：
 * - 可能是对象: { 1: "2024-01-01", 2: "2024-01-02", ... }
 * - 可能是对象: { again: "2024-01-01", hard: "2024-01-02", good: "2024-01-03", easy: "2024-01-04" }
 * - 可能是数组
 * - 可能是 undefined
 *
 * @param input - Riff API 返回的原始数据对象（包含 nextDues 字段）
 * @returns 统一格式的 nextDues 对象，键为 1-4，值为 ISO 日期字符串或空字符串
 */
export function normalizeNextDues(input: unknown): NextDues {
  const next = pickNextDuesSource(input);
  if (!next) {
    return { ...EMPTY_NEXT_DUES };
  }

  const byNumber: NextDues = {
    1: toStringOrEmpty(next[1] ?? next['1']),
    2: toStringOrEmpty(next[2] ?? next['2']),
    3: toStringOrEmpty(next[3] ?? next['3']),
    4: toStringOrEmpty(next[4] ?? next['4']),
  };

  if (byNumber[1] || byNumber[2] || byNumber[3] || byNumber[4]) {
    return byNumber;
  }

  return {
    1: toStringOrEmpty(next.again),
    2: toStringOrEmpty(next.hard),
    3: toStringOrEmpty(next.good),
    4: toStringOrEmpty(next.easy),
  };
}

/**
 * 规范化卡片数据为 QueueItem
 *
 * 从 Riff API 返回的原始卡片数据中提取和规范化字段，
 * 转换为标准的 QueueItem 格式。
 *
 * @param raw - Riff API 返回的原始卡片数据
 * @param fallbackDeckID - 默认 deck ID，当 raw 中没有 deckID 时使用
 * @returns QueueItem 对象，如果数据无效则返回 null
 */
export function normalizeDueCard(
  raw: unknown,
  fallbackDeckID: string
): RiffQueueItem | null {
  const cardID = normalizeRiffCardId(raw);
  const blockID = normalizeBlockId(raw);
  const deckID = normalizeDeckId(raw, fallbackDeckID);

  if (!cardID || !blockID) {
    return null;
  }

  const record = isRecord(raw) ? raw : {};

  return {
    id: cardID,
    blockId: blockID,
    deckId: deckID,
    cardID,
    blockID,
    deckID,
    cardId: cardID,
    priority: DEFAULT_PRIORITY,
    nextDues: normalizeNextDues(raw),
    state: toOptionalNumber(record.state),
    lapses: toOptionalNumber(record.lapses),
    reps: toOptionalNumber(record.reps),
  };
}

// ============================================================================
// 重新导出已有的规范化函数（从 QueueCardRef.ts）
// ============================================================================

/**
 * 规范化 Riff 卡片 ID
 *
 * 支持多种可能的字段名称：riffCardID, riffCardId, cardID, cardId, riffCard.id, riffCard.ID
 *
 * @deprecated 请直接从 `../../queue/abstraction/QueueCardRef` 导入
 * @see {@link normalizeRiffCardId}
 */
export { normalizeRiffCardId } from '../../queue/abstraction/QueueCardRef';

/**
 * 规范化块 ID
 *
 * 支持多种可能的字段名称：blockID, blockId, block_id, id
 *
 * @deprecated 请直接从 `../../queue/abstraction/QueueCardRef` 导入
 * @see {@link normalizeBlockId}
 */
export { normalizeBlockId } from '../../queue/abstraction/QueueCardRef';

/**
 * 规范化卡包 ID
 *
 * 支持多种可能的字段名称：deckID, deckId, deck_id
 * 如果所有字段都不存在，使用 fallbackDeckID
 *
 * @deprecated 请直接从 `../../queue/abstraction/QueueCardRef` 导入
 * @see {@link normalizeDeckId}
 */
export { normalizeDeckId } from '../../queue/abstraction/QueueCardRef';
