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
 *
 * @example
 * ```typescript
 * // 数字键格式
 * normalizeNextDues({ nextDues: { 1: "2024-01-01", 2: "2024-01-02" } });
 * // => { 1: "2024-01-01", 2: "2024-01-02", 3: "", 4: "" }
 *
 * // 文本键格式
 * normalizeNextDues({ nextDues: { again: "2024-01-01", hard: "2024-01-02" } });
 * // => { 1: "2024-01-01", 2: "2024-01-02", 3: "", 4: "" }
 *
 * // 空值处理
 * normalizeNextDues({});
 * // => { 1: "", 2: "", 3: "", 4: "" }
 * ```
 */
export function normalizeNextDues(input: any): Record<1 | 2 | 3 | 4, string> {
  const next = input?.nextDues;
  if (!next) return { 1: '', 2: '', 3: '', 4: '' };

  if (typeof next === 'object') {
    // 尝试数字键: { 1: "...", 2: "...", ... }
    const byNum = {
      1: String((next as any)[1] ?? (next as any)['1'] ?? ''),
      2: String((next as any)[2] ?? (next as any)['2'] ?? ''),
      3: String((next as any)[3] ?? (next as any)['3'] ?? ''),
      4: String((next as any)[4] ?? (next as any)['4'] ?? ''),
    };
    if (byNum[1] || byNum[2] || byNum[3] || byNum[4]) return byNum;

    // 尝试文本键: { again: "...", hard: "...", good: "...", easy: "..." }
    return {
      1: String((next as any).again ?? ''),
      2: String((next as any).hard ?? ''),
      3: String((next as any).good ?? ''),
      4: String((next as any).easy ?? ''),
    };
  }

  return { 1: '', 2: '', 3: '', 4: '' };
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
 *
 * @remarks
 * **验证规则**:
 * - cardID 和 blockID 必须非空，否则返回 null
 * - state、lapses、reps 必须是有限数字，否则设为 undefined
 * - priority 使用默认值
 *
 * @example
 * ```typescript
 * const raw = {
 *   riffCardID: "card-123",
 *   blockID: "block-456",
 *   deckID: "deck-789",
 *   nextDues: { 1: "2024-01-01" },
 *   state: 2,
 *   lapses: 0,
 *   reps: 5
 * };
 *
 * const item = normalizeDueCard(raw, "default-deck");
 * // => { cardID: "card-123", blockID: "block-456", deckID: "deck-789", ... }
 * ```
 */
export function normalizeDueCard(
  raw: any,
  fallbackDeckID: string
): QueueItem | null {
  // 使用统一的规范化函数
  const cardID = normalizeRiffCardId(raw);
  const blockID = normalizeBlockId(raw);
  const deckID = normalizeDeckId(raw, fallbackDeckID);

  // 验证必需字段
  if (!cardID || !blockID) return null;

  return {
    cardID,
    blockID,
    deckID,
    priority: DEFAULT_PRIORITY,
    nextDues: normalizeNextDues(raw),
    state: Number.isFinite(Number(raw?.state)) ? Number(raw?.state) : undefined,
    lapses: Number.isFinite(Number(raw?.lapses)) ? Number(raw?.lapses) : undefined,
    reps: Number.isFinite(Number(raw?.reps)) ? Number(raw?.reps) : undefined,
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
