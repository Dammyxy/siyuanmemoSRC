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
import { IncrementalLearningDataSource } from '../datasource/IncrementalLearningDataSource';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DataSourceFactory');

type I18nDictionary = Record<string, string>;
type I18nContextLike = {
  getI18n?: () => I18nDictionary | undefined;
};
type I18nPluginLike = {
  getContext?: () => I18nContextLike | undefined;
  i18n?: I18nDictionary;
};
type QueueDataSourcePlugin = ConstructorParameters<typeof FinalDrillDataSource>[2];
type DeckDataSourcePlugin = ConstructorParameters<typeof DeckDataSource>[2];
type BlockIdsPlugin = ConstructorParameters<typeof BlockIdsDataSource>[0]['plugin'];
function isI18nPluginLike(value: unknown): value is I18nPluginLike {
  return typeof value === 'object' && value !== null;
}

function asQueueDataSourcePlugin(plugin: unknown): QueueDataSourcePlugin {
  return plugin as QueueDataSourcePlugin;
}

function asDeckDataSourcePlugin(plugin: unknown): DeckDataSourcePlugin {
  return plugin as DeckDataSourcePlugin;
}

function asBlockIdsPlugin(plugin: unknown): BlockIdsPlugin {
  return plugin as BlockIdsPlugin;
}

function resolveI18nLabel(plugin: unknown, key: string, fallback: string): string {
  if (!isI18nPluginLike(plugin)) {
    return fallback;
  }
  const i18n = plugin.getContext?.()?.getI18n?.() || plugin.i18n;
  return i18n?.[key] ?? fallback;
}

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
 * @param manager - UnifiedDataSourceManager 实例
 * @param options - 筛选选项
 * @param plugin - Plugin 实例（用于访问 ApplicationContext）
 * @returns 数据源实例或 null
 */
export function createQueueDataSource(
  queueId: string,
  manager: IUnifiedDataSourceManagerFacade,
  options: DataSourceOptionsWithDoc,
  plugin?: unknown
): ICardDataSource | null {
  const { docId, preset, queryText, cardType } = options;

  // ✅ 所有队列都使用新架构数据源
  switch (queueId) {
    case 'final-drill':
      return new FinalDrillDataSource(manager, {
        docId,
        preset,
        queryText,
        cardType,
      }, asQueueDataSourcePlugin(plugin));

    case 'retrieval':
      return new RetrievalDataSource(manager, {
        docId,
        preset,
        queryText,
        cardType,
      }, asQueueDataSourcePlugin(plugin));

    case 'filter-group':
      return new FilterGroupDataSource(manager, {
        docId,
        preset,
        queryText,
        cardType,
      }, asQueueDataSourcePlugin(plugin));

    case 'incremental-learning':
      return new IncrementalLearningDataSource(manager, {
        docId,
        preset,
        queryText,
        cardType,
      }, asQueueDataSourcePlugin(plugin));

    case 'neural-roam':
      // 神经漫游队列：使用 BlockIds 数据源
      // 🆕 使用动态获取函数，确保每次都获取最新的种子列表
      const neuralQueue = manager.getQueue(QueueType.NeuralRoam);
      return new BlockIdsDataSource({
        id: 'neural-roam',
        label: resolveI18nLabel(plugin, 'neuralRoam', 'Neural Roam'),
        blockIds: [],  // 初始为空，使用动态获取函数
        plugin: { neuralQueue },  // 🔧 直接传递 neuralQueue 对象
        queueId: 'neural-roam',
        getBlockIdsFn: () => {
          // 每次 fetchRows 时都获取最新的种子列表
          const seeds = neuralQueue?.getSeedBlocks?.() || [];
          logger.info(`Neural roam seeds: ${seeds.length}`, seeds);
          return seeds;
        },
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
 * @param getBlockIdsFn - 可选的动态获取函数
 * @returns 数据源实例
 */
export function createBlockIdsDataSource(
  queueId: string,
  blockIds: string[],
  plugin: unknown,
  getBlockIdsFn?: () => string[]
): ICardDataSource {
  return new BlockIdsDataSource({
    id: queueId,
    label: queueId,
    blockIds,
    plugin: asBlockIdsPlugin(plugin),
    queueId,
    getBlockIdsFn,
  });
}

/**
 * 创建 Deck 数据源（五重筛选）
 * 
 * @param manager - UnifiedDataSourceManager 实例
 * @param options - 筛选选项
 * @param currentDocId - 当前文档 ID（fallback）
 * @param plugin - 插件实例（可选，用于特殊功能）
 * @returns 数据源实例
 */
export function createDeckDataSource(
  manager: IUnifiedDataSourceManagerFacade,
  options: DataSourceOptionsWithDoc,
  currentDocId?: string | null,
  plugin?: unknown
): ICardDataSource {
  const { docId, preset, queryText, cardType } = options;

  return new DeckDataSource(
    manager, 
    {
      preset,
      currentDocId: docId || currentDocId,
      queryText,
      cardType,
    },
    asDeckDataSourcePlugin(plugin)
  );
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
 * @param manager - UnifiedDataSourceManager 实例
 * @param options - 筛选选项（不含 docId）
 * @param plugin - Plugin 实例（用于访问 ApplicationContext）
 * @returns 数据源实例或 null
 */
export function createFocusDataSource(
  queueId: string | null,
  manager: IUnifiedDataSourceManagerFacade,
  options: DataSourceOptions,
  plugin?: unknown
): ICardDataSource | null {
  const { preset, queryText, cardType } = options;

  // 队列模式：创建不含文档筛选的队列数据源
  if (queueId === 'final-drill') {
    return new FinalDrillDataSource(manager, {
      preset,
      queryText,
      cardType,
    }, asQueueDataSourcePlugin(plugin));
  }

  if (queueId === 'retrieval') {
    return new RetrievalDataSource(manager, {
      preset,
      queryText,
      cardType,
    }, asQueueDataSourcePlugin(plugin));
  }

  if (queueId === 'filter-group') {
    return new FilterGroupDataSource(manager, {
      preset,
      queryText,
      cardType,
    }, asQueueDataSourcePlugin(plugin));
  }

  // ✅ 新增：渐进学习队列
  if (queueId === 'incremental-learning') {
    return new IncrementalLearningDataSource(manager, {
      preset,
      queryText,
      cardType,
    }, asQueueDataSourcePlugin(plugin));
  }

  // 神经漫游队列：使用 BlockIds，支持动态获取
  if (queueId === 'neural-roam') {
    const neuralQueue = manager.getQueue(QueueType.NeuralRoam);
    return new BlockIdsDataSource({
      id: 'neural-roam',
      label: resolveI18nLabel(plugin, 'neuralRoam', 'Neural Roam'),
      blockIds: [],  // 初始为空，使用动态获取函数
      plugin: { neuralQueue },  // 🔧 直接传递 neuralQueue 对象
      queueId: 'neural-roam',
      getBlockIdsFn: () => {
        const seeds = neuralQueue?.getSeedBlocks?.() || [];
        logger.info(`Neural roam seeds (focus): ${seeds.length}`, seeds);
        return seeds;
      },
    });
  }
  
  // 全部卡片模式：创建不含文档筛选的 DeckDataSource
  if (!queueId) {
    return new DeckDataSource(
      manager, 
      {
        preset,
        currentDocId: undefined,  // 不传文档 ID，获取所有文档的数据
        queryText,
        cardType,
      },
      asDeckDataSourcePlugin(plugin)
    );
  }

  return null;
}
