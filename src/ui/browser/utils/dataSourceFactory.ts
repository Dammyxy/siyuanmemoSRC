/**
 * DataSource 工厂函数
 * 
 * 统一创建各种数据源的逻辑
 */

import type { ICardDataSource } from '../datasource/types';
import { FinalDrillDataSource } from '../datasource/FinalDrillDataSource';
import { FilterGroupDataSource } from '../datasource/FilterGroupDataSource';
import { RetrievalDataSource } from '../datasource/RetrievalDataSource';
import { DeckDataSource } from '../datasource/DeckDataSource';
import { QueryDataSource } from '../datasource/QueryDataSource';
import { BlockIdsDataSource } from '../datasource/BlockIdsDataSource';

/**
 * 数据源创建选项（基础）
 */
export interface DataSourceOptions {
  preset?: string;
  queryText?: string;
  cardType?: 'all' | 'topic-only' | 'item-only';
}

/**
 * 数据源创建选项（包含文档 ID）
 */
export interface DataSourceOptionsWithDoc extends DataSourceOptions {
  docId?: string | null;
}

/**
 * 创建队列数据源（五重筛选）
 * 
 * @param queueId - 队列 ID
 * @param plugin - 插件实例
 * @param options - 筛选选项
 * @returns 数据源实例或 null
 */
export function createQueueDataSource(
  queueId: string,
  plugin: any,
  options: DataSourceOptionsWithDoc
): ICardDataSource | null {
  const { docId, preset, queryText, cardType } = options;

  switch (queueId) {
    case 'final-drill':
      return new FinalDrillDataSource(plugin, {
        docId,
        preset,
        queryText,
        cardType,
      });

    case 'retrieval':
      return new RetrievalDataSource(plugin, {
        docId,
        preset,
        queryText,
        cardType,
      });

    case 'filter-group':
      return new FilterGroupDataSource(plugin, {
        docId,
        preset,
        queryText,
        cardType,
      });

    default:
      return null;
  }
}

/**
 * 创建 BlockIds 数据源
 * 
 * @param queueId - 队列 ID
 * @param blockIds - 块 ID 列表
 * @param plugin - 插件实例
 * @returns 数据源实例
 */
export function createBlockIdsDataSource(
  queueId: string,
  blockIds: string[],
  plugin: any
): ICardDataSource {
  return new BlockIdsDataSource({
    id: queueId,
    label: queueId,
    blockIds,
    plugin,
    queueId,
  });
}

/**
 * 创建 Deck 数据源（五重筛选）
 * 
 * @param plugin - 插件实例
 * @param options - 筛选选项
 * @param currentDocId - 当前文档 ID（fallback）
 * @returns 数据源实例
 */
export function createDeckDataSource(
  plugin: any,
  options: DataSourceOptionsWithDoc,
  currentDocId?: string | null
): ICardDataSource {
  const { docId, preset, queryText, cardType } = options;

  return new DeckDataSource(plugin, {
    preset,
    currentDocId: docId || currentDocId,
    queryText,
    cardType,
  });
}

/**
 * 创建 SQL 查询数据源
 * 
 * @param sqlStmt - SQL 语句
 * @returns 数据源实例
 */
export function createQueryDataSource(sqlStmt: string): ICardDataSource {
  return new QueryDataSource(sqlStmt);
}

/**
 * 创建不含文档筛选的数据源（用于聚焦计算）
 * 
 * @param queueId - 队列 ID（null 表示全部卡片模式）
 * @param plugin - 插件实例
 * @param options - 筛选选项（不含 docId）
 * @param getQueueItems - 获取队列项的函数（仅队列模式需要）
 * @returns 数据源实例或 null
 */
export function createFocusDataSource(
  queueId: string | null,
  plugin: any,
  options: DataSourceOptions,
  getQueueItems?: () => any[]
): ICardDataSource | null {
  const { preset, queryText, cardType } = options;

  // 队列模式：创建不含文档筛选的队列数据源
  if (queueId === 'final-drill') {
    return new FinalDrillDataSource(plugin, {
      preset,
      queryText,
      cardType,
    });
  }

  if (queueId === 'retrieval') {
    return new RetrievalDataSource(plugin, {
      preset,
      queryText,
      cardType,
    });
  }

  if (queueId === 'filter-group') {
    return new FilterGroupDataSource(plugin, {
      preset,
      queryText,
      cardType,
    });
  }

  // 神经漫游队列：使用 BlockIds
  if (queueId && getQueueItems) {
    const items = getQueueItems();
    const blockIds = items.map((it: any) => String(it?.blockID || it?.blockId || '')).filter(Boolean);
    return createBlockIdsDataSource(queueId, blockIds, plugin);
  }

  // 全部卡片模式：创建不含文档筛选的 DeckDataSource
  if (!queueId) {
    return new DeckDataSource(plugin, {
      preset,
      currentDocId: undefined,  // 不传文档 ID，获取所有文档的数据
      queryText,
      cardType,
    });
  }

  return null;
}
