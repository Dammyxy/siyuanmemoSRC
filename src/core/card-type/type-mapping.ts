/**
 * 卡片类型映射工具
 * 
 * 提供卡片类型标记与技术类型之间的映射关系和工具函数。
 * 
 * @see .kiro/specs/card-type-system-enhancement/design.md 第 1.1.2 节
 */

import { CardType } from '@/types/card';
import type { CardTypeMarker } from './CardTypeMarkerService';

/**
 * 类型映射表
 * 
 * 定义卡片类型标记（用户层语义）到技术类型（CardType）的映射关系：
 * - concept（概念卡）→ Concept（使用 FSRS 调度器）
 * - descriptor（描述符卡）→ Descriptor（使用 FSRS 调度器）
 * 
 * 注意：Concept 和 Descriptor 都使用 FSRS 调度器，区别在于语义和神经漫游队列的处理
 */
export const TYPE_MAPPING: Record<CardTypeMarker, CardType> = {
  concept: CardType.Concept,       // 概念卡使用 FSRS 调度器
  descriptor: CardType.Descriptor, // 描述符卡使用 FSRS 调度器
};

/**
 * 反向类型映射表
 * 
 * 从技术类型推导可能的卡片类型标记
 */
export const REVERSE_TYPE_MAPPING: Record<CardType, CardTypeMarker[]> = {
  [CardType.Topic]: [],
  [CardType.Item]: [],
  [CardType.Concept]: ['concept'],
  [CardType.Descriptor]: ['descriptor'],
  [CardType.Incremental]: [],
  [CardType.Webpage]: [],
};

/**
 * 根据类型标记获取技术类型
 * 
 * @param marker - 卡片类型标记
 * @returns 对应的技术类型
 * 
 * @example
 * ```typescript
 * const type = getTechnicalType('concept');
 * console.log(type); // CardType.Concept
 * ```
 */
export function getTechnicalType(marker: CardTypeMarker): CardType {
  return TYPE_MAPPING[marker];
}

/**
 * 根据技术类型获取可能的类型标记
 * 
 * @param type - 技术类型
 * @returns 可能的类型标记列表
 * 
 * @example
 * ```typescript
 * const markers = getPossibleMarkers(CardType.Concept);
 * console.log(markers); // ['concept']
 * ```
 */
export function getPossibleMarkers(type: CardType): CardTypeMarker[] {
  return REVERSE_TYPE_MAPPING[type] || [];
}

/**
 * 验证类型映射是否有效
 * 
 * @param marker - 卡片类型标记
 * @param type - 技术类型
 * @returns 是否匹配映射规则
 * 
 * @example
 * ```typescript
 * const isValid = isValidTypeMapping('concept', CardType.Concept);
 * console.log(isValid); // true
 * 
 * const isInvalid = isValidTypeMapping('concept', CardType.Item);
 * console.log(isInvalid); // false
 * ```
 */
export function isValidTypeMapping(marker: CardTypeMarker, type: CardType): boolean {
  return TYPE_MAPPING[marker] === type;
}

/**
 * 获取类型标记的显示名称
 * 
 * @param marker - 卡片类型标记
 * @returns 显示名称
 * 
 * @example
 * ```typescript
 * const name = getMarkerDisplayName('concept');
 * console.log(name); // '概念卡'
 * ```
 */
export function getMarkerDisplayName(marker: CardTypeMarker): string {
  const names: Record<CardTypeMarker, string> = {
    concept: '概念卡',
    descriptor: '描述符卡',
  };
  return names[marker];
}

/**
 * 获取类型标记的图标
 * 
 * @param marker - 卡片类型标记
 * @returns 图标 emoji
 * 
 * @example
 * ```typescript
 * const icon = getMarkerIcon('concept');
 * console.log(icon); // '🧠'
 * ```
 */
export function getMarkerIcon(marker: CardTypeMarker): string {
  const icons: Record<CardTypeMarker, string> = {
    concept: '🧠',
    descriptor: '🏷️',
  };
  return icons[marker];
}

/**
 * 获取类型标记的描述
 * 
 * @param marker - 卡片类型标记
 * @returns 描述文本
 * 
 * @example
 * ```typescript
 * const desc = getMarkerDescription('concept');
 * console.log(desc); // '表示知识概念，自动进入神经漫游队列'
 * ```
 */
export function getMarkerDescription(marker: CardTypeMarker): string {
  const descriptions: Record<CardTypeMarker, string> = {
    concept: '表示知识概念，自动进入神经漫游队列',
    descriptor: '表示概念的属性或特征，需要父概念卡',
  };
  return descriptions[marker];
}
